/**
 * PC側メインページ (index.html) — 転送 + 接続状態 + ZIP
 */
import { initFirebase } from '../firebase.js';
import {
  viewFullImage, closeImageModal, downloadModalImage, downloadFile, copyToClipboard,
} from '../ui.js';
import {
  attachFilesListener, attachRelaySidebandListener, EMPTY_FILE_MSG, EMPTY_URL_MSG,
} from '../files-view.js';
import { issueJoinCode } from '../session.js';
import {
  createFileItem, createUrlItem, createTextItem, createMessageItem, prependItem, isHttpUrl,
} from '../file-items.js';
import { createSessionTimer } from '../session-timer.js';
import { renderQRCode } from '../qr-display.js';
import { generateSessionId, generatePin } from '../utils.js';
import { showToast } from '../toast.js';
import { PIN_CODE_LENGTH, TRANSFER_MODE, CONNECTION_STATE } from '../constants.js';
import { subscribeConnectionState, setConnectionState, resetConnectionState, setTransferProgress } from '../connection-state.js';
import { createP2PHost } from '../webrtc/host.js';
import {
  addReceivedBlob, addReceivedFromDataUrl, getReceivedFiles, subscribeReceivedStore, clearReceivedStore,
} from '../received-store.js';
import { downloadFilesAsZip } from '../zip-save.js';
import { registerServiceWorker } from '../pwa.js';
import { watchMobilePresence } from '../relay-presence.js';
import { putOutboxFile, putOutboxText, putOutboxUrl } from '../relay-outbox.js';
import { firebaseConfig } from '../../config.js';

const { db, fs } = initFirebase(firebaseConfig);

let currentSessionId = null;
let currentJoinCode = null;
let detachFiles = null;
let detachRelaySideband = null;
let p2pHost = null;
let transferMode = TRANSFER_MODE.P2P;
let relayMobileConnected = false;
let detachPresence = null;

const timer = createSessionTimer({
  onExpire: () => setTimeout(generateNewSession, 5000),
  elements: {
    container: document.getElementById('sessionTimer'),
    display: document.getElementById('timerDisplay'),
  },
});

const itemHandlers = {
  onDownload: downloadFile,
  onViewImage: viewFullImage,
  onCopy: (text) => copyToClipboard(text, 'コピーしました'),
};

function initPage() {
  if (!currentSessionId) generateQRCode();
}

function setTransferMode(mode) {
  transferMode = mode;
  document.querySelectorAll('[data-transfer-mode]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.transferMode === mode);
  });
  const relayNote = document.getElementById('relayModeNote');
  if (relayNote) relayNote.hidden = mode !== TRANSFER_MODE.RELAY;
  if (currentSessionId) restartTransferLayer();
}

function updateZipButton({ count }) {
  const btn = document.getElementById('downloadZipBtn');
  if (btn) {
    btn.disabled = count === 0;
    btn.textContent = count > 0 ? `ZIPで保存（${count}）` : 'ZIPで保存';
  }
}

const RELAY_TAG = 'サーバー経由';
const DIRECT_TAG = '直接';

function appendP2PFile(file, peerId) {
  addReceivedBlob({ name: file.name, blob: file.blob, mimeType: file.mimeType, source: 'p2p', peerId });
  const url = URL.createObjectURL(file.blob);
  const el = createFileItem({
    id: file.id,
    name: file.name,
    size: file.size ?? file.blob.size,
    mimeType: file.mimeType,
    data: url,
    timestamp: Date.now(),
  }, itemHandlers, { tag: DIRECT_TAG });
  prependItem(document.getElementById('filesList'), el);
  showToast(`${file.name} を受信しました`, 'success');
}

function appendP2PText(text) {
  const el = createMessageItem(text, itemHandlers, { tag: DIRECT_TAG });
  prependItem(document.getElementById('urlsList'), el);
  showToast(isHttpUrl(text) ? 'リンクを受信しました' : 'テキストを受信しました', 'success', 2000);
}

function appendRelayText(item) {
  prependItem(document.getElementById('urlsList'), createTextItem(item, itemHandlers, { tag: RELAY_TAG }));
  showToast('テキストを受信しました', 'success', 2000);
}

function appendRelayUrl(item) {
  prependItem(document.getElementById('urlsList'), createUrlItem(item, itemHandlers, { tag: RELAY_TAG }));
  showToast('リンクを受信しました', 'success', 2000);
}

function appendRelayFile(item) {
  if (item.data) {
    addReceivedFromDataUrl({ name: item.name, dataUrl: item.data, mimeType: item.mimeType, source: 'relay' });
  }
  prependItem(document.getElementById('filesList'), createFileItem(item, itemHandlers, { tag: RELAY_TAG }));
  showToast(`${item.name} を受信しました`, 'success', 2000);
}

