/**
 * サーバー経由モードの接続プレゼンス（スマホ参加を PC が検知）
 */
import { dbRef, set, onValue, off, onDisconnect } from './firebase.js';

export async function announceMobileJoin(db, sessionId) {
  const ref = dbRef(db, `presence/${sessionId}/mobile`);
  const payload = { online: true, joinedAt: Date.now(), lastSeen: Date.now() };
  await set(ref, payload);
  onDisconnect(ref).update({ online: false, lastSeen: Date.now() });
}

export function watchMobilePresence(db, sessionId, { onJoin, onLeave } = {}) {
  const ref = dbRef(db, `presence/${sessionId}/mobile`);
  let wasOnline = false;

  const handler = (snap) => {
    const val = snap.val();
    const online = val?.online === true;
    if (online && !wasOnline) {
      wasOnline = true;
      onJoin?.(val);
    } else if (!online && wasOnline) {
      wasOnline = false;
      onLeave?.();
    }
  };

  onValue(ref, handler);
  return () => off(ref, 'value', handler);
}

export async function clearMobilePresence(db, sessionId) {
  const ref = dbRef(db, `presence/${sessionId}/mobile`);
  await set(ref, { online: false, lastSeen: Date.now() });
}
