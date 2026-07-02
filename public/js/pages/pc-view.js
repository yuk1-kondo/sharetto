/**
 * PC側メインページ (index.html) — 転送 + 接続状態 + ZIP
 */
import { initFirebase } from '../firebase.js';
import {
  viewFullImage, closeImageModal, downloadModalImage, downloadFile, copyToClipboard,
} from '../ui.js';
import { attachFilesListener, attachRelaySidebandListener } from '../files-view.js';
import { issueJoinCode } from '../session.js';
import { createFileItem, createUrlItem, createTextItem } from '../file-items.js';
import { createSessionTimer } from '../session-timer.js';
import { renderQRCode } from '../qr-display.js';
import { generateSessionId, generatePin, formatFileSize } from '../utils.js';
import { showToast } from '../toast.js';
import { PIN_CODE_LENGTH, TRANSFER_MODE, CONNECTION_STATE } from '../constants.js';
import { subscribeConnectionState, setConnectionState, resetConnectionState, setTransferProgress } from '../connection-state.js';
import { createP2PHost } from '../webrtc/host.js';
import {
  addReceivedBlob, addReceivedFromDataUrl, getReceivedFiles, subscribeReceivedStore, clearReceivedStore,
} from '../received-store.js';
import { downloadFilesAsZip } from '../zip-save.js';
import { registerServiceWorker } from '../pwa.js';
import { initConnectionVisual } from '../visual/connection-visual.js';
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
let connectionVisual = null;
let relayMobileConnected = false;
let detachPresence = null;

