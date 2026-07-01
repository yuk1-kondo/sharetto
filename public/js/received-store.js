/** 受信ファイルを ZIP 用に保持 */

const items = [];
const listeners = new Set();

function emit() {
  const snap = { count: items.length, items: [...items] };
  listeners.forEach((fn) => { try { fn(snap); } catch { /* noop */ } });
}

export function subscribeReceivedStore(fn) {
  listeners.add(fn);
  fn({ count: items.length, items: [...items] });
  return () => listeners.delete(fn);
}

export function addReceivedBlob({ name, blob, mimeType, source = 'p2p', peerId = '' }) {
  if (!blob || !name) return;
  items.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    blob,
    mimeType: mimeType || blob.type || 'application/octet-stream',
    source,
    peerId,
    at: Date.now(),
  });
  emit();
}

export async function addReceivedFromDataUrl({ name, dataUrl, mimeType, source = 'relay' }) {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  addReceivedBlob({ name, blob, mimeType: mimeType || blob.type, source });
}

export function getReceivedFiles() {
  return [...items];
}

export function clearReceivedStore() {
  items.length = 0;
  emit();
}

export function getReceivedCount() {
  return items.length;
}
