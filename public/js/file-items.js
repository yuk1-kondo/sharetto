import { formatFileSize } from './utils.js';

/**
 * ファイル一覧用のDOM要素を安全に生成する。
 */
export function createFileItem(file, { onDownload, onViewImage }) {
  const div = document.createElement('article');
  const isImage = String(file.mimeType || '').startsWith('image/');
  div.className = `file-item ${isImage ? 'photo-item' : 'document-item'}`;
  if (isImage) {
    const thumbnail = document.createElement('button');
    thumbnail.type = 'button';
    thumbnail.className = 'file-thumbnail';
    thumbnail.setAttribute('aria-label', `${file.name || '写真'}を拡大`);
    const img = document.createElement('img');
    img.src = file.data;
    img.alt = file.name || '受信した写真';
    img.loading = 'lazy';
    img.decoding = 'async';
    thumbnail.append(img);
    thumbnail.addEventListener('click', () => onViewImage?.(file.data, file.name));
    div.append(thumbnail);
  }
  const info = document.createElement('div');
  info.className = 'file-info';
  const details = document.createElement('div');
  details.className = 'file-details';
  const name = document.createElement('div');
  name.className = 'file-name';
  name.textContent = file.name || 'ファイル';
  const size = document.createElement('div');
  size.className = 'file-size';
  size.textContent = formatFileSize(file.size);
  details.append(name, size);
  const actions = document.createElement('div');
  actions.className = 'file-actions';
  const save = document.createElement('button');
  save.type = 'button';
  save.className = 'download-btn';
  save.textContent = '保存';
  save.setAttribute('aria-label', `${file.name || 'ファイル'}を保存`);
  save.addEventListener('click', () => onDownload?.(file.id, file.name, file.data));
  actions.append(save);
  info.append(details, actions);
  div.append(info);
  return div;
}

/** Text and links share the same display and preserve the exact copied content. */
export function createUrlItem(item, handlers) {
  return createTextItem({ ...item, text: String(item.url || '') }, handlers);
}

export function createTextItem(item, { onCopy }) {
  const text = String(item.text ?? item.title ?? '');
  const article = document.createElement('article');
  article.className = 'url-item message-item';
  const trimmed = text.trim();
  let isLink = false;
  try { const url = new URL(trimmed); isLink = /^https?:$/.test(url.protocol) && !/\s/.test(trimmed); } catch { /* plain text */ }
  const meta = document.createElement('div');
  meta.className = 'message-meta';
  const kind = document.createElement('span');
  kind.className = 'message-kind';
  kind.textContent = isLink ? 'LINK' : 'TEXT';
  const date = new Date(item.timestamp || Date.now());
  const time = document.createElement('time');
  time.dateTime = date.toISOString();
  time.textContent = date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
  time.title = date.toLocaleString('ja-JP');
  meta.append(kind, time);
  const body = document.createElement('div');
  body.className = 'message-body';
  // Build text nodes and HTTP(S) anchors rather than inserting shared HTML.
  const tokens = /https?:\/\/[^\s<>]+/g;
  let last = 0;
  for (const match of text.matchAll(tokens)) {
    body.append(document.createTextNode(text.slice(last, match.index)));
    const token = match[0];
    const urlText = token.replace(/[.,;!?。、）)]+$/, '');
    try {
      const url = new URL(urlText);
      const link = document.createElement('a');
      link.href = url.href;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = urlText;
      body.append(link, document.createTextNode(token.slice(urlText.length)));
    } catch { body.append(document.createTextNode(token)); }
    last = match.index + token.length;
  }
  body.append(document.createTextNode(text.slice(last)));
  const copy = document.createElement('button');
  copy.type = 'button';
  copy.className = 'text-button underlined message-copy';
  copy.textContent = 'コピー';
  copy.setAttribute('aria-label', isLink ? 'URLをコピー' : '文章をコピー');
  copy.addEventListener('click', () => onCopy?.(text));
  article.append(meta, body, copy);
  return article;
}
