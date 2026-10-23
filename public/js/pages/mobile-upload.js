/**
 * モバイルアップロードページ (upload.html) のエントリポイント
 */
import { initFirebase, dbRef, onValue, off, get, update } from '../firebase.js';
import { encodeFileAsDataURL, putFile, putUrl, putText } from '../files-save.js';
import { resolveJoinCode } from '../session.js';
import { formatFileSize, parseJoinInput } from '../utils.js';
import { showToast } from '../toast.js';
import {
  JOIN_SESSION_KEY,
  JOIN_SESSION_EXPIRES_KEY,
  JOIN_SESSION_DURATION_MS,
  MAX_FILE_SIZE_BYTES,
  MAX_FILE_SIZE_MB,
  TRANSFER_MODE,
  CONNECTION_STATE,
  SESSION_TTL_MS,
} from '../constants.js';
import { createP2PGuest, sendFileOverChannel, sendTextOverChannel } from '../webrtc/guest.js';
import { setConnectionState, subscribeConnectionState, setTransferProgress } from '../connection-state.js';
import { firebaseConfig } from '../../config.js';
import { registerServiceWorker } from '../pwa.js';
import {
  createFileItem, createUrlItem, createTextItem, createMessageItem, prependItem, isHttpUrl,
} from '../file-items.js';
import { extLabel } from '../icons.js';
import {
  viewFullImage, closeImageModal, downloadModalImage, downloadFile, copyToClipboard,
} from '../ui.js';
import { normalizeImageFile, isHeicFile } from '../heic-convert.js';
import { announceMobileJoin, clearMobilePresence } from '../relay-presence.js';
import { attachOutboxListener } from '../relay-outbox.js';

const { db, fs } = initFirebase(firebaseConfig);

const urlParams = new URLSearchParams(window.location.search);
let sessionId = urlParams.get('session') || null;

let transferMode = urlParams.get('mode') === 'relay' ? TRANSFER_MODE.RELAY : TRANSFER_MODE.P2P;
let p2pGuest = null;
let dataChannel = null;
let detachOutbox = null;

const itemHandlers = {
  onDownload: downloadFile,
  onViewImage: viewFullImage,
  onCopy: (text) => copyToClipboard(text, 'コピーしました'),
};

(function warmUpRealtime() {
  try {
    const infoRef = dbRef(db, '.info/connected');
    onValue(infoRef, () => { try { off(infoRef); } catch { /* noop */ } });
  } catch { /* noop */ }
  try {
    get(dbRef(db, 'ping')).catch(() => {});
  } catch { /* noop */ }
})();

function updateMobileConnectionUI(snap) {
  document.body.dataset.connectionState = snap.state;
  const badge = document.getElementById('mobileConnectionBadge');
  const detail = document.getElementById('mobileConnectionDetail');
  if (badge) { badge.textContent = snap.label; badge.dataset.state = snap.state; }
  if (detail) detail.textContent = snap.detail || '';
}

let relaySessionStarted = false;

function switchToRelayMode(reason) {
  transferMode = TRANSFER_MODE.RELAY;
  p2pGuest?.stop();
  p2pGuest = null;
  dataChannel = null;
  const fb = document.getElementById('fallbackRelayBtn');
  if (fb) fb.hidden = true;
  reassertConnected();
  if (reason) showToast(reason, 'info', 3000);
}

function reassertConnected() {
  const detail = isP2PReady()
    ? '直接接続済み — 高速で送受信できます'
    : 'サーバー経由で接続済み — 送受信できます';
  setConnectionState(CONNECTION_STATE.CONNECTED, { detail });
}

/** サーバー経由の接続を確立（プレゼンス通知 + 受信待受）。冪等。 */
async function initRelaySession() {
  if (!sessionId) return;
  showMobileReceivePanel();
  if (!relaySessionStarted) {
    relaySessionStarted = true;
    detachOutbox = attachOutboxListener(db, sessionId, {
      onFile: appendMobileReceivedRelayFile,
      onUrl: appendMobileReceivedRelayUrl,
      onText: (item) => appendMobileReceivedText(item.text, 'サーバー経由'),
    });
  }
  try {
    await announceMobileJoin(db, sessionId);
  } catch (e) {
    console.warn('[mobile] presence announce failed', e);
  }
  reassertConnected();
}

