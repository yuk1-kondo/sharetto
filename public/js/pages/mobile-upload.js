/**
 * モバイルアップロードページ (upload.html) のエントリポイント
 */
import { initFirebase, dbRef, onValue, off, get, update } from '../firebase.js';
import { encodeFileAsDataURL, putFile, putUrl } from '../files-save.js';
import { decryptSessionId } from '../crypto.js';
import { formatFileSize } from '../utils.js';
import { showToast } from '../toast.js';
import {
  AUTH_SESSION_KEY,
  AUTH_EXPIRES_KEY,
  AUTH_SESSION_DURATION_MS,
  MAX_FILE_SIZE_BYTES,
  MAX_FILE_SIZE_MB,
  TRANSFER_MODE,
  CONNECTION_STATE,
} from '../constants.js';
import { createP2PGuest, sendFileOverChannel, sendTextOverChannel } from '../webrtc/guest.js';
import { setConnectionState, subscribeConnectionState, setTransferProgress } from '../connection-state.js';
import { firebaseConfig } from '../../config.js';

const { db } = initFirebase(firebaseConfig);

const urlParams = new URLSearchParams(window.location.search);
let sessionId = urlParams.get('session') || null;
const encCt = urlParams.get('ct');
const encIv = urlParams.get('iv');
const encSalt = urlParams.get('salt');

let transferMode = urlParams.get('mode') === 'relay' ? TRANSFER_MODE.RELAY : TRANSFER_MODE.P2P;
let p2pGuest = null;
let dataChannel = null;

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
  const badge = document.getElementById('mobileConnectionBadge');
  const detail = document.getElementById('mobileConnectionDetail');
  if (badge) { badge.textContent = snap.label; badge.dataset.state = snap.state; }
  if (detail) detail.textContent = snap.detail || '';
}

function switchToRelayMode(reason) {
  transferMode = TRANSFER_MODE.RELAY;
  p2pGuest?.stop();
  p2pGuest = null;
  dataChannel = null;
  const fb = document.getElementById('fallbackRelayBtn');
  if (fb) fb.hidden = true;
  showToast(reason || 'サーバー経由モードに切り替えました', 'info', 3500);
  setConnectionState(CONNECTION_STATE.WAITING, { detail: 'サーバー経由で送信できます' });
}

