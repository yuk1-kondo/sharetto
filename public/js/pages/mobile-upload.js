/**
 * 送信側ページ (upload.html) のエントリポイント
 * スマホ・PCどちらから開いても、送受信を時系列で並べるタイムライン + 下部の入力バー。
 */
import { initFirebase, dbRef, onValue, off, get, update } from '../firebase.js';
import { encodeFileAsDataURL, putFile, putUrl, putText } from '../files-save.js';
import { resolveJoinCode } from '../session.js';
import { parseJoinInput } from '../utils.js';
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
import { isHttpUrl } from '../file-items.js';
import { createTimeline } from '../timeline.js';
import { bindComposer, applyModifierLabels } from '../composer.js';
import { initPasteToSend, initDropToSend } from '../desktop-input.js';
import { markIncoming } from '../attention.js';
import {
  viewFullImage, closeImageModal, downloadModalImage, downloadFile, copyToClipboard,
} from '../ui.js';
import { normalizeImageFile, isHeicFile } from '../heic-convert.js';
import { announceMobileJoin, clearMobilePresence } from '../relay-presence.js';
import { attachOutboxListener } from '../relay-outbox.js';

const { db } = initFirebase(firebaseConfig);

const urlParams = new URLSearchParams(window.location.search);
let sessionId = urlParams.get('session') || null;

let transferMode = urlParams.get('mode') === 'relay' ? TRANSFER_MODE.RELAY : TRANSFER_MODE.P2P;
let p2pGuest = null;
let dataChannel = null;
let detachOutbox = null;

const DIRECT_TAG = '直接';
const RELAY_TAG = 'サーバー経由';

const itemHandlers = {
  onDownload: downloadFile,
  onViewImage: viewFullImage,
  onCopy: (text) => copyToClipboard(text, 'コピーしました'),
};