/**
 * QR/コードで参加したら、まずサーバー経由で即「接続済み」にする。
 * その後、可能なら裏で直接接続(P2P)へ静かにアップグレードする。
 */
async function bootstrapSession() {
  if (!sessionId) return;
  await initRelaySession();
  const fb = document.getElementById('fallbackRelayBtn');
  if (fb) fb.hidden = true;
  attemptP2PUpgrade();
}

function showMobileReceivePanel() {
  const panel = document.getElementById('mobileReceivePanel');
  if (panel) panel.hidden = false;
}

function receiveList() {
  showMobileReceivePanel();
  return document.getElementById('mobileReceiveList');
}

function appendMobileReceivedFile(file, tag = '直接') {
  const url = URL.createObjectURL(file.blob);
  const el = createFileItem({
    name: file.name,
    size: file.size ?? file.blob.size,
    mimeType: file.mimeType,
    data: url,
    timestamp: Date.now(),
  }, itemHandlers, { tag });
  prependItem(receiveList(), el);
  showToast(`${file.name} をPCから受信しました`, 'success');
}

async function appendMobileReceivedRelayFile(item) {
  try {
    const res = await fetch(item.data);
    const blob = await res.blob();
    appendMobileReceivedFile({
      name: item.name,
      blob,
      mimeType: item.mimeType,
      size: item.size ?? blob.size,
    }, 'サーバー経由');
  } catch (e) {
    console.warn('[mobile] relay file receive failed', e);
    showToast('ファイルの受信に失敗しました', 'error');
  }
}

function appendMobileReceivedRelayUrl(item) {
  const el = createUrlItem({ url: item.url, title: item.name, timestamp: item.timestamp }, itemHandlers, { tag: 'サーバー経由' });
  prependItem(receiveList(), el);
  showToast('PCからリンクを受信しました', 'success');
}

function appendMobileReceivedText(text, tag = '直接') {
  const el = tag === '直接'
    ? createMessageItem(text, itemHandlers, { tag })
    : createTextItem({ text, timestamp: Date.now() }, itemHandlers, { tag });
  prependItem(receiveList(), el);
  showToast(isHttpUrl(text) ? 'PCからリンクを受信しました' : 'PCからテキストを受信しました', 'success');
}

/**
 * 裏で直接接続(P2P)を試みる。成功したら高速化、失敗してもサーバー経由のまま静かに継続。
 * 失敗しても「接続失敗」等のエラーは出さない。
 */
async function attemptP2PUpgrade() {
  if (transferMode === TRANSFER_MODE.RELAY || !sessionId) return;

  const tryConnect = async () => {
    p2pGuest = createP2PGuest({
      db, sessionId,
      manageState: false,
      onConnected: (ch) => {
        dataChannel = ch;
        reassertConnected();
        showToast('直接接続に切り替えました（高速）', 'success', 2500);
      },
      onFailed: () => {},
      onFile: (file) => appendMobileReceivedFile(file, '直接'),
      onText: (text) => appendMobileReceivedText(text, '直接'),
    });
    dataChannel = await p2pGuest.connect();
  };

  try {
    await tryConnect();
  } catch (e) {
    console.warn('[mobile] P2P upgrade failed, staying on relay', e);
    p2pGuest?.stop();
    p2pGuest = null;
    dataChannel = null;
    reassertConnected();
  }
}

function isP2PReady() {
  return transferMode === TRANSFER_MODE.P2P && dataChannel?.readyState === 'open';
}

const fileInput = document.getElementById('file-input');
const uploadBtn = document.getElementById('upload-btn');
const uploadArea = document.getElementById('upload-area');
const filePreview = document.getElementById('file-preview');
const fileName = document.getElementById('file-name');
const fileSize = document.getElementById('file-size');
const fileStrip = document.getElementById('file-strip');
const progressContainer = document.getElementById('progress-container');
const progressBar = document.getElementById('progress-bar');
const status = document.getElementById('status');

const textInput = document.getElementById('text-input');
const textSendBtn = document.getElementById('text-send-btn');
const urlStatus = document.getElementById('url-status');
const urlPreview = document.getElementById('url-preview');
const UPLOAD_IDLE_LABEL = 'ファイルを選んでください';

