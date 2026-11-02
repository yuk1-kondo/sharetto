import { onSchedule } from 'firebase-functions/v2/scheduler';
import { initializeApp } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';

initializeApp();
const LEGACY_TTL_MS = 2 * 60 * 60 * 1000;

export const cleanupOldEntries = onSchedule('every 1 minutes', async () => {
  const db = getDatabase();
  const now = Date.now();
  const sessions = (await db.ref('sessions').get()).val() || {};
  let removedSessions = 0;
  for (const [id, session] of Object.entries(sessions)) {
    if (session.status === 'active' && session.expiresAt > now) continue;
    // Recheck within a transaction so an extension racing the scheduled job is preserved.
    const result = await db.ref(`sessions/${id}`).transaction((current) => {
      if (!current || (current.status === 'active' && current.expiresAt > Date.now())) return;
      return { ...current, status: 'ended' };
    });
    if (!result.committed) continue;
    await db.ref().update({
      [`files/${id}`]: null,
      [`outbox/${id}`]: null,
      [`signal/${id}`]: null,
      [`presence/${id}`]: null,
    });
    removedSessions++;
  }
  // Remove expired PINs without deleting a newly assigned mapping.
  const codes = (await db.ref('codes').get()).val() || {};
  for (const [code, entry] of Object.entries(codes)) {
    const session = (await db.ref(`sessions/${entry.sessionId}`).get()).val();
    if (session?.status === 'active' && session.expiresAt > Date.now()) continue;
    await db.ref(`codes/${code}`).transaction((current) => {
      if (!current || current.sessionId !== entry.sessionId || current.timestamp !== entry.timestamp) return;
      return null;
    });
  }
  // Legacy data has no lifecycle record. Keep it for two hours before removing it.
  for (const path of ['files', 'outbox', 'pc-share']) {
    const entries = (await db.ref(path).get()).val() || {};
    for (const [id, children] of Object.entries(entries)) {
      if (sessions[id]) continue;
      for (const [key, value] of Object.entries(children || {})) {
        if (typeof value?.timestamp !== 'number' || now - value.timestamp < LEGACY_TTL_MS) continue;
        await db.ref(`${path}/${id}/${key}`).transaction((current) => {
          if (current?.timestamp === value.timestamp) return null;
        });
      }
    }
  }
  return { removedSessions, at: new Date().toISOString() };
});
