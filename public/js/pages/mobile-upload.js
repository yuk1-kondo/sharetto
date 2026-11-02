/**
 * モバイルアップロードページ (upload.html) のエントリポイント
 */
import { initFirebase, dbRef, onValue, off, get, update } from '../firebase.js';
import { encodeFileAsDataURL, putFile, putText } from '../files-save.js';
import { resolveJoinCode, getSession, isSessionActive, watchSession } from '../session.js';
import { createFileItem, createTextItem, createUrlItem } from '../file-items.js';
import { viewFullImage, closeImageModal, downloadModalImage, downloadFile, copyToClipboard } from '../ui.js';
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
} from '../constants.js';
import { createP2PGuest, sendFileOverChannel, sendTextOverChannel } from '../webrtc/guest.js';
import { setConnectionState, subscribeConnectionState, setTransferProgress } from '../connection-state.js';
import { firebaseConfig } from '../../config.js';
import { registerServiceWorker } from '../pwa.js';
import { initConnectionVisual } from '../visual/connection-visual.js';
import { normalizeImageFile, isHeicFile } from '../heic-convert.js';
import { announceMobileJoin, clearMobilePresence } from '../relay-presence.js';
import { attachOutboxListener } from '../relay-outbox.js';

const { db, fs } = initFirebase(firebaseConfig);

const urlParams = new URLSearchParams(window.location.search);
let sessionId = urlParams.get('session') || null;

let transferMode = urlParams.get('mode') === 'relay' ? TRANSFER_MODE.RELAY : TRANSFER_MODE.P2P;
let p2pGuest = null;
let dataChannel = null;
let connectionVisual = null;
let detachOutbox = null;
let detachSession = null;
let sessionDeadline = 0;
let sessionClosed = true;
let expiryTimeout = null;

function closeMobileSession() {
  sessionClosed = true;
  clearTimeout(expiryTimeout);
  p2pGuest?.stop();
  dataChannel = null;
  detachOutbox?.();
  relaySessionStarted = false;
  document.querySelectorAll('#upload-btn, #file-input, #text-input, #text-send-btn').forEach((el) => { el.disabled = true; });
  setConnectionState(CONNECTION_STATE.IDLE, { detail: 'セッションは終了しました。PCの新しいQRコードから参加してください' });
}

function canSend() {
  if (sessionClosed || sessionDeadline <= Date.now()) {
    closeMobileSession();
    showToast('セッションは終了しています', 'error');
    return false;
  }
  return true;
}


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
  if (sessionClosed) return;
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
  try {
    const session = await getSession(db, sessionId);
    if (!isSessionActive(session)) { closeMobileSession(); return; }
    sessionClosed = false;
    sessionDeadline = session.expiresAt;
    detachSession?.();
    detachSession = watchSession(db, sessionId, (value) => {
      clearTimeout(expiryTimeout);
      if (!isSessionActive(value)) { closeMobileSession(); return; }
      sessionDeadline = value.expiresAt;
      expiryTimeout = setTimeout(closeMobileSession, Math.min(sessionDeadline - Date.now(), 2147483647));
    }, closeMobileSession);
  } catch (error) {
    closeMobileSession();
    showToast('セッションを確認できませんでした。再読み込みしてください', 'error');
    return;
  }
  await initRelaySession();
  const fb = document.getElementById('fallbackRelayBtn');
  if (fb) fb.hidden = true;
  attemptP2PUpgrade();
}

function showMobileReceivePanel() {
  const panel = document.getElementById('mobileReceivePanel');
  if (panel) panel.hidden = false;
}

function appendMobileReceivedFile(file, tag = 'PCから') {
  showMobileReceivePanel();
  const list = document.getElementById('mobileReceiveList');
  const empty = list?.querySelector('.no-files');
  if (empty) empty.remove();
  if (!list) return;

  const url = URL.createObjectURL(file.blob);
  list.prepend(createFileItem({ ...file, data: url, timestamp: Date.now() }, {
    onDownload: downloadFile, onViewImage: viewFullImage,
  }));
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

function appendMobileMessage(element) {
  const list = document.getElementById('mobileMessageList');
  list.querySelector('.no-files')?.remove();
  list.prepend(element);
  showToast('文章・URLを受信しました', 'success');
}
const messageHandlers = { onCopy: (text) => copyToClipboard(text) };
function appendMobileReceivedRelayUrl(item) {
  appendMobileMessage(createUrlItem(item, messageHandlers));
}
function appendMobileReceivedText(text) {
  appendMobileMessage(createTextItem({ text, timestamp: Date.now() }, messageHandlers));
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
        if (sessionClosed) { ch.close(); return; }
        dataChannel = ch;
        reassertConnected();
        showToast('直接接続に切り替えました（高速）', 'success', 2500);
      },
      onFailed: () => {},
      onFile: (file) => appendMobileReceivedFile(file, '直接'),
      onText: (text) => appendMobileReceivedText(text, '直接'),
    });
    const connected = await p2pGuest.connect();
    if (sessionClosed) { connected.close(); return; }
    dataChannel = connected;
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
const progressContainer = document.getElementById('progress-container');
const progressBar = document.getElementById('progress-bar');
const status = document.getElementById('status');

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
      const sid = await resolveJoinCode(db, parsed.code);
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

