import { dbRef, set, update, onValue, off, get, push } from '../firebase.js';

function signalingRoot(db, sessionId) {
  return dbRef(db, `signaling/${sessionId}`);
}

function peerRoot(db, sessionId, peerId) {
  return dbRef(db, `signaling/${sessionId}/peers/${peerId}`);
}

export async function initHostSignaling(db, sessionId) {
  await set(signalingRoot(db, sessionId), {
    role: 'host',
    createdAt: Date.now(),
    status: 'waiting',
  });
}

export async function publishOffer(db, sessionId, peerId, offer) {
  await update(peerRoot(db, sessionId, peerId), {
    offer: { sdp: offer.sdp, type: offer.type },
    updatedAt: Date.now(),
  });
}

export async function publishAnswer(db, sessionId, peerId, answer) {
  await update(peerRoot(db, sessionId, peerId), {
    answer: { sdp: answer.sdp, type: answer.type },
    updatedAt: Date.now(),
  });
}

export async function addIceCandidate(db, sessionId, peerId, from, candidate) {
  const listRef = push(dbRef(db, `signaling/${sessionId}/peers/${peerId}/ice/${from}`));
  await set(listRef, { ...candidate, at: Date.now() });
}

export function watchPeerOffers(db, sessionId, onPeer) {
  const peersRef = dbRef(db, `signaling/${sessionId}/peers`);
  const handler = (snap) => {
    const val = snap.val();
    if (!val) return;
    Object.entries(val).forEach(([peerId, data]) => {
      if (data?.offer && !data?.answered) onPeer(peerId, data);
    });
  };
  onValue(peersRef, handler);
  return () => off(peersRef);
}

export function watchAnswer(db, sessionId, peerId, callback) {
  const ref = dbRef(db, `signaling/${sessionId}/peers/${peerId}/answer`);
  const handler = (snap) => {
    const val = snap.val();
    if (val?.sdp) callback(val);
  };
  onValue(ref, handler);
  return () => off(ref);
}

export function watchRemoteIce(db, sessionId, peerId, from, callback) {
  const ref = dbRef(db, `signaling/${sessionId}/peers/${peerId}/ice/${from}`);
  const seen = new Set();
  const handler = (snap) => {
    const val = snap.val();
    if (!val) return;
    Object.entries(val).forEach(([key, cand]) => {
      if (seen.has(key)) return;
      seen.add(key);
      callback(cand);
    });
  };
  onValue(ref, handler);
  return () => off(ref);
}

export async function markPeerAnswered(db, sessionId, peerId) {
  await update(peerRoot(db, sessionId, peerId), { answered: true });
}

export async function getHostStatus(db, sessionId) {
  const snap = await get(signalingRoot(db, sessionId));
  return snap.val();
}

export async function setSignalingStatus(db, sessionId, status) {
  await update(signalingRoot(db, sessionId), { status, updatedAt: Date.now() });
}
