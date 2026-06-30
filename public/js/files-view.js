import { dbRef, onValue, off } from './firebase.js';

const EMPTY_FILE_MSG = '<div class="no-files">まだファイルがアップロードされていません</div>';
const EMPTY_URL_MSG = '<div class="no-files">まだURLが共有されていません</div>';

/**
 * Attach realtime listener to files/{sessionId} and render into containers.
 * @returns {() => void} unsubscribe
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
      filesList.innerHTML = EMPTY_FILE_MSG;
      urlsList.innerHTML = EMPTY_URL_MSG;
      return;
    }

    const files = [];
    const urls = [];
    Object.entries(data).forEach(([id, value]) => {
      if (value && value.type === 'file') files.push({ id, ...value });
      else if (value && value.type === 'url') urls.push({ id, ...value });
    });

    if (files.length === 0) {
      filesList.innerHTML = EMPTY_FILE_MSG;
    } else {
      files.sort((a, b) => b.timestamp - a.timestamp).forEach((f) => {
        const el = createFileItem(f);
        if (el) filesList.appendChild(el);
      });
    }

    if (urls.length === 0) {
      urlsList.innerHTML = EMPTY_URL_MSG;
    } else {
      urls.sort((a, b) => b.timestamp - a.timestamp).forEach((u) => {
        const el = createUrlItem(u);
        if (el) urlsList.appendChild(el);
      });
    }
  };

  onValue(filesRef, handler);
  return () => off(filesRef);
}