const timeline = createTimeline(document.getElementById('timeline'), itemHandlers);
const fileInput = document.getElementById('file-input');
const textInput = document.getElementById('text-input');
const textSendBtn = document.getElementById('text-send-btn');
const composer = bindComposer(textInput, { onSend: sendTextOrUrl, onChange: updateTextComposer });

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
  if (!relaySessionStarted) {
    relaySessionStarted = true;
    detachOutbox = attachOutboxListener(db, sessionId, {
      onFile: appendReceivedRelayFile,
      onUrl: appendReceivedRelayUrl,
      onText: (item) => appendReceivedText(item.text, RELAY_TAG),
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

/* ── 受信 ─────────────────────────────────── */

function appendReceivedFile(file, tag = DIRECT_TAG) {
  timeline.file({
    name: file.name,
    size: file.size ?? file.blob.size,
    mimeType: file.mimeType,
    data: URL.createObjectURL(file.blob),
    timestamp: Date.now(),
  }, 'in', tag);
  markIncoming();
}

async function appendReceivedRelayFile(item) {
  try {
    const res = await fetch(item.data);
    const blob = await res.blob();
    appendReceivedFile({
      name: item.name,
      blob,
      mimeType: item.mimeType,
      size: item.size ?? blob.size,
    }, RELAY_TAG);
  } catch (e) {
    console.warn('[mobile] relay file receive failed', e);
    showToast('ファイルの受信に失敗しました', 'error');
  }
}

function appendReceivedRelayUrl(item) {
  timeline.url({ url: item.url, title: item.name, timestamp: item.timestamp }, 'in', RELAY_TAG);
  markIncoming();
}

function appendReceivedText(text, tag = DIRECT_TAG) {
  if (tag === DIRECT_TAG) timeline.message(text, 'in', tag);
  else timeline.text({ text, timestamp: Date.now() }, 'in', tag);
  markIncoming();
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
      onFile: (file) => appendReceivedFile(file, DIRECT_TAG),
      onText: (text) => appendReceivedText(text, DIRECT_TAG),
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

/* ── 参加 ─────────────────────────────────── */

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

/* ── 送信 ─────────────────────────────────── */

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

let sendQueue = Promise.resolve();

/** 送信は1本のデータチャネルを共有するため、必ず順番に流す */
function enqueueSend(task) {
  const run = sendQueue.then(task, task);
  sendQueue = run.catch(() => {});
  return run;
}

/** プレビューに使う MIME。HEIC は多くのブラウザで表示できないのでアイコン表示にする */
function previewMime(file) {
  return isHeicFile(file) ? 'application/octet-stream' : file.type;
}

/**
 * 選んだ・ドロップした・貼り付けたファイルを、その場でタイムラインに並べて順に送る。
 */
function sendFilesNow(fileList) {
  const files = [...(fileList || [])];
  if (!files.length) return Promise.resolve();
  if (!sessionId) {
    showToast('セッションが見つかりません。QRコードから再度アクセスしてください', 'error', 4000);
    return Promise.resolve();
  }
  const tag = isP2PReady() ? DIRECT_TAG : RELAY_TAG;
  const jobs = files.map((file) => {
    const msg = timeline.file({
      name: file.name,
      size: file.size,
      mimeType: previewMime(file),
      data: URL.createObjectURL(file),
      timestamp: Date.now(),
    }, 'out', tag);
    const bubble = timeline.progress(msg);
    if (file.size > MAX_FILE_SIZE_BYTES) {
      bubble.fail(`大きすぎます（最大${MAX_FILE_SIZE_MB}MB）`);
      return null;
    }
    return { file, bubble };
  }).filter(Boolean);
  if (!jobs.length) return Promise.resolve();
  return enqueueSend(() => sendJobs(jobs));
}

async function sendJobs(jobs) {
  let sent = 0;
  for (let i = 0; i < jobs.length; i++) {
    const { bubble } = jobs[i];
    let { file } = jobs[i];
    const label = jobs.length > 1 ? `${file.name}（${i + 1}/${jobs.length}）` : file.name;
    try {
      if (isHeicFile(file)) {
        setConnectionState(CONNECTION_STATE.TRANSFERRING, { detail: `${file.name} をJPEGに変換中`, progress: 0 });
        file = await normalizeImageFile(file);
      }
      setConnectionState(CONNECTION_STATE.TRANSFERRING, { detail: `${label} を送信中`, progress: 0 });
      if (isP2PReady()) {
        await sendFileOverChannel(dataChannel, file, (p) => {
          bubble.set(p);
          setTransferProgress(p, `${label} を送信中`);
        });
      } else {
        bubble.set(0.5);
        await uploadFileWithFallback(file);
      }
      bubble.done();
      sent += 1;
    } catch (error) {
      console.error('ファイル送信エラー:', error);
      bubble.fail(`送信できませんでした（${error?.message || 'unknown'}）`);
    }
  }
  if (sent > 0) {
    setConnectionState(CONNECTION_STATE.COMPLETE, { detail: '送信完了', progress: 1 });
    setTimeout(reassertConnected, 1200);
  } else {
    reassertConnected();
  }
}

function updateTextComposer() {
  const value = textInput.value.trim();
  textSendBtn.disabled = !value;
  const detect = document.getElementById('textDetect');
  if (detect) detect.hidden = !isHttpUrl(value);
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

/** 入力欄の内容を、URL ならリンク、それ以外はテキストとして送る */
async function sendTextOrUrl() {
  const value = textInput.value.trim();
  if (!value) return;
  if (!sessionId) {
    showToast('セッションが見つかりません', 'error');
    return;
  }
  const asUrl = isHttpUrl(value);
  const viaP2P = isP2PReady();
  const msg = timeline.message(value, 'out', viaP2P ? DIRECT_TAG : RELAY_TAG);
  composer.reset();
  try {
    if (viaP2P) {
      sendTextOverChannel(dataChannel, value);
    } else if (asUrl) {
      await shareUrlWithFallback(value);
    } else {
      await putText(db, sessionId, value);
    }
  } catch (error) {
    console.error('テキスト送信エラー:', error);
    timeline.progress(msg).fail(`送信できませんでした（${error?.message || 'unknown'}）`);
  }
}

function pickFiles() {
  fileInput.click();
}

fileInput.addEventListener('change', () => {
  const picked = [...(fileInput.files || [])];
  fileInput.value = '';
  sendFilesNow(picked);
});
document.getElementById('attachBtn')?.addEventListener('click', pickFiles);
document.getElementById('heroAttachBtn')?.addEventListener('click', pickFiles);
textSendBtn.addEventListener('click', sendTextOrUrl);

document.getElementById('authInput')?.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') submitJoinCode();
});
document.getElementById('authInput')?.addEventListener('input', (e) => {
  e.target.classList.toggle('is-long', /[^\d\s]/.test(e.target.value));
});

function canSendNow() {
  return Boolean(sessionId) && document.getElementById('mainContent').classList.contains('authenticated');
}

function initDesktopInput() {
  const blocked = () => showToast('参加してから送れます', 'info');
  initDropToSend({
    overlay: document.getElementById('dropOverlay'),
    canSend: canSendNow,
    onFiles: sendFilesNow,
    onBlocked: blocked,
  });
  initPasteToSend({
    canSend: canSendNow,
    onFiles: sendFilesNow,
    onText: (text) => {
      composer.set(text);
      textInput.focus();
    },
    onBlocked: blocked,
  });
  applyModifierLabels();
}

document.addEventListener('DOMContentLoaded', async () => {
  initDesktopInput();
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
