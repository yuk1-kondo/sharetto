/**
 * WebRTC signaling via Firebase RTDB（ファイル転送と同じ経路）
 */
import { dbRef, set, update, push, onValue, off, get } from '../firebase.js';

function sessionRef(db, sessionId) {
  return dbRef(db, `signal/${sessionId}`);
}

function peerRef(db, sessionId, peerId) {
  return dbRef(db, `signal/${sessionId}/peers/${peerId}`);
}

function candidatesRef(db, sessionId, peerId) {
  return dbRef(db, `signal/${sessionId}/peers/${peerId}/candidates`);
}

export async function initHostSignaling(db, sessionId) {
  await set(sessionRef(db, sessionId), {
    role: 'host',
    status: 'waiting',
    createdAt: Date.now(),
    expiresAt: Date.now() + 10 * 60 * 1000,
  });
}

export async function publishOffer(db, sessionId, peerId, offer) {
  await set(peerRef(db, sessionId, peerId), {
    offer: { sdp: offer.sdp, type: offer.type },
    answered: false,
    updatedAt: Date.now(),
  });
}

export async function publishAnswer(db, sessionId, peerId, answer) {
  await update(peerRef(db, sessionId, peerId), {
    answer: { sdp: answer.sdp, type: answer.type },
    updatedAt: Date.now(),
  });
}

export async function addIceCandidate(db, sessionId, peerId, from, candidate) {
  if (!candidate) return;
  await push(candidatesRef(db, sessionId, peerId), {
    from,
    ...candidate,
    at: Date.now(),
  });
}

export function watchPeerOffers(db, sessionId, onPeer) {
  const peersRef = dbRef(db, `signal/${sessionId}/peers`);
  const seen = new Set();

  function consider(peerId, data) {
    if (!data?.offer?.sdp || data.answered) return;
    const key = `${peerId}:${data.offer.sdp.slice(0, 32)}`;
    if (seen.has(key)) return;
    seen.add(key);
    onPeer(peerId, data);
  }

  const handler = (snap) => {
    if (!snap.exists()) return;
    snap.forEach((child) => consider(child.key, child.val()));
  };

  onValue(peersRef, handler);
  return () => off(peersRef, 'value', handler);
}

export function watchAnswer(db, sessionId, peerId, callback) {
  const ref = peerRef(db, sessionId, peerId);
  let done = false;

  const handler = (snap) => {
    if (done || !snap.exists()) return;
    const val = snap.val()?.answer;
    if (val?.sdp) {
      done = true;
      callback(val);
    }
  };

  onValue(ref, handler);
  return () => off(ref, 'value', handler);
}

export function watchRemoteIce(db, sessionId, peerId, from, callback) {
  const ref = candidatesRef(db, sessionId, peerId);
  const seen = new Set();

  const handler = (snap) => {
    if (!snap.exists()) return;
    snap.forEach((child) => {
      const id = child.key;
      if (seen.has(id)) return;
      const data = child.val();
      if (data?.from !== from) return;
      seen.add(id);
      callback(data);
    });
  };

  onValue(ref, handler);
  return () => off(ref, 'value', handler);
}

export async function markPeerAnswered(db, sessionId, peerId) {
  await update(peerRef(db, sessionId, peerId), { answered: true });
}

export async function getHostStatus(db, sessionId) {
  const snap = await get(sessionRef(db, sessionId));
  return snap.exists() ? snap.val() : null;
}

export async function setSignalingStatus(db, sessionId, status) {
  await update(sessionRef(db, sessionId), {
    status,
    updatedAt: Date.now(),
  });
}
