import { dbRef, set, onValue, onDisconnect } from './firebase.js';
const participantId = crypto.randomUUID();

export async function announceMobileJoin(db, sessionId) {
  const ref = dbRef(db, `presence/${sessionId}/mobile/${participantId}`);
  await onDisconnect(ref).remove();
  await set(ref, { online: true, joinedAt: Date.now() });
}

export function watchMobilePresence(db, sessionId, { onJoin, onLeave } = {}) {
  return onValue(dbRef(db, `presence/${sessionId}/mobile`), (snap) => {
    const count = Object.values(snap.val() || {}).filter((value) => value?.online).length;
    const label = document.getElementById('participantCount');
    if (label) label.textContent = `${count}台が参加中`;
    if (count) onJoin?.({ count });
    else onLeave?.();
  });
}

export async function clearMobilePresence(db, sessionId) {
  await set(dbRef(db, `presence/${sessionId}/mobile/${participantId}`), null);
}
