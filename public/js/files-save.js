import { dbRef, set, update } from './firebase.js';

async function withRetry(fn, options = {}) {
  const {
    retries = 3,
    baseDelayMs = 150,
    factor = 2,
  } = options;

  let attempt = 0;
  let lastError;
  while (attempt <= retries) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      if (attempt === retries) break;
      const delay = baseDelayMs * Math.pow(factor, attempt);
      await new Promise((r) => setTimeout(r, delay));
      attempt += 1;
    }
  }
  throw lastError;
}

export async function encodeFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export async function putFile(db, sessionId, payload) {
  const fileId = Math.random().toString(36).substring(2, 10);
  const parentRef = dbRef(db, `files/${sessionId}`);
  const updates = {};
  updates[fileId] = payload;
  // Keep parent metadata updated to satisfy strict rules in production
  updates['timestamp'] = payload.timestamp;
  if (typeof payload.size === 'number') updates['size'] = payload.size;
  await withRetry(() => update(parentRef, updates));
  return fileId;
}

export async function putUrl(db, sessionId, urlString) {
  const urlId = Math.random().toString(36).substring(2, 10);
  const parentRef = dbRef(db, `files/${sessionId}`);
  const u = new URL(urlString);
  const payload = {
    type: 'url',
    url: urlString,
    title: u.hostname,
    name: u.hostname,
    description: 'リンク',
    hostname: u.hostname,
    size: 0,
    mimeType: 'text/url',
    timestamp: Date.now(),
  };
  const updates = {};
  updates[urlId] = payload;
  updates['timestamp'] = payload.timestamp;
  updates['size'] = payload.size;
  await withRetry(() => update(parentRef, updates));
  return urlId;
}
