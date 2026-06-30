import { dbRef, onValue, off } from './firebase.js';

const EMPTY_FILE_MSG = '<div class="no-files">まだファイルがアップロードされていません</div>';
const EMPTY_URL_MSG = '<div class="no-files">まだURLが共有されていません</div>';

/**
 * Attach realtime listener to files/{sessionId} and render into containers.
 * @returns {() => void} unsubscribe
 */
export function attachFilesListener(db, sessionId, opts) {
  const { filesList, urlsList, createFileItem, createUrlItem, onNewFile, onNewText } = opts;
  const filesRef = dbRef(db, `files/${sessionId}`);
  const seen = new Set();

  const handler = (snapshot) => {
    const data = snapshot.val();
    if (!filesList || !urlsList) return;

    filesList.innerHTML = '';
    urlsList.innerHTML = '';

    if (!data) {
      filesList.innerHTML = EMPTY_FILE_MSG;
      urlsList.innerHTML = EMPTY_URL_MSG;
      return;
    }

    const files = [];
    const urls = [];
    const texts = [];
    Object.entries(data).forEach(([id, value]) => {
      if (!value || typeof value !== 'object') return;
      if (value.type === 'file') files.push({ id, ...value });
      else if (value.type === 'url') urls.push({ id, ...value });
      else if (value.type === 'text') texts.push({ id, ...value });
    });

    if (files.length === 0) {
      filesList.innerHTML = EMPTY_FILE_MSG;
    } else {
      files.sort((a, b) => b.timestamp - a.timestamp).forEach((f) => {
        if (!seen.has(f.id)) {
          seen.add(f.id);
          onNewFile?.(f);
        }
        const el = createFileItem(f);
        if (el) filesList.appendChild(el);
      });
    }

    const urlItems = [...urls, ...texts];
    if (urlItems.length === 0) {
      urlsList.innerHTML = EMPTY_URL_MSG;
    } else {
      urlItems.sort((a, b) => b.timestamp - a.timestamp).forEach((u) => {
        if (!seen.has(u.id)) {
          seen.add(u.id);
          if (u.type === 'text') onNewText?.(u);
          else onNewFile?.(u);
        }
        const el = u.type === 'text' ? createTextItem?.(u) : createUrlItem(u);
        if (el) urlsList.appendChild(el);
      });
    }
  };

  onValue(filesRef, handler);
  return () => off(filesRef);
}
