import { PIN_CODE_LENGTH, SESSION_ID_LENGTH } from './constants.js';

export function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

export function escapeHTML(str) {
  return String(str).replace(/[&<>"']/g, (m) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[m]));
}

export function generateSessionId(length = SESSION_ID_LENGTH) {
  const seed = (Date.now().toString(36) + Math.random().toString(36).slice(2))
    .replace(/[^a-z0-9]/g, '');
  return seed.slice(0, length);
}

export function generatePin(length = PIN_CODE_LENGTH) {
  const min = Math.pow(10, length - 1);
  const max = Math.pow(10, length) - 1;
  return String(Math.floor(min + Math.random() * (max - min + 1)));
}

/** 入力から6桁の参加コードを抽出 */
export function extractJoinCode(input) {
  return String(input || '').replace(/[^0-9]/g, '').slice(0, PIN_CODE_LENGTH);
}

/**
 * 参加コード入力欄の値を解釈する。
 * @returns {{ type: 'code', code: string } | { type: 'session', sessionId: string } | null}
 */
export function parseJoinInput(raw) {
  const value = String(raw || '').trim();
  if (!value) return null;

  // upload.html?session=xxx 形式のURL
  try {
    const url = value.startsWith('http') ? new URL(value) : new URL(value, location.origin);
    const session = url.searchParams.get('session');
    if (session && session.length >= 6) {
      return { type: 'session', sessionId: session };
    }
    const code = url.searchParams.get('code');
    if (code && /^\d{6}$/.test(extractJoinCode(code))) {
      return { type: 'code', code: extractJoinCode(code) };
    }
  } catch {
    // URL でなければ下の数字抽出へ
  }

  const digits = extractJoinCode(value);
  if (/^\d{6}$/.test(digits)) {
    return { type: 'code', code: digits };
  }

  return null;
}

export function getFileIcon(mimeType, isImage) {
  if (isImage) return '🖼️';
  if (!mimeType) return '📄';
  if (mimeType.includes('pdf')) return '📄';
  if (mimeType.includes('video')) return '🎥';
  if (mimeType.includes('audio')) return '🎵';
  if (mimeType.includes('zip') || mimeType.includes('rar')) return '📦';
  if (mimeType.includes('text')) return '📝';
  return '📄';
}
