/**
 * WebRTC signaling via Firestore (offer / answer / ICE candidates).
 * File payloads never touch Firestore — signaling only.
 */
import {
  doc,
  setDoc,
  updateDoc,
  collection,
  addDoc,
  onSnapshot,
  getDoc,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

function sessionRef(fs, sessionId) {
  return doc(fs, 'sessions', sessionId);
}

function peerRef(fs, sessionId, peerId) {
  return doc(fs, 'sessions', sessionId, 'peers', peerId);
}

function candidatesCol(fs, sessionId, peerId) {
  return collection(fs, 'sessions', sessionId, 'peers', peerId, 'candidates');
}

export async function initHostSignaling(fs, sessionId) {
  await setDoc(sessionRef(fs, sessionId), {
    role: 'host',
    createdAt: serverTimestamp(),
    status: 'waiting',
    expiresAt: Date.now() + 10 * 60 * 1000,
  }, { merge: true });
}

export async function publishOffer(fs, sessionId, peerId, offer) {
  await setDoc(peerRef(fs, sessionId, peerId), {
    offer: { sdp: offer.sdp, type: offer.type },
    answered: false,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

export async function publishAnswer(fs, sessionId, peerId, answer) {
  await updateDoc(peerRef(fs, sessionId, peerId), {
    answer: { sdp: answer.sdp, type: answer.type },
    updatedAt: serverTimestamp(),
  });
}

export async function addIceCandidate(fs, sessionId, peerId, from, candidate) {
  await addDoc(candidatesCol(fs, sessionId, peerId), {
    from,
    ...candidate,
    at: Date.now(),
  });
}

export function watchPeerOffers(fs, sessionId, onPeer) {
  const peersCol = collection(fs, 'sessions', sessionId, 'peers');
  const seen = new Set();

  return onSnapshot(peersCol, (snap) => {
    snap.docChanges().forEach((change) => {
      const peerId = change.doc.id;
      const data = change.doc.data();
      if (!data?.offer?.sdp || data.answered) return;
      const key = `${peerId}:${data.offer.sdp.slice(0, 32)}`;
      if (seen.has(key)) return;
      seen.add(key);
      onPeer(peerId, data);
    });
    // Initial load
    snap.forEach((d) => {
      const data = d.data();
      if (!data?.offer?.sdp || data.answered) return;
      const key = `${d.id}:${data.offer.sdp.slice(0, 32)}`;
      if (seen.has(key)) return;
      seen.add(key);
      onPeer(d.id, data);
    });
  });
}

export function watchAnswer(fs, sessionId, peerId, callback) {
  let done = false;
  return onSnapshot(peerRef(fs, sessionId, peerId), (snap) => {
    if (done || !snap.exists()) return;
    const val = snap.data()?.answer;
    if (val?.sdp) {
      done = true;
      callback(val);
    }
  });
}

export function watchRemoteIce(fs, sessionId, peerId, from, callback) {
  const seen = new Set();
  return onSnapshot(candidatesCol(fs, sessionId, peerId), (snap) => {
    snap.docChanges().forEach((change) => {
      if (change.type === 'removed') return;
      const data = change.doc.data();
      if (data.from !== from) return;
      const id = change.doc.id;
      if (seen.has(id)) return;
      seen.add(id);
      callback(data);
    });
  });
}

export async function markPeerAnswered(fs, sessionId, peerId) {
  await updateDoc(peerRef(fs, sessionId, peerId), { answered: true });
}

export async function getHostStatus(fs, sessionId) {
  const snap = await getDoc(sessionRef(fs, sessionId));
  return snap.exists() ? snap.data() : null;
}

export async function setSignalingStatus(fs, sessionId, status) {
  await updateDoc(sessionRef(fs, sessionId), {
    status,
    updatedAt: serverTimestamp(),
  });
}
