// Session utilities: join-code (PIN) issuance and verification
// This module is intentionally tiny to avoid breaking existing flows.

import { getDatabase, ref as dbRef, set, get, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

/**
 * Issues a join code (PIN) mapping to a sessionId.
 * - Writes codes/{pin} = { sessionId, timestamp: serverTimestamp() }
 * - Immediately reads back to verify visibility.
 * @param {import('https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js').Database} db
 * @param {string} sessionId 13-char base36 id
 * @param {string} pin 6 digits
 * @returns {Promise<boolean>} true on success
 */
export async function issueJoinCode(db, sessionId, pin) {
  const code = String(pin || '').replace(/[^0-9]/g, '').slice(0, 6);
  if (!/^\d{6}$/.test(code)) return false;
  try {
    const codeRef = dbRef(db, `codes/${code}`);
    console.log('[session] write code', { code, sessionId });
    await set(codeRef, { sessionId, timestamp: serverTimestamp() });
    const snap = await get(codeRef);
    const ok = snap.exists();
    console.log('[session] verify code exists=', ok);
    return ok;
  } catch (e) {
    console.warn('[session] issueJoinCode error', e);
    return false;
  }
}