async function initP2PConnection() {
  if (transferMode !== TRANSFER_MODE.P2P || !sessionId) return;
  const fb = document.getElementById('fallbackRelayBtn');
  if (fb) fb.hidden = false;
  p2pGuest = createP2PGuest({
    db, sessionId,
    onConnected: (ch) => { dataChannel = ch; showToast('直接接続しました', 'success'); },
    onFailed: () => switchToRelayMode('直接接続できませんでした'),
  });
  try {
    dataChannel = await p2pGuest.connect();
  } catch (e) {
    console.warn('[mobile] P2P failed', e);
    switchToRelayMode('直接接続できませんでした');
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

const urlInput = document.getElementById('url-input');
const urlShareBtn = document.getElementById('url-share-btn');
const urlStatus = document.getElementById('url-status');
const urlPreview = document.getElementById('url-preview');

function persistAuth() {
  const expires = Date.now() + AUTH_SESSION_DURATION_MS;
  localStorage.setItem(AUTH_SESSION_KEY, 'authenticated');
  localStorage.setItem(AUTH_EXPIRES_KEY, expires.toString());
}

async function authenticate() {
  const password = document.getElementById('authInput').value;
  const errorDiv = document.getElementById('authError');

  if (encCt && encIv && encSalt) {
    try {
      const sid = await decryptSessionId(password, encCt, encIv, encSalt);
      if (!sid || sid.length < 6) throw new Error('invalid sid');
      sessionId = sid;
      persistAuth();
      showMainContent();
      errorDiv.style.display = 'none';
      showToast('セッションに参加しました', 'success');
      return;
    } catch (e) {
      console.error('復号失敗', e);
      errorDiv.textContent = '参加コードが違います';
      errorDiv.style.display = 'block';
      document.getElementById('authInput').value = '';
      setTimeout(() => { errorDiv.style.display = 'none'; }, 3000);
      return;
    }
  }

  errorDiv.style.display = 'block';
  document.getElementById('authInput').value = '';
  setTimeout(() => { errorDiv.style.display = 'none'; }, 3000);
}

function showMainContent() {
  document.getElementById('authOverlay').style.display = 'none';
  document.getElementById('mainContent').classList.add('authenticated');
}

function checkAuthentication() {
  if (sessionId && sessionId.length >= 6) {
    persistAuth();
    showMainContent();
    return true;
  }
  if (encCt && encIv && encSalt) return false;

  const authSession = localStorage.getItem(AUTH_SESSION_KEY);
  const authExpires = localStorage.getItem(AUTH_EXPIRES_KEY);
  if (authSession === 'authenticated' && authExpires && Date.now() < parseInt(authExpires, 10)) {
    showMainContent();
    return true;
  }
  localStorage.removeItem(AUTH_SESSION_KEY);
  localStorage.removeItem(AUTH_EXPIRES_KEY);
  return false;
}

function initTabs() {
  const tabButtons = document.querySelectorAll('.tab-button');
  const tabContents = document.querySelectorAll('.tab-content');
  tabButtons.forEach((button) => {
    button.addEventListener('click', function onTabClick() {
      const targetTab = this.getAttribute('data-tab');
      tabButtons.forEach((btn) => btn.classList.remove('active'));
      tabContents.forEach((content) => content.classList.remove('active'));
      this.classList.add('active');
      document.getElementById(`${targetTab}-tab`).classList.add('active');
    });
  });
}

function handleFileSelect() {
  if (fileInput.files.length > 0) {
    const file = fileInput.files[0];
    fileName.textContent = file.name;
    fileSize.textContent = formatFileSize(file.size);
    filePreview.style.display = 'block';
    uploadBtn.disabled = false;
    uploadBtn.classList.add('btn-sticky');
  } else {
    uploadBtn.disabled = true;
    uploadBtn.classList.remove('btn-sticky');
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
  const file = fileInput.files[0];

  if (!sessionId) {
    status.textContent = 'エラー: セッションIDが見つかりません';
    status.classList.add('error');
    showToast('セッションが見つかりません。QRコードから再度アクセスしてください', 'error', 4000);
    return;
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    status.textContent = `ファイルサイズが大きすぎます (最大${MAX_FILE_SIZE_MB}MB)`;
    status.classList.add('error');
    showToast(`最大${MAX_FILE_SIZE_MB}MBまでアップロードできます`, 'error');
    return;
  }

  uploadBtn.disabled = true;
  progressContainer.style.display = 'block';
  progressBar.style.width = '0%';
  status.textContent = 'ファイルを読み込み中...';
  status.classList.remove('success', 'error');

  try {
    progressBar.style.width = '30%';
    if (isP2PReady()) {
      setConnectionState(CONNECTION_STATE.TRANSFERRING, { detail: file.name });
      await sendFileOverChannel(dataChannel, file, (p) => {
        progressBar.style.width = `${Math.round(p * 100)}%`;
        setTransferProgress(p, file.name);
      });
    } else {
      await uploadFileWithFallback(file);
    }
    progressBar.style.width = '100%';
    status.textContent = 'アップロード完了！';
    status.classList.add('success');
    showToast('アップロード完了！', 'success');
    fileInput.value = '';
    filePreview.style.display = 'none';
    uploadBtn.disabled = true;
    uploadBtn.classList.remove('btn-sticky');
    setTimeout(() => {
      progressContainer.style.display = 'none';
      status.textContent = '別のファイルをアップロードできます';
    }, 1500);
  } catch (error) {
    console.error('ファイルアップロードエラー:', error);
    status.textContent = `アップロードに失敗しました: ${error?.message || 'unknown'}`;
    status.classList.add('error');
    showToast('アップロードに失敗しました', 'error');
    uploadBtn.disabled = false;
    progressContainer.style.display = 'none';
  }
}

function isValidURL(string) {
  try {
    new URL(string);
    return true;
  } catch {
    return false;
  }
}

function showUrlPreview(url) {
  document.getElementById('url-preview-title').textContent = 'URL共有';
  document.getElementById('url-preview-description').textContent = 'このURLが共有されます';
  document.getElementById('url-preview-url').textContent = url;
  urlPreview.classList.add('show');
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

async function shareUrl() {
  const url = urlInput.value.trim();
  if (!url) return;

  if (!sessionId) {
    urlStatus.textContent = 'エラー: セッションIDが見つかりません';
    urlStatus.classList.add('error');
    showToast('セッションが見つかりません', 'error');
    return;
  }

  urlShareBtn.disabled = true;
  urlStatus.textContent = 'URL共有中...';
  urlStatus.classList.remove('success', 'error');

  try {
    if (isP2PReady()) {
      sendTextOverChannel(dataChannel, url);
      urlStatus.textContent = 'URL送信完了！';
    } else {
      await shareUrlWithFallback(url);
      urlStatus.textContent = 'URL共有完了！';
    }
    urlStatus.classList.add('success');
    showToast('URLを共有しました', 'success');
    urlInput.value = '';
    urlPreview.classList.remove('show');
    urlShareBtn.disabled = true;
    urlShareBtn.classList.remove('btn-sticky');
    setTimeout(() => {
      urlStatus.textContent = '';
      urlStatus.classList.remove('success');
    }, 1500);
  } catch (error) {
    console.error('URL共有エラー:', error);
    urlStatus.textContent = `URL共有に失敗しました: ${error?.message || 'unknown'}`;
    urlStatus.classList.add('error');
    showToast('URL共有に失敗しました', 'error');
    urlShareBtn.disabled = false;
  }
}

uploadArea.addEventListener('click', () => fileInput.click());
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

urlInput.addEventListener('input', function onUrlInput() {
  const url = this.value.trim();
  if (url && isValidURL(url)) {
    urlShareBtn.disabled = false;
    urlShareBtn.classList.add('btn-sticky');
    showUrlPreview(url);
  } else {
    urlShareBtn.disabled = true;
    urlShareBtn.classList.remove('btn-sticky');
    urlPreview.classList.remove('show');
  }
});
urlShareBtn.addEventListener('click', shareUrl);

document.getElementById('authInput')?.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') authenticate();
});

document.addEventListener('DOMContentLoaded', async () => {
  initTabs();
  subscribeConnectionState(updateMobileConnectionUI);
  if (checkAuthentication()) {
    await initP2PConnection();
  } else {
    document.getElementById('authInput')?.focus();
  }
  document.getElementById('fallbackRelayBtn')?.addEventListener('click', () => switchToRelayMode());
  document.getElementById('text-send-btn')?.addEventListener('click', async () => {
    const text = document.getElementById('text-input')?.value?.trim();
    if (!text) return;
    if (isP2PReady()) {
      sendTextOverChannel(dataChannel, text);
      showToast('テキストを送信しました', 'success');
      document.getElementById('text-input').value = '';
    } else {
      showToast('直接接続が必要です。サーバー経由ではテキストのみURLタブをご利用ください', 'info');
    }
  });
});

window.authenticate = authenticate;
window.switchToRelayMode = switchToRelayMode;
