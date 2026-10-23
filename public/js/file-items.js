import { formatFileSize } from './utils.js';
import { icon, extLabel } from './icons.js';

/**
 * 受信アイテム（ファイル / URL / テキスト）の行要素を生成する。
 * ユーザー由来の文字列は必ず textContent で挿入する。
 */

function formatTime(timestamp) {
  const d = new Date(timestamp || Date.now());
  return d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function iconButton(name, label, onClick) {
  const btn = el('button', 'icon-btn');
  btn.type = 'button';
  btn.title = label;
  btn.setAttribute('aria-label', label);
  btn.innerHTML = icon(name);
  btn.addEventListener('click', onClick);
  return btn;
}

function buildMeta({ time, quiet } = {}, tag) {
  const meta = el('div', 'item__meta');
  if (time) meta.appendChild(el('span', 'item__time', time));
  if (quiet) meta.appendChild(el('span', 'item__quiet', quiet));
  if (tag && tag !== '直接') meta.appendChild(el('span', 'tag', tag));
  return meta;
}

/** 容量は普段隠す。タッチ端末では行をタップすると出す */
function attachQuietToggle(row) {
  if (!row.querySelector('.item__quiet')) return;
  row.addEventListener('click', (event) => {
    if (event.target.closest('a, button')) return;
    if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    row.classList.toggle('is-open');
  });
}

function buildRow(kind, lead, body, actions) {
  const row = el('article', 'item');
  row.dataset.kind = kind;
  const actionsWrap = el('div', 'item__actions');
  actions.forEach((a) => actionsWrap.appendChild(a));
  row.append(lead, body, actionsWrap);
  attachQuietToggle(row);
  return row;
}

export function isHttpUrl(text) {
  const value = String(text || '').trim();
  if (!/^https?:\/\/\S+$/i.test(value)) return false;
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {{ id?: string, name: string, size?: number, mimeType?: string, data: string, timestamp?: number }} file
 *   data はダウンロード/プレビューに使う URL（data: / blob:）
 * @param {{ onDownload?: Function, onViewImage?: Function }} handlers
 * @param {{ tag?: string }} [opts]
 */
export function createFileItem(file, { onDownload, onViewImage } = {}, { tag } = {}) {
  const name = String(file.name || 'file');
  const sizeLabel = file.size != null ? formatFileSize(file.size) : '';
  const isImage = Boolean(file.mimeType && file.mimeType.startsWith('image/') && file.data);
  const canPreview = isImage && typeof onViewImage === 'function';

  const lead = el(canPreview ? 'button' : 'div', 'item__lead');
  if (canPreview) {
    lead.type = 'button';
    lead.setAttribute('aria-label', sizeLabel ? `${name}、${sizeLabel} をプレビュー` : `${name} をプレビュー`);
    lead.addEventListener('click', () => onViewImage(file.data, name));
  }
  if (isImage) {
    const img = el('img');
    img.src = file.data;
    img.alt = '';
    img.loading = 'lazy';
    lead.appendChild(img);
  } else {
    lead.appendChild(el('span', 'item__ext', extLabel(name, file.mimeType || '')));
  }

  const body = el('div', 'item__body');
  body.append(
    el('div', 'item__title', name),
    buildMeta({ time: formatTime(file.timestamp), quiet: sizeLabel }, tag),
  );
  body.firstChild.title = sizeLabel ? `${name} · ${sizeLabel}` : name;

  const actions = [
    iconButton('download', sizeLabel ? `保存、${sizeLabel}` : '保存', () => onDownload?.(file.id, name, file.data)),
  ];
  return buildRow(isImage ? 'image' : 'file', lead, body, actions);
}

/**
 * @param {{ url: string, title?: string, hostname?: string, timestamp?: number }} item
 */
export function createUrlItem(item, { onCopy } = {}, { tag } = {}) {
  const url = String(item.url || '');
  const isHttp = isHttpUrl(url);
  let host = item.hostname || '';
  if (!host && isHttp) {
    try { host = new URL(url).hostname; } catch { /* noop */ }
  }
  const title = item.title || host || 'リンク';

  const lead = el('div', 'item__lead');
  lead.innerHTML = icon('link');

  const body = el('div', 'item__body');
  const link = el(isHttp ? 'a' : 'span', 'item__content', url);
  if (isHttp) {
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
  }
  body.append(el('div', 'item__title', title), link, buildMeta({ time: formatTime(item.timestamp) }, tag));

  const actions = [];
  if (isHttp) {
    const open = el('a', 'icon-btn');
    open.href = url;
    open.target = '_blank';
    open.rel = 'noopener noreferrer';
    open.title = '開く';
    open.setAttribute('aria-label', '開く');
    open.innerHTML = icon('external');
    actions.push(open);
  }
  actions.push(iconButton('copy', 'コピー', () => onCopy?.(url)));
  return buildRow('url', lead, body, actions);
}

/**
 * @param {{ text?: string, title?: string, timestamp?: number }} item
 */
export function createTextItem(item, { onCopy } = {}, { tag } = {}) {
  const text = String(item.text || item.title || '');

  const lead = el('div', 'item__lead');
  lead.innerHTML = icon('text');

  const body = el('div', 'item__body');
  body.append(
    el('div', 'item__title', 'テキスト'),
    el('div', 'item__content', text),
    buildMeta({ time: formatTime(item.timestamp) }, tag),
  );

  const actions = [iconButton('copy', 'コピー', () => onCopy?.(text))];
  return buildRow('text', lead, body, actions);
}

/** 直接受信した文字列を、URL ならリンク、それ以外はテキストとして描画する */
export function createMessageItem(text, handlers, opts = {}) {
  const value = String(text || '').trim();
  const timestamp = opts.timestamp ?? Date.now();
  if (isHttpUrl(value)) {
    return createUrlItem({ url: value, timestamp }, handlers, opts);
  }
  return createTextItem({ text: value, timestamp }, handlers, opts);
}
