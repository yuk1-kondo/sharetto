import { dbRef, update } from './firebase.js';

async function withRetry(fn, options = {}) {
  const { retries = 3, baseDelayMs = 150, factor = 2 } = options;
  let attempt = 0;
  let lastError;
  while (attempt <= retries) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      if (attempt === retries) break;
      await new Promise((r) => setTimeout(r, baseDelayMs * Math.pow(factor, attempt)));
      attempt += 1;
    }
  }
  throw lastError;
}

function randomId() {
  return Math.random().toString(36).substring(2, 10);
}

export async function encodeFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function putEntry(db, sessionId, payload) {
  const entryId = randomId();
  const parentRef = dbRef(db, `files/${sessionId}`);
  const updates = { [entryId]: payload, timestamp: payload.timestamp, size: payload.size ?? 0 };
  await withRetry(() => update(parentRef, updates));
  return entryId;
}

export async function putFile(db, sessionId, payload) {
  return putEntry(db, sessionId, payload);
}

export async function putUrl(db, sessionId, urlString) {
  const u = new URL(urlString);
  return putEntry(db, sessionId, {
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

export async function putText(db, sessionId, text) {
  const preview = String(text).slice(0, 120);
  return putEntry(db, sessionId, {
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