function persistJoinSession() {
  const expires = Date.now() + JOIN_SESSION_DURATION_MS;
  localStorage.setItem(JOIN_SESSION_KEY, 'joined');
  localStorage.setItem(JOIN_SESSION_EXPIRES_KEY, expires.toString());
}

async function submitJoinCode() {
  const password = document.getElementById('authInput').value;
  const errorDiv = document.getElementById('authError');

  const parsed = parseJoinInput(password);
  if (parsed?.type === 'session') {
    sessionId = parsed.sessionId;
    persistJoinSession();
    showMainContent();
    errorDiv.style.display = 'none';
    showToast('セッションに参加しました', 'success');
    await bootstrapSession();
    return;
  }
  if (parsed?.type === 'code') {
    errorDiv.style.display = 'none';
    errorDiv.textContent = '参加コードが正しくありません';
    try {
      const sid = await resolveJoinCode(db, parsed.code, SESSION_TTL_MS);
      if (sid) {
        sessionId = sid;
        persistJoinSession();
        showMainContent();
        showToast('セッションに参加しました', 'success');
        await bootstrapSession();
        return;
      }
    } catch (e) {
      console.warn('[mobile] join code lookup failed', e);
      errorDiv.textContent = '接続エラーが発生しました';
      errorDiv.style.display = 'block';
      return;
    }
    errorDiv.style.display = 'block';
    return;
  }

  errorDiv.style.display = 'block';
  document.getElementById('authInput').value = '';
  setTimeout(() => { errorDiv.style.display = 'none'; }, 3000);
}

function showMainContent() {
  document.getElementById('authOverlay').style.display = 'none';
  document.getElementById('mainContent').classList.add('authenticated');
}

function restoreJoinSession() {
  if (sessionId && sessionId.length >= 6) {
    persistJoinSession();
    showMainContent();
    return true;
  }

  const joined = localStorage.getItem(JOIN_SESSION_KEY);
  const expires = localStorage.getItem(JOIN_SESSION_EXPIRES_KEY);
  if (joined === 'joined' && expires && Date.now() < parseInt(expires, 10)) {
    showMainContent();
    return true;
  }
  localStorage.removeItem(JOIN_SESSION_KEY);
  localStorage.removeItem(JOIN_SESSION_EXPIRES_KEY);
  return false;
}

function initTabs() {
  const tabButtons = document.querySelectorAll('.tab-button[data-tab]');
  const tabContents = document.querySelectorAll('.tab-content');
  tabButtons.forEach((button) => {
    button.addEventListener('click', function onTabClick() {
      const targetTab = this.getAttribute('data-tab');
      tabButtons.forEach((btn) => btn.classList.remove('active'));
      tabContents.forEach((content) => content.classList.remove('active'));
      this.classList.add('active');
      tabButtons.forEach((btn) => btn.setAttribute('aria-selected', String(btn === this)));
      document.getElementById(`${targetTab}-tab`).classList.add('active');
    });
  });
}

let previewUrls = [];

function clearFileStrip() {
  previewUrls.forEach((u) => URL.revokeObjectURL(u));
  previewUrls = [];
  if (fileStrip) fileStrip.innerHTML = '';
}

function renderFileStrip(files) {
  clearFileStrip();
  if (!fileStrip) return;
  files.slice(0, 12).forEach((f) => {
    const chip = document.createElement('div');
    chip.className = 'file-chip';
    chip.title = f.name;
    if (f.type?.startsWith('image/') && !isHeicFile(f)) {
      const url = URL.createObjectURL(f);
      previewUrls.push(url);
      const img = document.createElement('img');
      img.src = url;
      img.alt = '';
      chip.appendChild(img);
    } else {
      const ext = document.createElement('span');
      ext.className = 'item__ext';
      ext.textContent = extLabel(f.name, f.type || '');
      chip.appendChild(ext);
    }
    fileStrip.appendChild(chip);
  });
}

function resetFileSelection() {
  fileInput.value = '';
  filePreview.style.display = 'none';
  clearFileStrip();
  uploadBtn.disabled = true;
  uploadBtn.textContent = UPLOAD_IDLE_LABEL;
}

