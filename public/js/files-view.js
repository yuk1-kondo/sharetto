import { dbRef, onValue, off } from './firebase.js';

/**
 * files/{sessionId} に届いたファイル・URL・テキストを、初回分も含めて1件ずつ通知する。
 * 一覧を描き直さないので、P2P 受信と同じタイムラインに共存できる。
 */
export function attachRelaySidebandListener(db, sessionId, { onText, onUrl, onFile }) {
  const filesRef = dbRef(db, `files/${sessionId}`);
  const seen = new Set();

  const handler = (snapshot) => {
    const data = snapshot.val();
    if (!data) return;
    Object.entries(data).forEach(([id, value]) => {
      if (!value || typeof value !== 'object' || seen.has(id)) return;
      if (id === 'timestamp' || id === 'size') return;
      seen.add(id);
      if (value.type === 'text') onText?.({ id, ...value });
      else if (value.type === 'url') onUrl?.({ id, ...value });
      else if (value.type === 'file') onFile?.({ id, ...value });
    });
  };

  onValue(filesRef, handler);
  return () => off(filesRef);
}
