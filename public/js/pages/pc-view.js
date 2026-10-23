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
import { issueJoinCode, resolveJoinCode } from '../session.js';
import { initPasteToSend, initDropToSend, onBareDigit } from '../desktop-input.js';
import { markIncoming } from '../attention.js';
import {
  createFileItem, createUrlItem, createTextItem, createMessageItem, prependItem, isHttpUrl,
} from '../file-items.js';
import { createSessionTimer } from '../session-timer.js';
import { renderQRCode } from '../qr-display.js';
import { generateSessionId, generatePin, parseJoinInput } from '../utils.js';
import { showToast } from '../toast.js';
import {
  PIN_CODE_LENGTH, TRANSFER_MODE, CONNECTION_STATE, SESSION_TTL_MS,
} from '../constants.js';
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
/** 参加コードは期限切れだが、直接接続を維持しているあいだ true */
let codeExpiredWhileConnected = false;

const timer = createSessionTimer({
  onExpire: handleCodeExpired,
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
  markIncoming();
  showToast(`${file.name} を受信しました`, 'success');
}

function appendP2PText(text) {
  const el = createMessageItem(text, itemHandlers, { tag: DIRECT_TAG });
  prependItem(document.getElementById('urlsList'), el);
  markIncoming();
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
          detail: '相手が参加しました（サーバー経由）',
        });
        updatePcSendPanel(true);
      },
      onLeave: () => {
        if (p2pHost?.isConnected?.()) return;
        relayMobileConnected = false;
        setConnectionState(CONNECTION_STATE.WAITING, { detail: 'スマホまたはPCからの接続を待っています' });
        updatePcSendPanel(false);
      },
    });
  } else {
    resetConnectionState();
    setConnectionState(CONNECTION_STATE.WAITING, { detail: 'スマホまたはPCからの接続を待っています' });
    displayFilesRelay();
    detachPresence = watchMobilePresence(db, currentSessionId, {
      onJoin: () => {
        relayMobileConnected = true;
        setConnectionState(CONNECTION_STATE.CONNECTED, {
          detail: '相手が接続しました — 双方向で送受信できます',
        });
        updatePcSendPanel(true);
      },
      onLeave: () => {
        relayMobileConnected = false;
        setConnectionState(CONNECTION_STATE.WAITING, { detail: 'スマホまたはPCからの接続を待っています' });
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
  codeExpiredWhileConnected = false;
  document.querySelector('.code-display')?.classList.remove('is-expired');
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

/** 入力欄の内容を、URL ならリンク、それ以外はテキストとして相手へ送る */
async function sendComposerToPhone() {
  const input = document.getElementById('pcTextSend');
  const value = input?.value?.trim();
  if (!value) return;
  if (!isSendReady()) {
    showToast('相手が接続されていません', 'error');
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
    showToast(asUrl ? '相手へリンクを送信しました' : '相手へテキストを送信しました', 'success');
  } catch (e) {
    showToast(e.message || '送信に失敗しました', 'error');
  }
}

let sendQueue = Promise.resolve();

/** 送信は1本のデータチャネルを共有するため、必ず順番に流す */
function sendFilesToPhone(fileList) {
  const files = [...(fileList || [])];
  const run = sendQueue.then(() => sendFilesNow(files));
  sendQueue = run.catch(() => {});
  return run;
}

async function sendFilesNow(files) {
  if (files.length === 0) return;
  if (!isSendReady()) {
    showToast('相手が接続されていません', 'error');
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
    showToast(`${done}を相手へ送信しました`, 'success');
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

function initDesktopInput() {
  const blocked = () => showToast('相手とつながってから送れます', 'info');
  initDropToSend({
    overlay: document.getElementById('dropOverlay'),
    canSend: isSendReady,
    onFiles: sendFilesToPhone,
    onBlocked: blocked,
  });
  initPasteToSend({
    canSend: isSendReady,
    onFiles: sendFilesToPhone,
    onText: (text) => {
      const input = document.getElementById('pcTextSend');
      if (!input) return;
      input.value = text;
      input.focus();
      updateComposer();
    },
    onBlocked: blocked,
  });
}

/* ── 参加コードの期限 ─────────────────────────── */

function handleCodeExpired() {
  if (p2pHost?.isConnected()) {
    codeExpiredWhileConnected = true;
    const display = document.getElementById('timerDisplay');
    if (display) display.textContent = '接続を維持';
    const timerEl = document.getElementById('sessionTimer');
    if (timerEl) timerEl.className = 'session-timer kept';
    document.querySelector('.code-display')?.classList.add('is-expired');
    showToast('参加コードは期限切れです。接続中の相手とは引き続き送受信できます', 'info', 4000);
    return;
  }
  setTimeout(generateNewSession, 5000);
}

function maybeRenewExpiredSession(state) {
  if (!codeExpiredWhileConnected) return;
  if (state !== CONNECTION_STATE.WAITING && state !== CONNECTION_STATE.FAILED) return;
  if (p2pHost?.isConnected()) return;
  generateNewSession();
}

/* ── ほかのPCのコードを入力して参加 ─────────────── */

function initJoinDialog() {
  const dialog = document.getElementById('joinDialog');
  const form = document.getElementById('joinDialogForm');
  const input = document.getElementById('joinDialogInput');
  const submit = document.getElementById('joinDialogSubmit');
  const statusEl = document.getElementById('joinDialogStatus');
  if (!dialog || !input) return;
  let joining = false;

  const goToSession = (sessionId) => {
    const q = new URLSearchParams({ session: sessionId, mode: 'p2p' });
    location.href = `upload.html?${q.toString()}`;
  };

  const refresh = () => {
    input.classList.toggle('is-long', /[^\d\s]/.test(input.value));
    submit.disabled = joining || !parseJoinInput(input.value);
    if (!joining) statusEl.textContent = '';
  };

  const join = async () => {
    const parsed = parseJoinInput(input.value);
    if (!parsed || joining) return;
    if (parsed.type === 'session') {
      if (parsed.sessionId === currentSessionId) {
        statusEl.textContent = 'このPC自身のリンクです。相手のリンクを入力してください';
        return;
      }
      goToSession(parsed.sessionId);
      return;
    }
    if (parsed.code === currentJoinCode) {
      statusEl.textContent = 'このPC自身のコードです。相手の画面のコードを入力してください';
      return;
    }
    joining = true;
    refresh();
    statusEl.textContent = '照会中…';
    try {
      const sessionId = await resolveJoinCode(db, parsed.code, SESSION_TTL_MS);
      if (sessionId) {
        statusEl.textContent = '接続しています…';
        goToSession(sessionId);
        return;
      }
      statusEl.textContent = 'コードが見つからないか、期限切れです';
    } catch (e) {
      console.warn('[pc] join code lookup failed', e);
      statusEl.textContent = '接続エラーが発生しました。もう一度お試しください';
    }
    joining = false;
    submit.disabled = !parseJoinInput(input.value);
  };

  const open = (initial = '') => {
    if (dialog.open) return;
    input.value = initial;
    joining = false;
    refresh();
    dialog.showModal();
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  };

  input.addEventListener('input', () => {
    refresh();
    const parsed = parseJoinInput(input.value);
    if (parsed?.type === 'code' && /^\d{6}$/.test(input.value.trim())) join();
  });
  input.addEventListener('paste', () => setTimeout(() => {
    refresh();
    if (parseJoinInput(input.value)?.type === 'session') join();
  }));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    join();
  });
  document.getElementById('joinDialogCancel')?.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
  document.getElementById('openJoinDialogBtn')?.addEventListener('click', () => open());
  onBareDigit((digit) => open(digit));
}

function downloadZip() {
  downloadFilesAsZip(getReceivedFiles());
}

function updateConnectionUI(snap) {
  document.body.dataset.connectionState = snap.state;
  maybeRenewExpiredSession(snap.state);
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
  initDesktopInput();
  initJoinDialog();
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
