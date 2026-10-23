/**
 * デスクトップ向けの送信ショートカット：
 * ウィンドウ全体へのドラッグ&ドロップ、⌘V / Ctrl+V の貼り付け送信。
 */

function isEditable(target) {
  if (!target || !(target instanceof Element)) return false;
  if (target.isContentEditable) return true;
  return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
}

function pad(n) {
  return String(n).padStart(2, '0');
}

/** クリップボード画像は名前が "image.png" 固定なので、日時入りの名前に付け替える */
function renamePasted(file, index) {
  if (file.name && file.name !== 'image.png' && file.name !== 'image.jpeg') return file;
  const d = new Date();
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  const ext = (file.type.split('/')[1] || 'png').replace('jpeg', 'jpg');
  const suffix = index > 0 ? `-${index + 1}` : '';
  return new File([file], `paste-${stamp}${suffix}.${ext}`, { type: file.type, lastModified: Date.now() });
}

/**
 * @param {{
 *   canSend: () => boolean,
 *   onFiles: (files: File[]) => void,
 *   onText?: (text: string) => void,
 *   onBlocked?: () => void,
 * }} opts
 */
export function initPasteToSend({ canSend, onFiles, onText, onBlocked }) {
  document.addEventListener('paste', (e) => {
    const data = e.clipboardData;
    if (!data) return;
    const files = [...(data.files || [])];
    const editable = isEditable(e.target);

    if (files.length > 0) {
      e.preventDefault();
      if (!canSend()) { onBlocked?.(); return; }
      onFiles(files.map(renamePasted));
      return;
    }
    if (editable || !onText) return;
    const text = data.getData('text/plain')?.trim();
    if (!text) return;
    e.preventDefault();
    if (!canSend()) { onBlocked?.(); return; }
    onText(text);
  });
}

/**
 * @param {{
 *   overlay: HTMLElement | null,
 *   canSend: () => boolean,
 *   onFiles: (files: File[]) => void,
 *   onBlocked?: () => void,
 * }} opts
 */
export function initDropToSend({ overlay, canSend, onFiles, onBlocked }) {
  let depth = 0;
  const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
  const hide = () => { depth = 0; overlay?.classList.remove('show'); };

  window.addEventListener('dragenter', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    depth += 1;
    if (canSend()) overlay?.classList.add('show');
  });
  window.addEventListener('dragover', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = canSend() ? 'copy' : 'none';
  });
  window.addEventListener('dragleave', () => {
    depth = Math.max(0, depth - 1);
    if (depth === 0) hide();
  });
  window.addEventListener('drop', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    hide();
    if (!canSend()) { onBlocked?.(); return; }
    onFiles([...e.dataTransfer.files]);
  });
}

/** 入力中でもモディファイア付きでもない数字キーを拾う（「数字を打つだけで参加」用） */
export function onBareDigit(handler) {
  document.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || e.isComposing) return;
    if (!/^[0-9]$/.test(e.key) || isEditable(e.target)) return;
    if (document.querySelector('dialog[open]')) return;
    e.preventDefault();
    handler(e.key);
  });
}
