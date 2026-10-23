/**
 * PC側メインページ (index.html)
 * 未接続：ペアリング画面（QR + 参加コード）
 * 接続後：送受信を時系列で並べるタイムライン + 下部の入力バー
 */
import { initFirebase } from '../firebase.js';
import {
  viewFullImage, closeImageModal, downloadModalImage, downloadFile, copyToClipboard,
} from '../ui.js';
import { attachRelaySidebandListener } from '../files-view.js';
import { issueJoinCode, resolveJoinCode } from '../session.js';
import { initPasteToSend, initDropToSend, onBareDigit } from '../desktop-input.js';
import { markIncoming } from '../attention.js';
import { isHttpUrl } from '../file-items.js';
import { createTimeline } from '../timeline.js';
import { bindComposer, applyModifierLabels, isTouchPrimary } from '../composer.js';
import { createSessionTimer } from '../session-timer.js';
import { renderQRCode } from '../qr-display.js';
import { generateSessionId, generatePin, parseJoinInput } from '../utils.js';
import { showToast } from '../toast.js';
import {
  PIN_CODE_LENGTH, TRANSFER_MODE, CONNECTION_STATE, SESSION_TTL_MS,
} from '../constants.js';
import { subscribeConnectionState, setConnectionState, resetConnectionState, setTransferProgress, visibleStatusDetail } from '../connection-state.js';
import { createP2PHost } from '../webrtc/host.js';
import {
  addReceivedBlob, addReceivedFromDataUrl, getReceivedFiles, subscribeReceivedStore,
} from '../received-store.js';
import { downloadFilesAsZip } from '../zip-save.js';
import { registerServiceWorker } from '../pwa.js';
import { watchMobilePresence } from '../relay-presence.js';
import { putOutboxFile, putOutboxText, putOutboxUrl } from '../relay-outbox.js';
import { firebaseConfig } from '../../config.js';

const { db } = initFirebase(firebaseConfig);

let currentSessionId = null;
let currentJoinCode = null;
let detachRelaySideband = null;
let p2pHost = null;
let transferMode = TRANSFER_MODE.P2P;
let relayMobileConnected = false;
let detachPresence = null;
/** 参加コードは期限切れだが、直接接続を維持しているあいだ true */
let codeExpiredWhileConnected = false;

const RELAY_TAG = 'サーバー経由';
const DIRECT_TAG = '直接';

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

const timeline = createTimeline(document.getElementById('timeline'), itemHandlers);
const textInput = document.getElementById('pcTextSend');
const composer = bindComposer(textInput, { onSend: sendComposerToPhone, onChange: updateComposer });

/* ── 画面の切り替え（ペアリング ⇄ やりとり） ─────────── */

function setView(view) {
  document.body.dataset.view = view;
}

function isPairSheetOpen() {
  return document.body.dataset.pairOpen === 'true';
}

function openPairSheet() {
  document.body.dataset.pairOpen = 'true';
}

function closePairSheet() {
  delete document.body.dataset.pairOpen;
}

/**
 * つながったらやりとりの画面へ。切れても履歴があればその画面に留まり、
 * 何もやりとりしていなければペアリング画面へ戻す。
 */
function syncView() {
  if (isSendReady()) {
    const wasPair = document.body.dataset.view !== 'session';
    setView('session');
    closePairSheet();
    if (wasPair && !isTouchPrimary()) textInput.focus({ preventScroll: true });
    return;
  }
  if (timeline.size === 0) setView('pair');
}

function revealSession() {
  setView('session');
}

/* ── 受信 ─────────────────────────────────── */

function notifyIncoming(message) {
  markIncoming();
  if (isPairSheetOpen() || document.body.dataset.view !== 'session') showToast(message, 'success', 2000);
}

