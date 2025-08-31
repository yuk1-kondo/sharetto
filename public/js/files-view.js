import { dbRef, onValue, off } from './firebase.js';

/**
 * Attach realtime listener to files/{sessionId} and render into containers.
 * Returns an unsubscribe function.
 *
 * @param {import('./firebase.js').Database} db
 * @param {string} sessionId
 * @param {{ filesList: HTMLElement, urlsList: HTMLElement, createFileItem: Function, createUrlItem: Function }} opts
 */
export function attachFilesListener(db, sessionId, opts) {
  const { filesList, urlsList, createFileItem, createUrlItem } = opts;
  const filesRef = dbRef(db, `files/${sessionId}`);

  const handler = (snapshot) => {
    const data = snapshot.val();
    if (!filesList || !urlsList) return;

    filesList.innerHTML = '';
    urlsList.innerHTML = '';

    if (!data) {
      filesList.innerHTML = '<div class="no-files">まだファイルがアップロードされていません</div>';
      urlsList.innerHTML = '<div class="no-files">まだURLが共有されていません</div>';
      return;
    }

    const files = [];
    const urls = [];
    Object.entries(data).forEach(([id, value]) => {
      if (value && value.type === 'file') files.push({ id, ...value });
      else if (value && value.type === 'url') urls.push({ id, ...value });
    });

    if (files.length === 0) {
      filesList.innerHTML = '<div class="no-files">まだファイルがアップロードされていません</div>';
    } else {
      files.sort((a, b) => b.timestamp - a.timestamp).forEach((f) => {
        const el = createFileItem(f);
        if (el) filesList.appendChild(el);
      });
    }

    if (urls.length === 0) {
      urlsList.innerHTML = '<div class="no-files">まだURLが共有されていません</div>';
    } else {
      urls.sort((a, b) => b.timestamp - a.timestamp).forEach((u) => {
        const el = createUrlItem(u);
        if (el) urlsList.appendChild(el);
      });
    }
  };

  onValue(filesRef, handler);
  // return unsubscribe
  return () => off(filesRef);
}

