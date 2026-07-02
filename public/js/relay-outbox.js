/**
 * PC → スマホ（サーバー経由 outbox）
 */
import { dbRef, update, onValue, off } from './firebase.js';
import { encodeFileAsDataURL } from './files-save.js';

function randomId() {
  return Math.random().toString(36).substring(2, 10);
}

async function putOutboxEntry(db, sessionId, payload) {
  const entryId = randomId();
  const parentRef = dbRef(db, `outbox/${sessionId}`);
  await update(parentRef, {
    [entryId]: payload,
    timestamp: payload.timestamp,
    size: payload.size ?? 0,
  });
  return entryId;
}

export async function putOutboxFile(db, sessionId, file) {
  const dataUrl = await encodeFileAsDataURL(file);
  return putOutboxEntry(db, sessionId, {
    type: 'file',
    name: file.name,
    size: file.size,
    mimeType: file.type || 'application/octet-stream',
    data: dataUrl,
    timestamp: Date.now(),
  });
}

export async function putOutboxUrl(db, sessionId, urlString) {
  const u = new URL(urlString);
  return putOutboxEntry(db, sessionId, {
    type: 'url',
    url: urlString,
    title: u.hostname,
    name: u.hostname,
    description: 'リンク',
    hostname: u.hostname,
    size: 0,
    mimeType: 'text/url',
    timestamp: Date.now(),
  });
}

export async function putOutboxText(db, sessionId, text) {
  const preview = String(text).slice(0, 120);
  return putOutboxEntry(db, sessionId, {
    type: 'text',
    text,
    name: 'テキスト',
    title: preview,
    description: 'テキスト',
    size: new TextEncoder().encode(text).length,
    mimeType: 'text/plain',
    timestamp: Date.now(),
  });
}

/**
 * スマホ側: outbox を監視して PC からの着信を処理
 */
export function attachOutboxListener(db, sessionId, { onFile, onUrl, onText }) {
  const ref = dbRef(db, `outbox/${sessionId}`);
  const seen = new Set();

  const handler = (snapshot) => {
    const data = snapshot.val();
    if (!data) return;
    Object.entries(data).forEach(([id, value]) => {
      if (!value || typeof value !== 'object' || seen.has(id)) return;
      if (id === 'timestamp' || id === 'size') return;
      if (!value.type) return;
      seen.add(id);
      if (value.type === 'file') onFile?.({ id, ...value });
      else if (value.type === 'url') onUrl?.({ id, ...value });
      else if (value.type === 'text') onText?.({ id, ...value });
    });
  };

  onValue(ref, handler);
  return () => off(ref);
}
