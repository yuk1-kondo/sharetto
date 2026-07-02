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

function appendMobileReceivedFile(file, tag = 'PCから') {
  showMobileReceivePanel();
  const list = document.getElementById('mobileReceiveList');
  const empty = list?.querySelector('.no-files');
  if (empty) empty.remove();
  if (!list) return;

  const url = URL.createObjectURL(file.blob);
  const div = document.createElement('div');
  div.className = 'file-item';
  const isImage = file.mimeType?.startsWith('image/');
  div.innerHTML = `
    <div class="file-info">
      <div class="file-details">
        <div class="file-name">${isImage ? '🖼️' : '📄'} ${file.name} <span class="tag-direct">${tag}</span></div>
        <div class="file-size">${formatFileSize(file.size)}</div>
      </div>
      <div class="file-actions">
        <a href="${url}" download="${file.name}" class="download-btn">⬇️ 保存</a>
      </div>
    </div>`;
  if (isImage) {
    const thumb = document.createElement('div');
    thumb.className = 'file-thumbnail';
    const img = document.createElement('img');
    img.src = url;
    img.alt = file.name;
    thumb.appendChild(img);
    div.querySelector('.file-info').prepend(thumb);
  }
  list.prepend(div);
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
  showMobileReceivePanel();
  const list = document.getElementById('mobileReceiveList');
  const empty = list?.querySelector('.no-files');
  if (empty) empty.remove();
  if (!list) return;

  const div = document.createElement('div');
  div.className = 'file-item';
  const info = document.createElement('div');
  info.className = 'file-info';
  const details = document.createElement('div');
  details.className = 'file-details';
  const title = document.createElement('div');
  title.className = 'file-name';
  title.innerHTML = `🔗 ${item.name || 'URL'} <span class="tag-direct">サーバー経由</span>`;
  const linkRow = document.createElement('div');
  linkRow.className = 'file-size';
  const link = document.createElement('a');
  link.href = item.url;
  link.target = '_blank';
  link.rel = 'noopener';
  link.textContent = item.url;
  linkRow.appendChild(link);
  details.append(title, linkRow);
  info.appendChild(details);
  div.appendChild(info);
  list.prepend(div);
  showToast('PCからURLを受信しました', 'success');
}

function appendMobileReceivedText(text, tag = 'PCから') {
  showMobileReceivePanel();
  const list = document.getElementById('mobileReceiveList');
  const empty = list?.querySelector('.no-files');
  if (empty) empty.remove();
  if (!list) return;

  const div = document.createElement('div');
  div.className = 'file-item';
  const safe = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  div.innerHTML = `
    <div class="file-info">
      <div class="file-details">
        <div class="file-name">💬 テキスト <span class="tag-direct">${tag}</span></div>
        <div class="file-size" style="white-space:pre-wrap;margin-top:6px">${safe}</div>
      </div>
    </div>`;
  list.prepend(div);
  showToast('PCからテキストを受信しました', 'success');
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
const progressContainer = document.getElementById('progress-container');
const progressBar = document.getElementById('progress-bar');
const status = document.getElementById('status');

const urlInput = document.getElementById('url-input');
const urlShareBtn = document.getElementById('url-share-btn');
const urlStatus = document.getElementById('url-status');
const urlPreview = document.getElementById('url-preview');

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
      progressContainer.style.display = 'none';
      status.textContent = '別のファイルを送信できます';
      setConnectionState(CONNECTION_STATE.CONNECTED, { detail: '追加送信可能', progress: 0 });
    }, 1500);
  } catch (error) {
    console.error('ファイルアップロードエラー:', error);
    status.textContent = `送信に失敗しました: ${error?.message || 'unknown'}`;
    status.classList.add('error');
    showToast('送信に失敗しました', 'error');
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
  if (e.key === 'Enter') submitJoinCode();
});

document.addEventListener('DOMContentLoaded', async () => {
  document.body.classList.add('sharetto-app');
  initTabs();
  subscribeConnectionState(updateMobileConnectionUI);
  connectionVisual = await initConnectionVisual(document.getElementById('connection-visual-mobile'));
  if (restoreJoinSession()) {
    await bootstrapSession();
  } else {
    document.getElementById('authInput')?.focus();
  }
  document.getElementById('fallbackRelayBtn')?.addEventListener('click', () => switchToRelayMode());
  document.getElementById('text-send-btn')?.addEventListener('click', async () => {
    const text = document.getElementById('text-input')?.value?.trim();
    if (!text || !sessionId) return;
    if (isP2PReady()) {
      sendTextOverChannel(dataChannel, text);
      showToast('テキストを送信しました', 'success');
    } else {
      await putText(db, sessionId, text);
      showToast('テキストを送信しました（サーバー経由）', 'success');
    }
    document.getElementById('text-input').value = '';
    setConnectionState(CONNECTION_STATE.COMPLETE, { detail: 'テキスト送信完了', progress: 1 });
    setTimeout(() => setConnectionState(CONNECTION_STATE.CONNECTED, { detail: '追加送信可能', progress: 0 }), 1500);
  });
});

registerServiceWorker();

window.addEventListener('beforeunload', () => {
  connectionVisual?.destroy();
  detachOutbox?.();
  if (sessionId) clearMobilePresence(db, sessionId).catch(() => {});
});

window.submitJoinCode = submitJoinCode;
window.switchToRelayMode = switchToRelayMode;
