// Session utilities: join-code (PIN) issuance and verification

import { dbRef, set, get } from './firebase.js';
import { PIN_CODE_LENGTH } from './constants.js';

/**
 * Issues a join code (PIN) mapping to a sessionId.
 * @param {import('./firebase.js').Database} db
 * @param {string} sessionId
 * @param {string} pin
 * @returns {Promise<boolean>}
 */
export async function issueJoinCode(db, sessionId, pin) {
  const code = String(pin || '').replace(/[^0-9]/g, '').slice(0, PIN_CODE_LENGTH);
  if (!/^\d{6}$/.test(code)) return false;
  try {
    const codeRef = dbRef(db, `codes/${code}`);
    // Client timestamp for reliable TTL checks on mobile (serverTimestamp alone can skew)
    const timestamp = Date.now();
    await set(codeRef, { sessionId, timestamp });
    const snap = await get(codeRef);
    return snap.exists();
  } catch (e) {
    console.warn('[session] issueJoinCode error', e);
    return false;
  }
}

/**
 * 参加コードからセッションIDを取得する。
 * @param {import('./firebase.js').Database} db
 * @param {string} code 6桁
 * @param {number} ttlMs
 * @returns {Promise<string|null>}
 */
function normalizeTimestamp(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return null;
}

export async function resolveJoinCode(db, code, ttlMs = 10 * 60 * 1000) {
  const digits = String(code || '').replace(/[^0-9]/g, '').slice(0, PIN_CODE_LENGTH);
  if (!/^\d{6}$/.test(digits)) return null;

  const snap = await get(dbRef(db, `codes/${digits}`));
  if (!snap.exists()) return null;

  const { sessionId, timestamp } = snap.val() || {};
  if (!sessionId || typeof sessionId !== 'string') return null;

  const ts = normalizeTimestamp(timestamp);
  if (ts !== null && Date.now() - ts >= ttlMs) return null;

  return sessionId;
}
