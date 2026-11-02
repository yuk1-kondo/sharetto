// Session utilities: join-code (PIN) issuance and verification

import { dbRef, set, get, update, onValue } from './firebase.js';
import { PIN_CODE_LENGTH, SESSION_TTL_MS } from './constants.js';

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
 * @returns {Promise<string|null>}
 */
export async function resolveJoinCode(db, code) {
  const digits = String(code || '').replace(/[^0-9]/g, '').slice(0, PIN_CODE_LENGTH);
  if (!/^\d{6}$/.test(digits)) return null;

  const snap = await get(dbRef(db, `codes/${digits}`));
  if (!snap.exists()) return null;

  const { sessionId } = snap.val() || {};
  if (!sessionId || typeof sessionId !== 'string') return null;

  const session = await getSession(db, sessionId);
  if (!isSessionActive(session)) return null;

  return sessionId;
}

export function isSessionActive(session) {
  return session?.status === 'active' && Number.isFinite(session.expiresAt) && session.expiresAt > Date.now();
}

export async function getSession(db, sessionId) {
  const snap = await get(dbRef(db, `sessions/${sessionId}`));
  return snap.val();
}

export async function createSession(db, sessionId) {
  const session = { status: 'active', createdAt: Date.now(), expiresAt: Date.now() + SESSION_TTL_MS };
  await set(dbRef(db, `sessions/${sessionId}`), session);
  return session;
}

export async function extendSession(db, sessionId) {
  const session = await getSession(db, sessionId);
  if (!isSessionActive(session)) throw new Error('終了したセッションは延長できません');
  const expiresAt = session.expiresAt + SESSION_TTL_MS;
  await update(dbRef(db, `sessions/${sessionId}`), { expiresAt });
  return expiresAt;
}

export function endSession(db, sessionId) {
  return update(dbRef(db, `sessions/${sessionId}`), { status: 'ended' });
}

export function watchSession(db, sessionId, callback, onError) {
  return onValue(dbRef(db, `sessions/${sessionId}`), (snap) => callback(snap.val()), onError);
}
