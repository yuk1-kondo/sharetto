/**
 * PC側メインページ (index.html) のエントリポイント
 */
import {
  initFirebase,
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
  signOut,
} from '../firebase.js';
import {
  viewFullImage,
  closeImageModal,
  downloadModalImage,
  downloadFile,
  copyToClipboard,
} from '../ui.js';
import { attachFilesListener } from '../files-view.js';
import { issueJoinCode } from '../session.js';
import { createFileItem, createUrlItem } from '../file-items.js';
import { createSessionTimer } from '../session-timer.js';
import { renderQRCode } from '../qr-display.js';
import { generateSessionId, generatePin } from '../utils.js';
import { showToast } from '../toast.js';
import { PIN_CODE_LENGTH } from '../constants.js';
import { firebaseConfig } from '../../config.js';

const { db, auth } = initFirebase(firebaseConfig);

let currentSessionId = null;
let currentJoinCode = null;
let currentUser = null;
let detachFiles = null;

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
  onCopy: (text) => copyToClipboard(text, 'URLをコピーしました'),
};

async function signInWithGoogle() {
  const errorEl = document.getElementById('googleLoginError');
  try {
    const provider = new GoogleAuthProvider();
    provider.addScope('email');
    provider.addScope('profile');

    const result = await signInWithPopup(auth, provider);
    currentUser = result.user;

    errorEl.textContent = `✅ ログイン成功！ようこそ ${result.user.displayName || result.user.email} さん`;
    errorEl.style.color = '#4ade80';
    errorEl.style.display = 'block';

    setTimeout(() => {
      showMainContent();
      generateQRCode();
      errorEl.style.display = 'none';
      errorEl.style.color = '#ff6b6b';
    }, 1500);
  } catch (error) {
    console.error('Googleログインエラー:', error);

    const messages = {
      'auth/popup-blocked': 'ポップアップがブロックされました。ブラウザの設定を確認してください。',
      'auth/popup-closed-by-user': 'ログインがキャンセルされました。',
      'auth/unauthorized-domain': 'このドメインは認証が許可されていません。',
      'auth/operation-not-allowed': 'Googleログインが有効になっていません。',
      'auth/network-request-failed': 'ネットワークエラーが発生しました。インターネット接続を確認してください。',
      'auth/too-many-requests': 'リクエストが多すぎます。しばらく待ってから再試行してください。',
    };

    errorEl.textContent = messages[error.code] || `ログインエラー: ${error.message}`;
    errorEl.style.display = 'block';
    setTimeout(() => { errorEl.style.display = 'none'; }, 10000);
  }
}

async function signOutUser() {
  try {
    await signOut(auth);
    currentUser = null;
    sessionStorage.removeItem('inviteCodeValid');
    sessionStorage.removeItem('usedInviteCode');

    document.getElementById('authOverlay').style.display = 'flex';
    document.getElementById('mainContent').classList.remove('authenticated');
    document.getElementById('googleLoginError').style.display = 'none';
  } catch (error) {
    console.error('ログアウトエラー:', error);
  }
}

function showMainContent() {
  document.getElementById('authOverlay').style.display = 'none';
  document.getElementById('mainContent').classList.add('authenticated');
}

function checkAuthentication() {
  if (currentUser) {
    showMainContent();
    generateQRCode();
    return true;
  }
  document.getElementById('authOverlay').style.display = 'flex';
  document.getElementById('googleLoginScreen')?.classList.remove('hidden-screen');
  document.getElementById('mainContent').classList.remove('authenticated');
  return false;
}

async function generateQRCode() {
  currentSessionId = generateSessionId();
  const uploadUrl = `${window.location.origin}/upload.html?session=${currentSessionId}`;
  const pin = generatePin();

  try {
    renderQRCode(document.getElementById('qrcode'), uploadUrl);
    timer.start();
    displayFiles();
  } catch {
    return;
  }

  document.getElementById('qrUrl').textContent = uploadUrl;

  const ok = await issueJoinCode(db, currentSessionId, pin);
  currentJoinCode = ok ? String(pin).slice(0, PIN_CODE_LENGTH) : null;
  if (!ok) {
    showToast('参加コードの発行に失敗しました。ページを更新してください', 'error', 4000);
  }
  updateJoinCodeUI();
}

function updateJoinCodeUI() {
  const el = document.getElementById('joinCode');
  if (el) el.textContent = currentJoinCode || '------';
  const copyBtn = document.getElementById('copyJoinCodeBtn');
  if (copyBtn) copyBtn.disabled = !currentJoinCode;
}

function copyQRUrl() {
  const url = document.getElementById('qrUrl').textContent;
  copyToClipboard(url, 'URLをコピーしました');
}

function copyJoinCode() {
  if (!currentJoinCode) return;
  copyToClipboard(currentJoinCode, '参加コードをコピーしました');
}

function generateNewSession() {
  timer.stop();
  generateQRCode();
}

function displayFiles() {
  if (!currentSessionId) return;
  const filesList = document.getElementById('filesList');
  const urlsList = document.getElementById('urlsList');
  if (detachFiles) {
    try { detachFiles(); } catch { /* noop */ }
  }
  detachFiles = attachFilesListener(db, currentSessionId, {
    filesList,
    urlsList,
    createFileItem: (file) => createFileItem(file, itemHandlers),
    createUrlItem: (url) => createUrlItem(url, itemHandlers),
  });
}

function refreshFiles() {
  displayFiles();
  showToast('一覧を更新しました', 'info', 1500);
}

onAuthStateChanged(auth, (user) => {
  if (user) {
    currentUser = user;
    showMainContent();
    generateQRCode();
  } else {
    currentUser = null;
    checkAuthentication();
  }
});

document.getElementById('copyJoinCodeBtn')?.addEventListener('click', copyJoinCode);

document.addEventListener('DOMContentLoaded', () => {
  checkAuthentication();
});

// HTML onclick 互換
window.signInWithGoogle = signInWithGoogle;
window.signOutUser = signOutUser;
window.generateNewSession = generateNewSession;
window.copyQRUrl = copyQRUrl;
window.copyJoinCode = copyJoinCode;
window.refreshFiles = refreshFiles;
window.viewFullImage = viewFullImage;
window.closeImageModal = closeImageModal;
window.downloadModalImage = downloadModalImage;
window.downloadFile = downloadFile;
window.copyToClipboard = copyToClipboard;
