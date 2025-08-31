import { onSchedule } from 'firebase-functions/v2/scheduler';
import { initializeApp } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';

// Initialize Admin SDK
initializeApp();

const TTL_MS = 10 * 60 * 1000; // 10 minutes

async function cleanupPath(db, rootPath) {
  const now = Date.now();
  const cutoff = now - TTL_MS;
  const rootRef = db.ref(rootPath);
  const snap = await rootRef.get();
  if (!snap.exists()) return 0;

  let removed = 0;

  const sessions = snap.val();
  const updates = {};

  for (const [sessionId, children] of Object.entries(sessions)) {
    if (!children || typeof children !== 'object') continue;
    let hasRemaining = false;
    for (const [childId, value] of Object.entries(children)) {
      const ts = value?.timestamp;
      if (typeof ts === 'number' && ts < cutoff) {
        updates[`${sessionId}/${childId}`] = null; // delete
        removed++;
      } else {
        hasRemaining = true;
      }
    }
    // If everything under the session expired, remove the session node as well
    if (!hasRemaining) {
      updates[sessionId] = null;
    }
  }

  if (Object.keys(updates).length > 0) {
    await rootRef.update(updates);
  }

  return removed;
}

export const cleanupOldEntries = onSchedule('every 1 minutes', async (event) => {
  const db = getDatabase();
  const removedFiles = await cleanupPath(db, 'files');
  const removedPcShare = await cleanupPath(db, 'pc-share');
  return {
    removedFiles,
    removedPcShare,
    at: new Date().toISOString(),
  };
});
