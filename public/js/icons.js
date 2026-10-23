/** 線画アイコン（currentColor / 24px グリッド） */

const PATHS = {
  download: '<path d="M12 4v11"/><path d="m7 10 5 5 5-5"/><path d="M5 20h14"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M5 15V6.5A2.5 2.5 0 0 1 7.5 4H15"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1"/><path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1"/>',
  external: '<path d="M14 5h5v5"/><path d="M19 5 11 13"/><path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"/>',
  text: '<path d="M5 6h14"/><path d="M5 12h14"/><path d="M5 18h9"/>',
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
  plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  close: '<path d="M6 6l12 12"/><path d="M18 6 6 18"/>',
  send: '<path d="M5 12h13"/><path d="m13 6 6 6-6 6"/>',
  zoom: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.4-4.4"/>',
};

export function icon(name, cls = 'icon') {
  const body = PATHS[name] || PATHS.file;
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

/** ファイル名から拡張子ラベル（最大4文字）を作る */
export function extLabel(name = '', mimeType = '') {
  const dot = name.lastIndexOf('.');
  if (dot > 0 && dot < name.length - 1) {
    return name.slice(dot + 1, dot + 5).toUpperCase();
  }
  const sub = (mimeType.split('/')[1] || 'FILE').replace(/[^a-z0-9]/gi, '');
  return sub.slice(0, 4).toUpperCase() || 'FILE';
}
