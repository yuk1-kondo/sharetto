/**
 * PC側メインページ (index.html) — 転送 + 接続状態 + ZIP
 */
import { initFirebase } from '../firebase.js';
import {
  viewFullImage, closeImageModal, downloadModalImage, downloadFile, copyToClipboard,
} from '../ui.js';
import { attachRelaySidebandListener } from '../files-view.js';
import { issueJoinCode, createSession, extendSession, endSession, watchSession, isSessionActive } from '../session.js';
import { createFileItem, createUrlItem, createTextItem } from '../file-items.js';
import { createSessionTimer } from '../session-timer.js';
import { renderQRCode } from '../qr-display.js';
import { generateSessionId, generatePin } from '../utils.js';
import { showToast } from '../toast.js';
import { PIN_CODE_LENGTH, TRANSFER_MODE, CONNECTION_STATE, MAX_FILE_SIZE_BYTES } from '../constants.js';
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
let sessionActive = false;
let detachSession = null;
let sessionBusy = false;
let currentJoinCode = null;
let detachFiles = null;
let detachRelaySideband = null;
let p2pHost = null;
let transferMode = TRANSFER_MODE.P2P;
const receivedObjectUrls = new Set();
let sending = false;
const relayItemsSeen = new Set();
let relayMobileConnected = false;
let detachPresence = null;

