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
