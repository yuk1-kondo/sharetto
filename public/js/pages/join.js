/**
 * 参加コードページ (join.html) のエントリポイント
 */
import { initFirebase } from '../firebase.js';
import { resolveJoinCode } from '../session.js';
import { parseJoinInput } from '../utils.js';
import { showToast } from '../toast.js';
import { SESSION_TTL_MS } from '../constants.js';
import { firebaseConfig } from '../../config.js';

const { db } = initFirebase(firebaseConfig);

const input = document.getElementById('code');
const btn = document.getElementById('joinBtn');
const statusEl = document.getElementById('status');
let isJoining = false;

function updateButtonState() {
  btn.disabled = !parseJoinInput(input.value) || isJoining;
  if (!isJoining) statusEl.textContent = '';
}

function redirectToSession(sessionId) {
  const q = new URLSearchParams({
    session: sessionId,
    mode: 'p2p',
  });
  location.href = `upload.html?${q.toString()}`;
}

async function join() {
  if (isJoining) return;
  const parsed = parseJoinInput(input.value);
  if (!parsed) return;

  isJoining = true;
  btn.disabled = true;

  if (parsed.type === 'session') {
    statusEl.textContent = 'セッションに接続中...';
    redirectToSession(parsed.sessionId);
    return;
  }

  const code = parsed.code;
  statusEl.textContent = '照会中...';

  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      const sessionId = await resolveJoinCode(db, code, SESSION_TTL_MS);
      if (sessionId) {
        showToast('セッションに参加します', 'success', 1200);
        redirectToSession(sessionId);
        return;
      }
    } catch (e) {
      console.warn('codes読み取りエラー', e);
      statusEl.textContent = '権限エラーが発生しました。しばらくしてからお試しください。';
      showToast('接続エラーが発生しました', 'error');
      isJoining = false;
      updateButtonState();
      return;
    }
    await new Promise((r) => setTimeout(r, 700));
  }

  statusEl.textContent = 'コードが見つからないか、有効期限が切れました。PC側で新しいコードを発行してください。';
  showToast('参加コードが無効です', 'error');
  isJoining = false;
  updateButtonState();
}

let autoJoinTimer = null;
input.addEventListener('input', () => {
  updateButtonState();
  clearTimeout(autoJoinTimer);
  const parsed = parseJoinInput(input.value);
  if (parsed?.type === 'code' && /^\d{6}$/.test(parsed.code)) {
    autoJoinTimer = setTimeout(() => join(), 300);
  }
});
input.addEventListener('paste', () => {
  setTimeout(() => {
    updateButtonState();
    const parsed = parseJoinInput(input.value);
    if (parsed?.type === 'session') join();
  });
});
input.addEventListener('keypress', (e) => {
  if (e.key === 'Enter' && !btn.disabled) join();
});
btn.addEventListener('click', join);

const urlCode = new URLSearchParams(location.search).get('code');
if (urlCode) {
  input.value = urlCode;
  updateButtonState();
}
input.focus();