function handleFileSelect() {
  const list = fileInput.files;
  if (list && list.length > 0) {
    const files = [...list];
    if (files.length === 1) {
      fileName.textContent = files[0].name;
      fileSize.textContent = formatFileSize(files[0].size);
      if (isHeicFile(files[0])) {
        fileSize.textContent += ' · JPEGに変換';
      }
    } else {
      fileName.textContent = `${files.length}件のファイル`;
      const total = files.reduce((sum, f) => sum + f.size, 0);
      fileSize.textContent = `合計 ${formatFileSize(total)}`;
    }
    renderFileStrip(files);
    filePreview.style.display = 'block';
    status.textContent = '';
    status.classList.remove('success', 'error');
    uploadBtn.disabled = false;
    uploadBtn.textContent = files.length > 1 ? `${files.length}件をPCへ送る` : 'PCへ送る';
  } else {
    resetFileSelection();
  }
}

async function uploadFileWithFallback(file) {
  const dataUrl = await encodeFileAsDataURL(file);
  const payload = {
    type: 'file',
    name: file.name,
    size: file.size,
    mimeType: file.type,
    data: dataUrl,
    timestamp: Date.now(),
  };
  try {
    await putFile(db, sessionId, payload);
  } catch (error) {
    const fileId = Math.random().toString(36).substring(2, 10);
    const parentRef = dbRef(db, `files/${sessionId}`);
    await update(parentRef, {
      [fileId]: payload,
      timestamp: payload.timestamp,
      size: payload.size,
    });
  }
}

async function uploadFile() {
  if (fileInput.files.length === 0) return;
  const files = [...fileInput.files];

  if (!sessionId) {
    status.textContent = 'エラー: セッションIDが見つかりません';
    status.classList.add('error');
    showToast('セッションが見つかりません。QRコードから再度アクセスしてください', 'error', 4000);
    return;
  }

  for (const file of files) {
    if (file.size > MAX_FILE_SIZE_BYTES) {
      status.textContent = `${file.name} が大きすぎます (最大${MAX_FILE_SIZE_MB}MB)`;
      status.classList.add('error');
      showToast(`${file.name}: 最大${MAX_FILE_SIZE_MB}MBまで`, 'error');
      return;
    }
  }

  uploadBtn.disabled = true;
  progressContainer.style.display = 'block';
  progressBar.style.width = '0%';
  status.textContent = files.length > 1 ? `${files.length}件を送信中…` : '送信中…';
  status.classList.remove('success', 'error');

  try {
    for (let i = 0; i < files.length; i++) {
      let file = files[i];
      if (isHeicFile(file)) {
        status.textContent = `${file.name} をJPEGに変換中…`;
        file = await normalizeImageFile(file);
      }
      const base = i / files.length;
      if (isP2PReady()) {
        setConnectionState(CONNECTION_STATE.TRANSFERRING, { detail: `${file.name} (${i + 1}/${files.length})` });
        await sendFileOverChannel(dataChannel, file, (p) => {
          progressBar.style.width = `${Math.round((base + p / files.length) * 100)}%`;
          setTransferProgress(base + p / files.length, file.name);
        });
      } else {
        await uploadFileWithFallback(file);
        progressBar.style.width = `${Math.round(((i + 1) / files.length) * 100)}%`;
      }
    }
    progressBar.style.width = '100%';
    status.textContent = '送信しました';
    status.classList.add('success');
    showToast('PCへ送信しました', 'success');
    resetFileSelection();
    setConnectionState(CONNECTION_STATE.COMPLETE, { detail: '送信完了', progress: 1 });
    setTimeout(() => {
      progressContainer.style.display = 'none';
      status.textContent = '続けて送れます';
      status.classList.remove('success');
      setConnectionState(CONNECTION_STATE.CONNECTED, { detail: '追加送信可能', progress: 0 });
    }, 1500);
  } catch (error) {
    console.error('ファイルアップロードエラー:', error);
    status.textContent = `送信できませんでした（${error?.message || 'unknown'}）`;
    status.classList.add('error');
    showToast('送信に失敗しました', 'error');
    uploadBtn.disabled = false;
    progressContainer.style.display = 'none';
  }
}

function updateTextComposer() {
  const value = textInput.value.trim();
  textSendBtn.disabled = !value;
  if (value && isHttpUrl(value)) {
    document.getElementById('url-preview-url').textContent = value;
    urlPreview.classList.add('show');
    textSendBtn.textContent = 'リンクをPCへ送る';
  } else {
    urlPreview.classList.remove('show');
    textSendBtn.textContent = value ? 'テキストをPCへ送る' : '送信';
  }
}