function appendP2PFile(file, peerId) {
  addReceivedBlob({ name: file.name, blob: file.blob, mimeType: file.mimeType, source: 'p2p', peerId });
  timeline.file({
    id: file.id,
    name: file.name,
    size: file.size ?? file.blob.size,
    mimeType: file.mimeType,
    data: URL.createObjectURL(file.blob),
    timestamp: Date.now(),
  }, 'in', DIRECT_TAG);
  revealSession();
  notifyIncoming(`${file.name} を受信しました`);
}

function appendP2PText(text) {
  timeline.message(text, 'in', DIRECT_TAG);
  revealSession();
  notifyIncoming(isHttpUrl(text) ? 'リンクを受信しました' : 'テキストを受信しました');
}

function appendRelayText(item) {
  timeline.text(item, 'in', RELAY_TAG);
  revealSession();
  notifyIncoming('テキストを受信しました');
}

function appendRelayUrl(item) {
  timeline.url(item, 'in', RELAY_TAG);
  revealSession();
  notifyIncoming('リンクを受信しました');
}

function appendRelayFile(item) {
  if (item.data) {
    addReceivedFromDataUrl({ name: item.name, dataUrl: item.data, mimeType: item.mimeType, source: 'relay' });
  }
  timeline.file(item, 'in', RELAY_TAG);
  revealSession();
  notifyIncoming(`${item.name} を受信しました`);
}

function updateZipButton({ count }) {
  const btn = document.getElementById('downloadZipBtn');
  if (!btn) return;
  btn.disabled = count === 0;
  btn.textContent = count > 0 ? `ZIPで保存（${count}）` : 'ZIPで保存';
}

/* ── 接続 ─────────────────────────────────── */

function isRelayConnected() {
  return transferMode === TRANSFER_MODE.RELAY && relayMobileConnected;
}

function isP2PConnected() {
  return p2pHost?.isConnected?.() ?? false;
}

function isSendReady() {
  return isP2PConnected() || isRelayConnected();
}

function currentTag() {
  return isP2PConnected() ? DIRECT_TAG : RELAY_TAG;
}

function updatePcSendPanel(connected) {
  const panel = document.getElementById('pcSendPanel');
  if (panel) panel.dataset.ready = String(Boolean(connected));
  textInput.disabled = !connected;
  const fileBtn = document.getElementById('pcFileSendBtn');
  if (fileBtn) fileBtn.disabled = !connected;
  updateComposer();
  syncView();
}