function handleFileSelect() {
  const list = fileInput.files;
  if (list && list.length > 0) {
    if (list.length === 1) {
      fileName.textContent = list[0].name;
      fileSize.textContent = formatFileSize(list[0].size);
      if (isHeicFile(list[0])) {
        fileSize.textContent += ' → 送信時 JPEG に変換';
      }
    } else {
      fileName.textContent = `${list.length} 件のファイル`;
      let total = 0;
      for (const f of list) total += f.size;
      fileSize.textContent = `合計 ${formatFileSize(total)}`;
    }
    filePreview.style.display = 'block';
    uploadBtn.disabled = false;
    uploadBtn.classList.add('btn-sticky');
    uploadBtn.textContent = list.length > 1 ? `${list.length} 件を送信` : 'アップロード';
  } else {
    uploadBtn.disabled = true;
    uploadBtn.classList.remove('btn-sticky');
    uploadBtn.textContent = 'アップロード';
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
  if (!canSend()) return;
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
  status.textContent = files.length > 1 ? `${files.length} 件を送信中...` : 'ファイルを読み込み中...';
  status.classList.remove('success', 'error');

  try {
    for (let i = 0; i < files.length; i++) {
      if (!canSend()) throw new Error('セッションは終了しました');
      let file = files[i];
      if (isHeicFile(file)) {
        status.textContent = `${file.name} を JPEG に変換中...`;
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
    status.textContent = '送信完了！';
    status.classList.add('success');
    showToast('送信完了！', 'success');
    fileInput.value = '';
    filePreview.style.display = 'none';
    uploadBtn.disabled = true;
    uploadBtn.classList.remove('btn-sticky');
    uploadBtn.textContent = 'アップロード';
    setConnectionState(CONNECTION_STATE.COMPLETE, { detail: '送信完了', progress: 1 });
    setTimeout(() => {
      if (sessionClosed) return;
      progressContainer.style.display = 'none';
      status.textContent = '別のファイルを送信できます';
      setConnectionState(CONNECTION_STATE.CONNECTED, { detail: '追加送信可能', progress: 0 });
    }, 1500);
  } catch (error) {
    console.error('ファイルアップロードエラー:', error);
    status.textContent = `送信に失敗しました: ${error?.message || 'unknown'}`;
    status.classList.add('error');
    showToast('送信に失敗しました', 'error');
    uploadBtn.disabled = sessionClosed;
    progressContainer.style.display = 'none';
  }
}

uploadArea.addEventListener('click', () => fileInput.click());
uploadArea.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); } });
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

document.getElementById('authInput')?.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') submitJoinCode();
});

document.addEventListener('DOMContentLoaded', async () => {
  document.body.classList.add('sharetto-app');
  subscribeConnectionState(updateMobileConnectionUI);
  connectionVisual = await initConnectionVisual(document.getElementById('connection-visual-mobile'));
  if (restoreJoinSession()) {
    await bootstrapSession();
  } else {
    document.getElementById('authInput')?.focus();
  }
  document.getElementById('fallbackRelayBtn')?.addEventListener('click', () => switchToRelayMode());
  document.getElementById('text-send-btn')?.addEventListener('click', async () => {
    const input = document.getElementById('text-input');
    const text = input.value;
    if (!text.trim() || !sessionId || !canSend()) return;
    const button = document.getElementById('text-send-btn');
    button.disabled = true;
    try {
      if (isP2PReady()) sendTextOverChannel(dataChannel, text);
      else await putText(db, sessionId, text);
      input.value = '';
      showToast('文章・URLを送信しました', 'success');
    } catch (error) { showToast(error.message || '送信に失敗しました', 'error'); }
    finally { button.disabled = sessionClosed; }
  });
});

registerServiceWorker();

window.addEventListener('beforeunload', () => {
  connectionVisual?.destroy();
  detachOutbox?.();
  if (sessionId) clearMobilePresence(db, sessionId).catch(() => {});
});

window.closeImageModal = closeImageModal;
window.downloadModalImage = downloadModalImage;
window.submitJoinCode = submitJoinCode;
window.switchToRelayMode = switchToRelayMode;
