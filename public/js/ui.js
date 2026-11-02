// UI utility helpers for Sharetto

import { showToast } from './toast.js';

let currentImageData = null;
let currentImageName = null;
let imageTrigger = null;

export function viewFullImage(imageData, imageName) {
  currentImageData = imageData;
  currentImageName = imageName;
  const modal = document.getElementById('imageModal');
  const modalImage = document.getElementById('modalImage');
  const modalTitle = document.getElementById('modalTitle');
  if (!modal || !modalImage) return;
  imageTrigger = document.activeElement;
  modalImage.src = imageData;
  modalImage.alt = imageName || '写真';
  if (modalTitle) {
    modalTitle.toggleAttribute('data-no-translate', Boolean(imageName));
    modalTitle.textContent = imageName || '画像プレビュー';
  }
  if (!modal.open) modal.showModal();
  document.addEventListener('keydown', handleEscKey);
  modal.addEventListener('click', handleModalClick);
}

export function closeImageModal() {
  const modal = document.getElementById('imageModal');
  if (!modal) return;
  modal.close();
  modal.querySelector('img')?.removeAttribute('src');
  imageTrigger?.focus();
  imageTrigger = null;
  currentImageData = null;
  currentImageName = null;
  document.removeEventListener('keydown', handleEscKey);
  modal.removeEventListener('click', handleModalClick);
}

export function downloadModalImage() {
  if (currentImageData && currentImageName) {
    downloadFile(null, currentImageName, currentImageData);
  }
}

export async function downloadFile(_id, fileName, fileData) {
  try {
    // A blob URL also works for large relay photos without oversized data URLs.
    let downloadUrl = fileData;
    let temporaryUrl = null;
    if (String(fileData).startsWith('data:')) {
      const response = await fetch(fileData);
      temporaryUrl = URL.createObjectURL(await response.blob());
      downloadUrl = temporaryUrl;
    }
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = fileName || 'download';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    if (temporaryUrl) setTimeout(() => URL.revokeObjectURL(temporaryUrl), 30000);
    showToast('ダウンロードを開始しました', 'success');
  } catch (e) {
    console.error('download error', e);
    showToast('ダウンロードに失敗しました', 'error');
  }
}

export async function copyToClipboard(text, successMessage = 'コピーしました') {
  try {
    await navigator.clipboard.writeText(text);
    showToast(successMessage, 'success');
  } catch (err) {
    console.error('copy error', err);
    showToast('コピーに失敗しました', 'error');
  }
}

function handleEscKey(e) { if (e.key === 'Escape') closeImageModal(); }
function handleModalClick(e) { if (e.target && e.target.id === 'imageModal') closeImageModal(); }