function isRelayConnected() {
  return transferMode === TRANSFER_MODE.RELAY && relayMobileConnected;
}

function isSendReady() {
  return (p2pHost?.isConnected?.() ?? false) || isRelayConnected();
}

function updatePcSendPanel(connected) {
  const panel = document.getElementById('pcSendPanel');
  if (panel) panel.dataset.ready = String(Boolean(connected));
  ['pcTextSend', 'pcFileSendBtn'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.disabled = !connected;
  });
  updateComposer();
}

function updateComposer() {
  const input = document.getElementById('pcTextSend');
  const sendBtn = document.getElementById('pcSendBtn');
  const detect = document.getElementById('pcSendDetect');
  const shortcut = document.getElementById('pcSendShortcut');
  const value = input?.value?.trim() || '';
  const ready = isSendReady();
  if (sendBtn) sendBtn.disabled = !ready || !value;
  if (detect) {
    const show = Boolean(value);
    detect.hidden = !show;
    detect.textContent = isHttpUrl(value) ? 'リンクとして送信' : `テキスト · ${value.length}文字`;
    if (shortcut) shortcut.hidden = show;
  }
}

async function onRelayFile(file) {
  if (file.type === 'file' && file.data) {
    await addReceivedFromDataUrl({ name: file.name, dataUrl: file.data, mimeType: file.mimeType, source: 'relay' });
  }
}

async function restartTransferLayer() {
  p2pHost?.stop();
  p2pHost = null;
  relayMobileConnected = false;
  updatePcSendPanel(false);
  if (detachPresence) { try { detachPresence(); } catch { /* noop */ } detachPresence = null; }
  if (detachFiles) { try { detachFiles(); } catch { /* noop */ } detachFiles = null; }
  if (detachRelaySideband) { try { detachRelaySideband(); } catch { /* noop */ } detachRelaySideband = null; }

  if (!currentSessionId) return;

  if (transferMode === TRANSFER_MODE.P2P) {
    detachRelaySideband = attachRelaySidebandListener(db, currentSessionId, {
      onText: appendRelayText,
      onUrl: appendRelayUrl,
      onFile: appendRelayFile,
    });
    p2pHost = createP2PHost({
      db,
      sessionId: currentSessionId,
      onFile: appendP2PFile,
      onText: appendP2PText,
      onPeerConnected: () => updatePcSendPanel(true),
    });
    await p2pHost.start();
    detachPresence = watchMobilePresence(db, currentSessionId, {
      onJoin: () => {
        if (p2pHost?.isConnected?.()) return;
        relayMobileConnected = true;
        setConnectionState(CONNECTION_STATE.CONNECTED, {
          detail: 'スマホが参加しました（サーバー経由フォールバック）',
        });
        updatePcSendPanel(true);
      },
      onLeave: () => {
        if (p2pHost?.isConnected?.()) return;
        relayMobileConnected = false;
        setConnectionState(CONNECTION_STATE.WAITING, { detail: 'スマホからの接続を待っています' });
        updatePcSendPanel(false);
      },
    });
  } else {
    resetConnectionState();
    setConnectionState(CONNECTION_STATE.WAITING, { detail: 'スマホからの接続を待っています' });
    displayFilesRelay();
    detachPresence = watchMobilePresence(db, currentSessionId, {
      onJoin: () => {
        relayMobileConnected = true;
        setConnectionState(CONNECTION_STATE.CONNECTED, {
          detail: 'スマホが接続しました — 双方向で送受信できます',
        });
        updatePcSendPanel(true);
      },
      onLeave: () => {
        relayMobileConnected = false;
        setConnectionState(CONNECTION_STATE.WAITING, { detail: 'スマホからの接続を待っています' });
        updatePcSendPanel(false);
      },
    });
  }
}

async function generateQRCode() {
  p2pHost?.stop();
  if (detachFiles) { try { detachFiles(); } catch { /* noop */ } detachFiles = null; }

  clearReceivedStore();
  document.getElementById('filesList').innerHTML = EMPTY_FILE_MSG;
  document.getElementById('urlsList').innerHTML = EMPTY_URL_MSG;

  currentSessionId = generateSessionId();
  const modeParam = transferMode === TRANSFER_MODE.P2P ? 'p2p' : 'relay';
  const uploadUrl = `${window.location.origin}/upload.html?session=${currentSessionId}&mode=${modeParam}`;
  const pin = generatePin();

  resetConnectionState();
  try {
    renderQRCode(document.getElementById('qrcode'), uploadUrl);
    timer.start();
  } catch { return; }

  document.getElementById('qrUrl').textContent = uploadUrl;
  const ok = await issueJoinCode(db, currentSessionId, pin);
  currentJoinCode = ok ? String(pin).slice(0, PIN_CODE_LENGTH) : null;
  if (!ok) showToast('参加コードの発行に失敗しました', 'error', 4000);
  updateJoinCodeUI();
  await restartTransferLayer();
}

