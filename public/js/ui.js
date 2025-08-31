// UI utility helpers for Sharetto

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
  } catch (e) {
    console.error('download error', e);
    alert('ダウンロードに失敗しました');
  }
}

export function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    alert('✅ コピーしました！');
  }).catch((err) => {
    console.error('copy error', err);
    alert('コピーに失敗しました');
  });
}

function handleEscKey(e) { if (e.key === 'Escape') closeImageModal(); }
function handleModalClick(e) { if (e.target && e.target.id === 'imageModal') closeImageModal(); }

