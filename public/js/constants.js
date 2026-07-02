/** Sharetto 共通定数 */

export const AUTH_SESSION_KEY = 'auth_session';
export const AUTH_EXPIRES_KEY = 'auth_expires';
export const AUTH_SESSION_DURATION_MS = 24 * 60 * 60 * 1000;

export const SESSION_TTL_MS = 10 * 60 * 1000;
export const SESSION_WARNING_THRESHOLD_MS = 3 * 60 * 1000;
export const SESSION_CRITICAL_THRESHOLD_MS = 1 * 60 * 1000;

export const PIN_CODE_LENGTH = 6;
export const SESSION_ID_LENGTH = 13;

export const PBKDF2_ITERATIONS = 200000;
export const SALT_LENGTH = 16;
export const IV_LENGTH = 12;

export const MAX_FILE_SIZE_MB = 50;
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

/** 転送モード: p2p = WebRTC直接, relay = Firebase RTDB */
export const TRANSFER_MODE = {
  P2P: 'p2p',
  RELAY: 'relay',
};

/** 接続・転送の状態（UI / Three.js 共通） */
export const CONNECTION_STATE = {
  IDLE: 'idle',
  WAITING: 'waiting',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  TRANSFERRING: 'transferring',
  COMPLETE: 'complete',
  FAILED: 'failed',
};

export const CONNECTION_STATE_LABELS = {
  idle: '準備中',
  waiting: '接続待機中',
  connecting: '接続中…',
  connected: '接続完了',
  transferring: '転送中',
  complete: '転送完了',
  failed: '接続失敗',
};

/** iPhone Safari 向け chunk サイズ */
export const CHUNK_SIZE_BYTES = 256 * 1024;

export const P2P_CONNECT_TIMEOUT_MS = 20000;

export const MSG = {
  FILE_START: 'file-start',
  FILE_CHUNK: 'file-chunk',
  FILE_END: 'file-end',
  TEXT: 'text',
  PING: 'ping',
};
