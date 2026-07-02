/**
 * HEIC/HEIF → JPEG conversion for iPhone photos (Windows-friendly).
 */
import { showToast } from './toast.js';

let heic2anyLoader = null;

async function loadHeic2Any() {
  if (!heic2anyLoader) {
    heic2anyLoader = import('https://esm.sh/heic2any@0.0.4').then((m) => m.default);
  }
  return heic2anyLoader;
}

export function isHeicFile(file) {
  if (!file) return false;
  const name = file.name || '';
  const type = (file.type || '').toLowerCase();
  return /\.heic$/i.test(name)
    || /\.heif$/i.test(name)
    || type === 'image/heic'
    || type === 'image/heif';
}

/**
 * Convert HEIC to JPEG File. Non-HEIC files pass through unchanged.
 * @param {File} file
 * @returns {Promise<File>}
 */
export async function normalizeImageFile(file) {
  if (!isHeicFile(file)) return file;

  try {
    const heic2any = await loadHeic2Any();
    const converted = await heic2any({
      blob: file,
      toType: 'image/jpeg',
      quality: 0.92,
    });
    const blob = Array.isArray(converted) ? converted[0] : converted;
    const baseName = file.name.replace(/\.(heic|heif)$/i, '');
    const newName = `${baseName}.jpg`;
    showToast(`${file.name} → JPEG に変換しました`, 'success', 2500);
    return new File([blob], newName, {
      type: 'image/jpeg',
      lastModified: file.lastModified || Date.now(),
    });
  } catch (e) {
    console.warn('[heic] conversion failed', e);
    showToast('HEIC変換に失敗しました。元の形式で送信します', 'info', 3500);
    return file;
  }
}

/** @param {FileList|File[]} files */
export async function normalizeFileList(files) {
  const out = [];
  for (const file of files) {
    out.push(await normalizeImageFile(file));
  }
  return out;
}