function updateComposer() {
  const sendBtn = document.getElementById('pcSendBtn');
  const detect = document.getElementById('pcSendDetect');
  const value = textInput.value.trim();
  if (sendBtn) sendBtn.disabled = !isSendReady() || !value;
  if (detect) {
    const asUrl = isHttpUrl(value);
    detect.hidden = !asUrl;
    detect.textContent = 'リンク';
  }
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

async function restartTransferLayer() {
  p2pHost?.stop();
  p2pHost = null;
  relayMobileConnected = false;
  updatePcSendPanel(false);
  if (detachPresence) { try { detachPresence(); } catch { /* noop */ } detachPresence = null; }
  if (detachRelaySideband) { try { detachRelaySideband(); } catch { /* noop */ } detachRelaySideband = null; }

  if (!currentSessionId) return;

  detachRelaySideband = attachRelaySidebandListener(db, currentSessionId, {
    onText: appendRelayText,
    onUrl: appendRelayUrl,
    onFile: appendRelayFile,
  });

  if (transferMode === TRANSFER_MODE.P2P) {
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
        if (isP2PConnected()) return;
        relayMobileConnected = true;
        setConnectionState(CONNECTION_STATE.CONNECTED, { detail: '相手が参加しました（サーバー経由）' });
        updatePcSendPanel(true);
      },
      onLeave: () => {
        if (isP2PConnected()) return;
        relayMobileConnected = false;
        setConnectionState(CONNECTION_STATE.WAITING, { detail: 'スマホまたはPCからの接続を待っています' });
        updatePcSendPanel(false);
      },
    });
  } else {
    resetConnectionState();
    setConnectionState(CONNECTION_STATE.WAITING, { detail: 'スマホまたはPCからの接続を待っています' });
    detachPresence = watchMobilePresence(db, currentSessionId, {
      onJoin: () => {
        relayMobileConnected = true;
        setConnectionState(CONNECTION_STATE.CONNECTED, { detail: '双方向で送受信できます（サーバー経由）' });
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

/* ── 参加コード / QR ─────────────────────────── */

async function generateQRCode() {
  p2pHost?.stop();

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
  const shareData = {
    title: 'シェアっと',
    text: currentJoinCode ? `参加コード: ${currentJoinCode}` : 'ファイルを送ってください',
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

function renewSession() {
  timer.stop();
  codeExpiredWhileConnected = false;
  document.querySelector('.code-display')?.classList.remove('is-expired');
  return generateQRCode();
}

/** 「新しいコード」ボタン。やりとりの履歴は残し、区切りを入れる */
function generateNewSession() {
  timeline.note('新しい参加コードを発行しました');
  return renewSession();
}

/* ── 送信 ─────────────────────────────────── */

function backToConnected() {
  setTimeout(() => {
    if (!isSendReady()) return;
    setConnectionState(CONNECTION_STATE.CONNECTED, {
      detail: isRelayConnected() ? '双方向で送受信できます（サーバー経由）' : '双方向で送受信できます',
      progress: 0,
    });
  }, 1200);
}

/** 入力欄の内容を、URL ならリンク、それ以外はテキストとして相手へ送る */
async function sendComposerToPhone() {
  const value = textInput.value.trim();
  if (!value) return;
  if (!isSendReady()) {
    showToast('相手が接続されていません', 'error');
    return;
  }
  const asUrl = isHttpUrl(value);
  const viaP2P = isP2PConnected();
  const msg = timeline.message(value, 'out', viaP2P ? DIRECT_TAG : RELAY_TAG);
  composer.reset();
  try {
    if (viaP2P) {
      p2pHost.sendText(value);
    } else if (asUrl) {
      await putOutboxUrl(db, currentSessionId, value);
    } else {
      await putOutboxText(db, currentSessionId, value);
    }
  } catch (e) {
    timeline.progress(msg).fail(e.message || '送信できませんでした');
  }
}

let sendQueue = Promise.resolve();

/**
 * 選んだファイルはすぐにタイムラインへ並べ、1本のデータチャネルを共有するため順番に送る。
 */
function sendFilesToPhone(fileList) {
  const files = [...(fileList || [])];
  if (files.length === 0) return Promise.resolve();
  if (!isSendReady()) {
    showToast('相手が接続されていません', 'error');
    return Promise.resolve();
  }
  const tag = currentTag();
  const jobs = files.map((file) => {
    const msg = timeline.file({
      name: file.name,
      size: file.size,
      mimeType: file.type,
      data: URL.createObjectURL(file),
      timestamp: Date.now(),
    }, 'out', tag);
    return { file, bubble: timeline.progress(msg) };
  });
  const run = sendQueue.then(() => sendJobs(jobs));
  sendQueue = run.catch(() => {});
  return run;
}

async function sendJobs(jobs) {
  let sent = 0;
  for (let i = 0; i < jobs.length; i++) {
    const { file, bubble } = jobs[i];
    if (!isSendReady()) {
      bubble.fail('接続が切れたため送れませんでした');
      continue;
    }
    const label = jobs.length > 1 ? `${file.name}（${i + 1}/${jobs.length}）` : file.name;
    setConnectionState(CONNECTION_STATE.TRANSFERRING, { detail: `${label} を送信中`, progress: 0 });
    try {
      if (isP2PConnected()) {
        await p2pHost.sendFile(file, (p) => {
          bubble.set(p);
          setTransferProgress(p, `${label} を送信中`);
        });
      } else {
        bubble.set(0.5);
        await putOutboxFile(db, currentSessionId, file);
      }
      bubble.done();
      sent += 1;
    } catch (e) {
      bubble.fail(e.message || '送信できませんでした');
    }
  }
  if (!isSendReady()) return;
  if (sent > 0) {
    setConnectionState(CONNECTION_STATE.COMPLETE, { detail: '送信完了', progress: 1 });
  } else {
    setConnectionState(CONNECTION_STATE.CONNECTED, { detail: '送信できませんでした。もう一度お試しください', progress: 0 });
  }
  backToConnected();
}

async function sendFileToPhone() {
  const input = document.getElementById('pcFileSend');
  const files = input?.files;
  if (!files?.length) return;
  const picked = [...files];
  input.value = '';
  await sendFilesToPhone(picked);
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
      composer.set(text);
      textInput.focus();
    },
    onBlocked: blocked,
  });
}

/* ── 参加コードの期限 ─────────────────────────── */

function handleCodeExpired() {
  if (isP2PConnected()) {
    codeExpiredWhileConnected = true;
    const display = document.getElementById('timerDisplay');
    if (display) display.textContent = '接続を維持';
    const timerEl = document.getElementById('sessionTimer');
    if (timerEl) timerEl.className = 'session-timer kept';
    document.querySelector('.code-display')?.classList.add('is-expired');
    showToast('参加コードは期限切れです。接続中の相手とは引き続き送受信できます', 'info', 4000);
    return;
  }
  setTimeout(renewSession, 5000);
}

function maybeRenewExpiredSession(state) {
  if (!codeExpiredWhileConnected) return;
  if (state !== CONNECTION_STATE.WAITING && state !== CONNECTION_STATE.FAILED) return;
  if (isP2PConnected()) return;
  renewSession();
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
  if (detail) detail.textContent = visibleStatusDetail(snap.state, snap.detail);
  if (bar) {
    bar.style.width = `${Math.round((snap.progress || 0) * 100)}%`;
    bar.hidden = snap.state !== CONNECTION_STATE.TRANSFERRING && snap.progress <= 0;
  }
  if ([CONNECTION_STATE.CONNECTED, CONNECTION_STATE.COMPLETE, CONNECTION_STATE.WAITING, CONNECTION_STATE.FAILED]
    .includes(snap.state)) {
    updatePcSendPanel(isSendReady());
  }
}

document.getElementById('copyJoinCodeBtn')?.addEventListener('click', copyJoinCode);
document.getElementById('downloadZipBtn')?.addEventListener('click', downloadZip);
document.getElementById('pcSendBtn')?.addEventListener('click', sendComposerToPhone);
document.getElementById('pcFileSendBtn')?.addEventListener('click', () => document.getElementById('pcFileSend')?.click());
document.getElementById('pcFileSend')?.addEventListener('change', sendFileToPhone);
document.getElementById('showPairBtn')?.addEventListener('click', openPairSheet);
document.getElementById('lockShowPairBtn')?.addEventListener('click', openPairSheet);
document.getElementById('closePairBtn')?.addEventListener('click', closePairSheet);
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || !isPairSheetOpen()) return;
  if (document.getElementById('joinDialog')?.open) return;
  closePairSheet();
});
document.querySelectorAll('[data-transfer-mode]').forEach((btn) => {
  btn.addEventListener('click', () => setTransferMode(btn.dataset.transferMode));
});

subscribeConnectionState(updateConnectionUI);
subscribeReceivedStore(updateZipButton);

registerServiceWorker();

function initStaticHints() {
  const shareBtn = document.getElementById('shareLinkBtn');
  if (shareBtn && typeof navigator.share !== 'function') shareBtn.hidden = true;
  applyModifierLabels();
}

document.addEventListener('DOMContentLoaded', () => {
  initStaticHints();
  if (!currentSessionId) generateQRCode();
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
window.downloadZip = downloadZip;
window.sendTextToPhone = sendComposerToPhone;
window.viewFullImage = viewFullImage;
window.closeImageModal = closeImageModal;
window.downloadModalImage = downloadModalImage;
window.downloadFile = downloadFile;
window.copyToClipboard = copyToClipboard;