const timer = createSessionTimer({
  onExpire: () => setTimeout(generateNewSession, 5000),
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
  if (currentSessionId) restartTransferLayer();
}

function updateZipButton({ count }) {
  const btn = document.getElementById('downloadZipBtn');
  if (btn) {
    btn.disabled = count === 0;
    btn.textContent = count > 0 ? `📦 まとめてZIP (${count})` : '📦 まとめてZIP';
  }
}

function appendP2PFile(file, peerId) {
  addReceivedBlob({ name: file.name, blob: file.blob, mimeType: file.mimeType, source: 'p2p', peerId });

  const filesList = document.getElementById('filesList');
  const noFiles = filesList.querySelector('.no-files');
  if (noFiles) noFiles.remove();

  const url = URL.createObjectURL(file.blob);
  const div = document.createElement('div');
  div.className = 'file-item';
  const isImage = file.mimeType?.startsWith('image/');
  const date = new Date().toLocaleString('ja-JP');
  div.innerHTML = `
    <div class="file-info">
      <div class="file-details">
        <div class="file-name">${isImage ? '🖼️' : '📄'} ${file.name} <span class="tag-direct">直接</span></div>
        <div class="file-size">サイズ: ${formatFileSize(file.size)} · 送信元: ${peerId.slice(0, 4)}</div>
        <div class="file-date">受信: ${date}</div>
      </div>
      <div class="file-actions">
        <button class="download-btn p2p-dl">⬇️ ダウンロード</button>
      </div>
    </div>`;
  div.querySelector('.p2p-dl').addEventListener('click', () => downloadFile(file.id, file.name, url));
  if (isImage) {
    const thumb = document.createElement('div');
    thumb.className = 'file-thumbnail';
    const img = document.createElement('img');
    img.src = url;
    img.alt = file.name;
    img.addEventListener('click', () => viewFullImage(url, file.name));
    thumb.appendChild(img);
    div.querySelector('.file-info').prepend(thumb);
  }
  filesList.prepend(div);
  showToast(`${file.name} を直接受信しました`, 'success');
}

function appendP2PText(text, peerId) {
  const urlsList = document.getElementById('urlsList');
  const empty = urlsList.querySelector('.no-files');
  if (empty) empty.remove();
  const el = createTextItem({ text, timestamp: Date.now() }, itemHandlers);
  if (el) {
    const title = el.querySelector('.file-name');
    if (title) title.innerHTML = `💬 テキスト <span class="tag-direct">直接 · ${peerId.slice(0, 4)}</span>`;
    urlsList.prepend(el);
    showToast('テキストを受信しました', 'success', 2000);
  }
}

function appendRelayText(item) {
  const urlsList = document.getElementById('urlsList');
  const empty = urlsList.querySelector('.no-files');
  if (empty) empty.remove();
  const el = createTextItem(item, itemHandlers);
  if (el) {
    const title = el.querySelector('.file-name');
    if (title) title.innerHTML = `💬 テキスト <span class="tag-direct">サーバー経由</span>`;
    urlsList.prepend(el);
    showToast('テキストを受信しました', 'success', 2000);
  }
}

function appendRelayUrl(item) {
  const urlsList = document.getElementById('urlsList');
  const empty = urlsList.querySelector('.no-files');
  if (empty) empty.remove();
  const el = createUrlItem(item, itemHandlers);
  if (el) urlsList.prepend(el);
}

function appendRelayFile(item) {
  if (item.data) {
    addReceivedFromDataUrl({ name: item.name, dataUrl: item.data, mimeType: item.mimeType, source: 'relay' });
  }
  const filesList = document.getElementById('filesList');
  const noFiles = filesList.querySelector('.no-files');
  if (noFiles) noFiles.remove();
  const el = createFileItem(item, itemHandlers);
  if (el) {
    const title = el.querySelector('.file-name');
    if (title && !title.querySelector('.tag-direct')) {
      const tag = document.createElement('span');
      tag.className = 'tag-direct';
      tag.textContent = 'サーバー経由';
      title.appendChild(document.createTextNode(' '));
      title.appendChild(tag);
    }
    filesList.prepend(el);
    showToast(`${item.name} を受信しました`, 'success', 2000);
  }
}

function isRelayConnected() {
  return transferMode === TRANSFER_MODE.RELAY && relayMobileConnected;
}

function isSendReady() {
  return (p2pHost?.isConnected?.() ?? false) || isRelayConnected();
}

function updatePcSendPanel(connected) {
  const panel = document.getElementById('pcSendPanel');
  const hint = document.getElementById('pcSendHint');
  if (panel) panel.hidden = !connected;
  if (hint) {
    hint.textContent = isRelayConnected()
      ? 'サーバー経由で接続中 — PCからスマホへ送信'
      : '直接接続中 — PCからスマホへ送信';
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
  document.getElementById('filesList').innerHTML = '<div class="no-files">まだファイルがありません<br><small>QRコードを読み取るとここに表示されます</small></div>';
  document.getElementById('urlsList').innerHTML = '<div class="no-files">URLやテキストはここに表示されます</div>';

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
  detachFiles = attachFilesListener(db, currentSessionId, {
    filesList: document.getElementById('filesList'),
    urlsList: document.getElementById('urlsList'),
    createFileItem: (f) => createFileItem(f, itemHandlers),
    createUrlItem: (u) => createUrlItem(u, itemHandlers),
    createTextItem: (t) => createTextItem(t, itemHandlers),
    onNewFile: onRelayFile,
  });
}

function refreshFiles() {
  if (transferMode === TRANSFER_MODE.RELAY) displayFilesRelay();
  showToast('一覧を更新しました', 'info', 1500);
}

async function sendTextToPhone() {
  const input = document.getElementById('pcTextSend');
  const text = input?.value?.trim();
  if (!text) return;
  if (!isSendReady()) {
    showToast('スマホが接続されていません', 'error');
    return;
  }
  try {
    if (p2pHost?.isConnected()) {
      p2pHost.sendText(text);
    } else {
      await putOutboxText(db, currentSessionId, text);
    }
    input.value = '';
    showToast('スマホへテキストを送信しました', 'success');
  } catch (e) {
    showToast(e.message || '送信に失敗しました', 'error');
  }
}

async function sendUrlToPhone() {
  const input = document.getElementById('pcUrlSend');
  const url = input?.value?.trim();
  if (!url) return;
  try {
    new URL(url);
  } catch {
    showToast('有効なURLを入力してください', 'error');
    return;
  }
  if (!isSendReady()) {
    showToast('スマホが接続されていません', 'error');
    return;
  }
  try {
    if (p2pHost?.isConnected()) {
      p2pHost.sendText(url);
    } else {
      await putOutboxUrl(db, currentSessionId, url);
    }
    input.value = '';
    showToast('スマホへURLを送信しました', 'success');
  } catch (e) {
    showToast(e.message || '送信に失敗しました', 'error');
  }
}

async function sendFileToPhone() {
  const input = document.getElementById('pcFileSend');
  const file = input?.files?.[0];
  if (!file) {
    showToast('ファイルを選択してください', 'info');
    return;
  }
  if (!isSendReady()) {
    showToast('スマホが接続されていません', 'error');
    return;
  }
  try {
    setConnectionState(CONNECTION_STATE.TRANSFERRING, { detail: `${file.name} を送信中` });
    if (p2pHost?.isConnected()) {
      await p2pHost.sendFile(file, (p) => setTransferProgress(p, file.name));
    } else {
      await putOutboxFile(db, currentSessionId, file);
      setTransferProgress(1, file.name);
    }
    input.value = '';
    showToast(`${file.name} をスマホへ送信しました`, 'success');
    setConnectionState(CONNECTION_STATE.COMPLETE, { detail: '送信完了', progress: 1 });
    setTimeout(() => setConnectionState(CONNECTION_STATE.CONNECTED, {
      detail: isRelayConnected() ? '双方向で送受信できます（サーバー経由）' : '双方向で送受信できます',
      progress: 0,
    }), 1500);
  } catch (e) {
    showToast(e.message || '送信に失敗しました', 'error');
  }
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

document.addEventListener('DOMContentLoaded', async () => {
  initPage();
  connectionVisual = await initConnectionVisual(document.getElementById('connection-visual'));
  const syncTimerToVisual = () => connectionVisual?.setTimerRatio?.(timer.getRemainingRatio?.() ?? 1);
  syncTimerToVisual();
  setInterval(syncTimerToVisual, 250);
});

window.addEventListener('beforeunload', () => {
  p2pHost?.stop();
  detachPresence?.();
  connectionVisual?.destroy();
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