function flashStatus(el, text, kind) {
  el.textContent = text;
  el.classList.remove('success', 'error');
  if (kind) el.classList.add(kind);
  if (kind === 'success') {
    setTimeout(() => {
      el.textContent = '';
      el.classList.remove('success');
    }, 1800);
  }
}

async function shareUrlWithFallback(url) {
  try {
    await putUrl(db, sessionId, url);
  } catch (error) {
    const urlId = Math.random().toString(36).substring(2, 10);
    const u = new URL(url);
    const payload = {
      type: 'url',
      url,
      title: u.hostname,
      name: u.hostname,
      description: 'リンク',
      hostname: u.hostname,
      size: 0,
      mimeType: 'text/url',
      timestamp: Date.now(),
    };
    await update(dbRef(db, `files/${sessionId}`), {
      [urlId]: payload,
      timestamp: payload.timestamp,
      size: payload.size,
    });
  }
}

/** テキスト欄の内容を、URL ならリンク、それ以外はテキストとして送る */
async function sendTextOrUrl() {
  const value = textInput.value.trim();
  if (!value) return;
  if (!sessionId) {
    flashStatus(urlStatus, 'セッションが見つかりません', 'error');
    showToast('セッションが見つかりません', 'error');
    return;
  }
  const asUrl = isHttpUrl(value);
  textSendBtn.disabled = true;
  flashStatus(urlStatus, '送信中…');
  try {
    if (isP2PReady()) {
      sendTextOverChannel(dataChannel, value);
    } else if (asUrl) {
      await shareUrlWithFallback(value);
    } else {
      await putText(db, sessionId, value);
    }
    flashStatus(urlStatus, asUrl ? 'リンクを送信しました' : 'テキストを送信しました', 'success');
    showToast(asUrl ? 'リンクを送信しました' : 'テキストを送信しました', 'success');
    textInput.value = '';
    updateTextComposer();
    setConnectionState(CONNECTION_STATE.COMPLETE, { detail: '送信完了', progress: 1 });
    setTimeout(() => setConnectionState(CONNECTION_STATE.CONNECTED, { detail: '続けて送れます', progress: 0 }), 1500);
  } catch (error) {
    console.error('テキスト送信エラー:', error);
    flashStatus(urlStatus, `送信できませんでした（${error?.message || 'unknown'}）`, 'error');
    showToast('送信できませんでした', 'error');
    textSendBtn.disabled = false;
  }
}

uploadArea.addEventListener('click', () => fileInput.click());
uploadArea.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    fileInput.click();
  }
});
uploadArea.addEventListener('dragover', (e) => { e.preventDefault(); uploadArea.classList.add('dragover'); });
uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('dragover'));
uploadArea.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadArea.classList.remove('dragover');
  if (e.dataTransfer.files.length > 0) {
    fileInput.files = e.dataTransfer.files;
    handleFileSelect();
  }
});
fileInput.addEventListener('change', handleFileSelect);
uploadBtn.addEventListener('click', uploadFile);

textInput.addEventListener('input', updateTextComposer);
textSendBtn.addEventListener('click', sendTextOrUrl);

document.getElementById('authInput')?.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') submitJoinCode();
});
document.getElementById('authInput')?.addEventListener('input', (e) => {
  e.target.classList.toggle('is-long', /[^\d\s]/.test(e.target.value));
});

document.addEventListener('DOMContentLoaded', async () => {
  initTabs();
  subscribeConnectionState(updateMobileConnectionUI);
  if (restoreJoinSession()) {
    await bootstrapSession();
  } else {
    document.getElementById('authInput')?.focus();
  }
  document.getElementById('fallbackRelayBtn')?.addEventListener('click', () => switchToRelayMode());
});

registerServiceWorker();

window.addEventListener('beforeunload', () => {
  detachOutbox?.();
  if (sessionId) clearMobilePresence(db, sessionId).catch(() => {});
});

window.submitJoinCode = submitJoinCode;
window.switchToRelayMode = switchToRelayMode;
window.closeImageModal = closeImageModal;
window.downloadModalImage = downloadModalImage;
