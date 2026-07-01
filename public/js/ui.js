// UI utility helpers for Sharetto

import { showToast } from './toast.js';

let currentImageData = null;
let currentImageName = null;

export function viewFullImage(imageData, imageName) {
  currentImageData = imageData;
  currentImageName = imageName;
  const modal = document.getElementById('imageModal');
  const modalImage = document.getElementById('modalImage');
  const modalTitle = document.getElementById('modalTitle');
  if (!modal || !modalImage) return;
  modalImage.src = imageData;
  if (modalTitle) modalTitle.textContent = imageName || '画像プレビュー';
  modal.classList.add('show');
  document.addEventListener('keydown', handleEscKey);
  modal.addEventListener('click', handleModalClick);
}

export function closeImageModal() {
  const modal = document.getElementById('imageModal');
  if (!modal) return;
  modal.classList.remove('show');
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

export function downloadFile(_id, fileName, fileData) {
  try {
    const a = document.createElement('a');
    a.href = fileData;
    a.download = fileName || 'download';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast('ダウンロードを開始しました', 'success');
  } catch (e) {
    console.error('download error', e);
    showToast('ダウンロードに失敗しました', 'error');
  }
}

export async function copyToClipboard(text, successMessage = 'コピーしました') {
  try {
    await navigator.clipboard.writeText(text);
    showToast(`✅ ${successMessage}`, 'success');
  } catch (err) {
    console.error('copy error', err);
    showToast('コピーに失敗しました', 'error');
  }
}

function handleEscKey(e) { if (e.key === 'Escape') closeImageModal(); }
function handleModalClick(e) { if (e.target && e.target.id === 'imageModal') closeImageModal(); }