function updateJoinCodeUI() {
  const el = document.getElementById('joinCode');
  if (el) el.textContent = currentJoinCode ? currentJoinCode.replace(/^(\d{3})(\d{3})$/, '$1 $2') : '--- ---';
  const copyBtn = document.getElementById('copyJoinCodeBtn');
  if (copyBtn) copyBtn.disabled = !currentJoinCode;
}

function copyQRUrl() {
  copyToClipboard(document.getElementById('qrUrl').textContent, 'URLをコピーしました');
}

async function shareToPhone() {
  const url = document.getElementById('qrUrl').textContent;
  const code = currentJoinCode;
  const shareData = {
    title: 'シェアっと',
    text: code ? `参加コード: ${code}` : 'ファイルを送ってください',
    url,
  };
  if (navigator.share) {
    try {
      await navigator.share(shareData);
      return;
    } catch { /* cancelled */ }
  }
  copyQRUrl();
}

function copyJoinCode() {
  if (currentJoinCode) copyToClipboard(currentJoinCode, '参加コードをコピーしました');
}

function generateNewSession() {
  timer.stop();
  generateQRCode();
}

function displayFilesRelay() {
  if (!currentSessionId) return;
  detachFiles = attachFilesListener(db, currentSessionId, {
    filesList: document.getElementById('filesList'),
    urlsList: document.getElementById('urlsList'),
    createFileItem: (f) => createFileItem(f, itemHandlers, { tag: RELAY_TAG }),
    createUrlItem: (u) => createUrlItem(u, itemHandlers, { tag: RELAY_TAG }),
    createTextItem: (t) => createTextItem(t, itemHandlers, { tag: RELAY_TAG }),
    onNewFile: onRelayFile,
  });
}

function refreshFiles() {
  if (transferMode === TRANSFER_MODE.RELAY) displayFilesRelay();
  showToast('一覧を更新しました', 'info', 1500);
}

function backToConnected() {
  setTimeout(() => setConnectionState(CONNECTION_STATE.CONNECTED, {
    detail: isRelayConnected() ? '双方向で送受信できます（サーバー経由）' : '双方向で送受信できます',
    progress: 0,
  }), 1500);
}

/** 入力欄の内容を、URL ならリンク、それ以外はテキストとしてスマホへ送る */
async function sendComposerToPhone() {
  const input = document.getElementById('pcTextSend');
  const value = input?.value?.trim();
  if (!value) return;
  if (!isSendReady()) {
    showToast('スマホが接続されていません', 'error');
    return;
  }
  const asUrl = isHttpUrl(value);
  try {
    if (p2pHost?.isConnected()) {
      p2pHost.sendText(value);
    } else if (asUrl) {
      await putOutboxUrl(db, currentSessionId, value);
    } else {
      await putOutboxText(db, currentSessionId, value);
    }
    input.value = '';
    updateComposer();
    showToast(asUrl ? 'スマホへリンクを送信しました' : 'スマホへテキストを送信しました', 'success');
  } catch (e) {
    showToast(e.message || '送信に失敗しました', 'error');
  }
}

async function sendFilesToPhone(fileList) {
  const files = [...(fileList || [])];
  if (files.length === 0) return;
  if (!isSendReady()) {
    showToast('スマホが接続されていません', 'error');
    return;
  }
  try {
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const label = files.length > 1 ? `${file.name}（${i + 1}/${files.length}）` : file.name;
      setConnectionState(CONNECTION_STATE.TRANSFERRING, { detail: `${label} を送信中`, progress: 0 });
      if (p2pHost?.isConnected()) {
        await p2pHost.sendFile(file, (p) => setTransferProgress(p, `${label} を送信中`));
      } else {
        await putOutboxFile(db, currentSessionId, file);
        setTransferProgress(1, label);
      }
    }
    const done = files.length > 1 ? `${files.length}件のファイル` : files[0].name;
    showToast(`${done}をスマホへ送信しました`, 'success');
    setConnectionState(CONNECTION_STATE.COMPLETE, { detail: '送信完了', progress: 1 });
    backToConnected();
  } catch (e) {
    showToast(e.message || '送信に失敗しました', 'error');
    setConnectionState(CONNECTION_STATE.CONNECTED, { detail: '送信に失敗しました。もう一度お試しください', progress: 0 });
  }
}

