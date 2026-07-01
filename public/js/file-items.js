import { formatFileSize, escapeHTML, getFileIcon } from './utils.js';

/**
 * ファイル一覧用のDOM要素を安全に生成する。
 */
export function createFileItem(file, { onDownload, onViewImage }) {
  const div = document.createElement('div');
  div.className = 'file-item';

  const isImage = file.mimeType && file.mimeType.startsWith('image/');
  const fileIcon = getFileIcon(file.mimeType, isImage);
  const safeName = escapeHTML(file.name || '');
  const fileDate = new Date(file.timestamp).toLocaleString('ja-JP');

  if (isImage) {
    const thumbnailDiv = document.createElement('div');
    thumbnailDiv.className = 'file-thumbnail';
    const img = document.createElement('img');
    img.src = file.data;
    img.alt = file.name || '';
    img.addEventListener('click', () => onViewImage?.(file.data, file.name));
    thumbnailDiv.appendChild(img);
    div.appendChild(thumbnailDiv);
  }

  const fileInfo = document.createElement('div');
  fileInfo.className = 'file-info';

  const fileDetails = document.createElement('div');
  fileDetails.className = 'file-details';
  fileDetails.innerHTML = `
    <div class="file-name">${fileIcon} ${safeName}</div>
    <div class="file-size">サイズ: ${formatFileSize(file.size)}</div>
    <div class="file-date">アップロード: ${fileDate}</div>
  `;

  const fileActions = document.createElement('div');
  fileActions.className = 'file-actions';

  const downloadBtn = document.createElement('button');
  downloadBtn.className = 'download-btn';
  downloadBtn.textContent = '⬇️ ダウンロード';
  downloadBtn.addEventListener('click', () => onDownload?.(file.id, file.name, file.data));
  fileActions.appendChild(downloadBtn);

  if (isImage) {
    const viewBtn = document.createElement('button');
    viewBtn.className = 'download-btn view-btn';
    viewBtn.textContent = '👁️ プレビュー';
    viewBtn.addEventListener('click', () => onViewImage?.(file.data, file.name));
    fileActions.appendChild(viewBtn);
  }

  fileInfo.appendChild(fileDetails);
  fileInfo.appendChild(fileActions);
  div.appendChild(fileInfo);

  return div;
}

/**
 * URL一覧用のDOM要素を安全に生成する。
 */
export function createUrlItem(url, { onCopy }) {
  const div = document.createElement('div');
  div.className = 'url-item';

  const urlDate = new Date(url.timestamp).toLocaleString('ja-JP');
  const safeUrl = String(url.url || '');
  const isHttp = /^https?:\/\//i.test(safeUrl);
  const title = url.title || url.hostname || 'リンク';

  const fileInfo = document.createElement('div');
  fileInfo.className = 'file-info';

  const fileDetails = document.createElement('div');
  fileDetails.className = 'file-details';

  const fileName = document.createElement('div');
  fileName.className = 'file-name';
  fileName.textContent = `🔗 ${title}`;

  const fileMeta = document.createElement('div');
  fileMeta.className = 'file-meta';
  fileMeta.innerHTML = `<span>共有: ${urlDate}</span>`;

  const urlLink = document.createElement(isHttp ? 'a' : 'span');
  urlLink.className = 'url-link';
  urlLink.textContent = safeUrl;
  if (isHttp) {
    urlLink.href = safeUrl;
    urlLink.target = '_blank';
    urlLink.rel = 'noopener noreferrer';
  }

  fileDetails.appendChild(fileName);
  fileDetails.appendChild(fileMeta);
  fileDetails.appendChild(urlLink);

  const fileActions = document.createElement('div');
  fileActions.className = 'file-actions';

  const copyBtn = document.createElement('button');
  copyBtn.className = 'download-btn';
  copyBtn.textContent = '📋 コピー';
  copyBtn.addEventListener('click', () => onCopy?.(safeUrl));
  fileActions.appendChild(copyBtn);

  fileInfo.appendChild(fileDetails);
  fileInfo.appendChild(fileActions);
  div.appendChild(fileInfo);

  return div;
}

/** テキストメッセージ一覧用 */
export function createTextItem(item, { onCopy }) {
  const div = document.createElement('div');
  div.className = 'url-item';
  const date = new Date(item.timestamp).toLocaleString('ja-JP');
  const text = String(item.text || item.title || '');

  const fileInfo = document.createElement('div');
  fileInfo.className = 'file-info';
  const fileDetails = document.createElement('div');
  fileDetails.className = 'file-details';

  const titleEl = document.createElement('div');
  titleEl.className = 'file-name';
  titleEl.textContent = '💬 テキスト';

  const fileMeta = document.createElement('div');
  fileMeta.className = 'file-meta';
  fileMeta.innerHTML = `<span>共有: ${date}</span>`;

  const body = document.createElement('span');
  body.className = 'url-link';
  body.textContent = text;

  fileDetails.append(titleEl, fileMeta, body);

  const copyBtn = document.createElement('button');
  copyBtn.className = 'download-btn';
  copyBtn.textContent = '📋 コピー';
  copyBtn.addEventListener('click', () => onCopy?.(text));

  const fileActions = document.createElement('div');
  fileActions.className = 'file-actions';
  fileActions.appendChild(copyBtn);

  fileInfo.append(fileDetails, fileActions);
  div.appendChild(fileInfo);
  return div;
}