const timer = createSessionTimer({
  onExpire: () => closeLocalSession(),
  elements: {
    container: document.getElementById('sessionTimer'),
    display: document.getElementById('timerDisplay'),
    detail: document.querySelector('#sessionTimer .timer-detail'),
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
  if (sessionActive) restartTransferLayer();
}

function updateZipButton({ count }) {
  const btn = document.getElementById('downloadZipBtn');
  if (btn) {
    btn.disabled = count === 0;
    btn.textContent = count > 0 ? `まとめて保存 / ZIP (${count})` : 'まとめて保存 / ZIP';
    const label = document.getElementById('receivedCount');
    if (label) label.textContent = count ? ` / ${count}` : '';
  }
}

function appendP2PFile(file, peerId) {
  if (!sessionActive) return;
  addReceivedBlob({ name: file.name, blob: file.blob, mimeType: file.mimeType, source: 'p2p', peerId });

  const filesList = document.getElementById('filesList');
  const noFiles = filesList.querySelector('.no-files');
  if (noFiles) noFiles.remove();

  const url = URL.createObjectURL(file.blob);
  receivedObjectUrls.add(url);
  filesList.prepend(createFileItem({ ...file, data: url, timestamp: Date.now() }, itemHandlers));
  showToast(`${file.name} を直接受信しました`, 'success');
}

function appendP2PText(text, peerId) {
  if (!sessionActive) return;
  const urlsList = document.getElementById('urlsList');
  const empty = urlsList.querySelector('.no-files');
  if (empty) empty.remove();
  const el = createTextItem({ text, timestamp: Date.now() }, itemHandlers);
  if (el) {
    urlsList.prepend(el);
    showToast('テキストを受信しました', 'success', 2000);
  }
}

function appendRelayText(item) {
  if (relayItemsSeen.has(item.id)) return;
  relayItemsSeen.add(item.id);
  const urlsList = document.getElementById('urlsList');
  const empty = urlsList.querySelector('.no-files');
  if (empty) empty.remove();
  const el = createTextItem(item, itemHandlers);
  if (el) {
    urlsList.prepend(el);
    showToast('テキストを受信しました', 'success', 2000);
  }
}

function appendRelayUrl(item) {
  if (relayItemsSeen.has(item.id)) return;
  relayItemsSeen.add(item.id);
  const urlsList = document.getElementById('urlsList');
  const empty = urlsList.querySelector('.no-files');
  if (empty) empty.remove();
  const el = createUrlItem(item, itemHandlers);
  if (el) urlsList.prepend(el);
}

function appendRelayFile(item) {
  if (relayItemsSeen.has(item.id)) return;
  relayItemsSeen.add(item.id);
  if (item.data) {
    addReceivedFromDataUrl({ name: item.name, dataUrl: item.data, mimeType: item.mimeType, source: 'relay' });
  }
  const filesList = document.getElementById('filesList');
  const noFiles = filesList.querySelector('.no-files');
  if (noFiles) noFiles.remove();
  const el = createFileItem(item, itemHandlers);
  if (el) {
    filesList.prepend(el);
    showToast(`${item.name} を受信しました`, 'success', 2000);
  }
}

function isRelayConnected() {
  return sessionActive && relayMobileConnected && !p2pHost?.isConnected();
}

function isSendReady() {
  return sessionActive && ((p2pHost?.isConnected?.() ?? false) || isRelayConnected());
}

function updatePcSendPanel(connected) {
  document.getElementById('pcSendPanel').hidden = false;
  for (const id of ['pcFileSendBtn', 'pcTextSendBtn', 'pcTextSend']) {
    document.getElementById(id).disabled = !connected || sending;
  }
  const drop = document.getElementById('pcDropArea');
  drop.setAttribute('aria-disabled', String(!connected || sending));
  document.getElementById('pcSendHint').textContent = !sessionActive
    ? '新しいセッションを開始してください'
    : !connected ? '端末をつなぐと送信できます'
    : isRelayConnected() ? '接続済み / サーバー経由' : '接続済み / 直接通信';
}

async function restartTransferLayer() {
  p2pHost?.stop();
  p2pHost = null;
  relayMobileConnected = false;
  updatePcSendPanel(false);
  if (detachPresence) { try { detachPresence(); } catch { /* noop */ } detachPresence = null; }
  if (detachFiles) { try { detachFiles(); } catch { /* noop */ } detachFiles = null; }
  if (detachRelaySideband) { try { detachRelaySideband(); } catch { /* noop */ } detachRelaySideband = null; }

  if (!currentSessionId || !sessionActive) return;

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
  if (sessionBusy) return;
  sessionBusy = true;
  try {
    if (sessionActive && currentSessionId) await endSession(db, currentSessionId);
    detachSession?.();
    p2pHost?.stop();
    if (detachFiles) { try { detachFiles(); } catch { /* noop */ } detachFiles = null; }

    receivedObjectUrls.forEach((url) => URL.revokeObjectURL(url));
    receivedObjectUrls.clear();
    closeImageModal();
    clearReceivedStore();
    relayItemsSeen.clear();
    document.getElementById('filesList').innerHTML = '<p class="no-files">届いた写真やファイルが、ここに並びます。</p>';
    document.getElementById('urlsList').innerHTML = '<p class="no-files">届いた文章やURLが、ここに並びます。</p>';

    currentSessionId = generateSessionId();
    const modeParam = transferMode === TRANSFER_MODE.P2P ? 'p2p' : 'relay';
    const uploadUrl = `${window.location.origin}/upload.html?session=${currentSessionId}&mode=${modeParam}`;
    const pin = generatePin();

    resetConnectionState();
    renderQRCode(document.getElementById('qrcode'), uploadUrl);
    const session = await createSession(db, currentSessionId);
    sessionActive = true;
    document.body.dataset.sessionEnded = 'false';
    document.querySelector('.session-ended-message').hidden = true;
    document.getElementById('extendSessionBtn').disabled = false;
    document.getElementById('endSessionBtn').disabled = false;
    timer.start(session.expiresAt);
    detachSession = watchSession(db, currentSessionId, (value) => {
      if (!isSessionActive(value)) closeLocalSession();
      else timer.start(value.expiresAt);
    }, () => closeLocalSession());

    document.getElementById('qrUrl').textContent = uploadUrl;
    const ok = await issueJoinCode(db, currentSessionId, pin);
    currentJoinCode = ok ? String(pin).slice(0, PIN_CODE_LENGTH) : null;
    if (!ok) showToast('参加コードの発行に失敗しました', 'error', 4000);
    updateJoinCodeUI();
    await restartTransferLayer();
  } catch (error) {
    closeLocalSession();
    showToast('セッションの開始に失敗しました。再度お試しください', 'error');
    console.error(error);
  } finally { sessionBusy = false; }
}

function closeLocalSession() {
  sessionActive = false;
  timer.stop();
  p2pHost?.stop();
  p2pHost = null;
  detachFiles?.(); detachRelaySideband?.(); detachPresence?.();
  relayMobileConnected = false;
  updatePcSendPanel(false);
  document.body.dataset.sessionEnded = 'true';
  document.querySelector('.session-ended-message').hidden = false;
  document.getElementById('timerDisplay').textContent = '終了';
  document.querySelector('#sessionTimer .timer-detail').textContent = '新しいセッションを開始してください';
  document.getElementById('extendSessionBtn').disabled = true;
  document.getElementById('endSessionBtn').disabled = true;
  document.getElementById('copyJoinCodeBtn').disabled = true;
  setConnectionState(CONNECTION_STATE.IDLE, { detail: 'セッションは終了しました' });
}

async function extendCurrentSession() {
  if (!sessionActive || sessionBusy) return;
  sessionBusy = true;
  try {
    const expiresAt = await extendSession(db, currentSessionId);
    timer.start(expiresAt);
    showToast('有効時間を2時間延長しました。参加コードは同じです', 'success');
  } catch (e) { showToast(e.message || '延長に失敗しました', 'error'); }
  finally { sessionBusy = false; }
}

async function endCurrentSession() {
  if (!sessionActive || sessionBusy) return;
  sessionBusy = true;
  try {
    await endSession(db, currentSessionId);
    closeLocalSession();
  } catch (e) { showToast('終了に失敗しました。再度お試しください', 'error'); }
  finally { sessionBusy = false; }
}

document.getElementById('extendSessionBtn').addEventListener('click', extendCurrentSession);
document.getElementById('endSessionBtn').addEventListener('click', endCurrentSession);

function updateJoinCodeUI() {
  const el = document.getElementById('joinCode');
  if (el) el.textContent = currentJoinCode || '------';
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
  detachFiles = attachRelaySidebandListener(db, currentSessionId, {
    onFile: appendRelayFile,
    onUrl: appendRelayUrl,
    onText: appendRelayText,
  });
}

function refreshFiles() {
  if (transferMode === TRANSFER_MODE.RELAY) { detachFiles?.(); displayFilesRelay(); }
  showToast('一覧を更新しました', 'info', 1500);
}

async function sendTextToPhone() {
  const input = document.getElementById('pcTextSend');
  const text = input?.value;
  if (!text?.trim()) return;
  if (!isSendReady()) {
    showToast('スマホが接続されていません', 'error');
    return;
  }
  try {
    if (p2pHost?.isConnected()) {
      p2pHost.sendText(text);
    } else {
      if (/^https?:\/\/\S+$/i.test(text)) await putOutboxUrl(db, currentSessionId, text);
      else await putOutboxText(db, currentSessionId, text);
    }
    input.value = '';
    showToast('スマホへテキストを送信しました', 'success');
  } catch (e) {
    showToast(e.message || '送信に失敗しました', 'error');
  }
}

async function sendFilesToPhone(files) {
  if (!files.length || sending) return;
  if (!isSendReady()) { showToast('先にQRコードで端末をつないでください', 'info'); return; }
  if (files.some((file) => file.size > MAX_FILE_SIZE_BYTES)) { showToast('1ファイルは50MBまでです', 'error'); return; }
  sending = true;
  updatePcSendPanel(true);
  try {
    for (const [index, file] of files.entries()) {
      if (!isSendReady()) throw new Error('接続が終了しました');
      setConnectionState(CONNECTION_STATE.TRANSFERRING, { detail: `${file.name} を送信中 (${index + 1}/${files.length})` });
      if (p2pHost?.isConnected()) {
        await p2pHost.sendFile(file, (p) => setTransferProgress((index + p) / files.length, file.name));
      } else {
        await putOutboxFile(db, currentSessionId, file);
        setTransferProgress((index + 1) / files.length, file.name);
      }
    }
    if (sessionActive) {
      showToast(`${files.length}件を送信しました`, 'success');
      setConnectionState(CONNECTION_STATE.COMPLETE, { detail: '送信完了', progress: 1 });
      setTimeout(() => { if (sessionActive) setConnectionState(CONNECTION_STATE.CONNECTED, { detail: '追加で送受信できます', progress: 0 }); }, 1500);
    }
  } catch (e) { showToast(e.message || '送信に失敗しました', 'error'); }
  finally {
    document.getElementById('pcFileSend').value = '';
    sending = false;
    updatePcSendPanel(isSendReady());
  }
}

function sendFileToPhone() {
  return sendFilesToPhone([...document.getElementById('pcFileSend').files]);
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
document.getElementById('pcTextSendBtn')?.addEventListener('click', sendTextToPhone);
document.getElementById('pcUrlSendBtn')?.addEventListener('click', sendUrlToPhone);
document.getElementById('pcFileSendBtn')?.addEventListener('click', () => document.getElementById('pcFileSend')?.click());
document.getElementById('pcFileSend')?.addEventListener('change', sendFileToPhone);
document.querySelectorAll('[data-transfer-mode]').forEach((btn) => {
  btn.addEventListener('click', () => setTransferMode(btn.dataset.transferMode));
});

subscribeConnectionState(updateConnectionUI);
subscribeReceivedStore(updateZipButton);

registerServiceWorker();

document.addEventListener('DOMContentLoaded', initPage);

const drop = document.getElementById('pcDropArea');
function chooseFiles() { if (isSendReady() && !sending) document.getElementById('pcFileSend').click(); }
drop.addEventListener('click', chooseFiles);
drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); chooseFiles(); } });
drop.addEventListener('dragover', (e) => { e.preventDefault(); if (isSendReady()) drop.classList.add('dragover'); });
drop.addEventListener('dragleave', () => drop.classList.remove('dragover'));
drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('dragover'); sendFilesToPhone([...e.dataTransfer.files]); });
document.getElementById('helpBtn').addEventListener('click', () => document.getElementById('helpDialog').showModal());
window.addEventListener('beforeunload', () => {
  p2pHost?.stop(); detachPresence?.(); detachSession?.();
  receivedObjectUrls.forEach((url) => URL.revokeObjectURL(url));
});

window.generateNewSession = generateNewSession;
window.copyQRUrl = copyQRUrl;
window.shareToPhone = shareToPhone;
window.copyJoinCode = copyJoinCode;
window.refreshFiles = refreshFiles;
window.downloadZip = downloadZip;
window.sendTextToPhone = sendTextToPhone;
window.viewFullImage = viewFullImage;
window.closeImageModal = closeImageModal;
window.downloadModalImage = downloadModalImage;
window.downloadFile = downloadFile;
window.copyToClipboard = copyToClipboard;