async function sendFileToPhone() {
  const input = document.getElementById('pcFileSend');
  const files = input?.files;
  if (!files?.length) return;
  await sendFilesToPhone(files);
  input.value = '';
}

function initDropToSend() {
  const overlay = document.getElementById('dropOverlay');
  let depth = 0;
  const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
  const hide = () => { depth = 0; overlay?.classList.remove('show'); };

  window.addEventListener('dragenter', (e) => {
    if (!hasFiles(e) || !isSendReady()) return;
    e.preventDefault();
    depth += 1;
    overlay?.classList.add('show');
  });
  window.addEventListener('dragover', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = isSendReady() ? 'copy' : 'none';
  });
  window.addEventListener('dragleave', () => {
    depth = Math.max(0, depth - 1);
    if (depth === 0) hide();
  });
  window.addEventListener('drop', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    hide();
    if (!isSendReady()) {
      showToast('スマホがつながってから送れます', 'info');
      return;
    }
    sendFilesToPhone(e.dataTransfer.files);
  });
}

function downloadZip() {
  downloadFilesAsZip(getReceivedFiles());
}

function updateConnectionUI(snap) {
  document.body.dataset.connectionState = snap.state;
  const badge = document.getElementById('connectionBadge');
  const detail = document.getElementById('connectionDetail');
  const bar = document.getElementById('connectionProgress');
  if (badge) {
    badge.textContent = snap.label;
    badge.dataset.state = snap.state;
  }
  if (detail) detail.textContent = snap.detail || '';
  if (bar) {
    bar.style.width = `${Math.round((snap.progress || 0) * 100)}%`;
    bar.hidden = snap.state !== CONNECTION_STATE.TRANSFERRING && snap.progress <= 0;
  }
  if (snap.state === CONNECTION_STATE.CONNECTED || snap.state === CONNECTION_STATE.COMPLETE) {
    updatePcSendPanel(isSendReady());
  } else if (snap.state === CONNECTION_STATE.WAITING || snap.state === CONNECTION_STATE.FAILED) {
    updatePcSendPanel(isSendReady());
  }
}

document.getElementById('copyJoinCodeBtn')?.addEventListener('click', copyJoinCode);
document.getElementById('downloadZipBtn')?.addEventListener('click', downloadZip);
document.getElementById('pcSendBtn')?.addEventListener('click', sendComposerToPhone);
document.getElementById('pcTextSend')?.addEventListener('input', updateComposer);
document.getElementById('pcTextSend')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !e.isComposing) {
    e.preventDefault();
    sendComposerToPhone();
  }
});
document.getElementById('pcFileSendBtn')?.addEventListener('click', () => document.getElementById('pcFileSend')?.click());
document.getElementById('pcFileSend')?.addEventListener('change', sendFileToPhone);
document.querySelectorAll('[data-transfer-mode]').forEach((btn) => {
  btn.addEventListener('click', () => setTransferMode(btn.dataset.transferMode));
});

subscribeConnectionState(updateConnectionUI);
subscribeReceivedStore(updateZipButton);

registerServiceWorker();

function initStaticHints() {
  const joinHost = document.getElementById('joinHost');
  if (joinHost) joinHost.textContent = `${location.host}/join.html`;
  const isApple = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  const modKey = document.querySelector('#pcSendShortcut kbd');
  if (modKey && !isApple) modKey.textContent = 'Ctrl';
}

document.addEventListener('DOMContentLoaded', () => {
  initStaticHints();
  initPage();
  initDropToSend();
  const timerEl = document.getElementById('sessionTimer');
  const syncTimerRatio = () => timerEl?.style.setProperty('--ratio', String(timer.getRemainingRatio?.() ?? 1));
  syncTimerRatio();
  setInterval(syncTimerRatio, 1000);
});

window.addEventListener('beforeunload', () => {
  p2pHost?.stop();
  detachPresence?.();
});

window.generateNewSession = generateNewSession;
window.copyQRUrl = copyQRUrl;
window.shareToPhone = shareToPhone;
window.copyJoinCode = copyJoinCode;
window.refreshFiles = refreshFiles;
window.downloadZip = downloadZip;
window.sendTextToPhone = sendComposerToPhone;
window.viewFullImage = viewFullImage;
window.closeImageModal = closeImageModal;
window.downloadModalImage = downloadModalImage;
window.downloadFile = downloadFile;
window.copyToClipboard = copyToClipboard;
