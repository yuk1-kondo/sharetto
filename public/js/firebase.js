// Centralized Firebase initialization and re-exports
// Keep API surface minimal to avoid breaking existing code.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getDatabase,
  ref as dbRef,
  onValue,
  off,
  set,
  update,
  get,
  connectDatabaseEmulator,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

export function initFirebase(firebaseConfig) {
  const app = initializeApp(firebaseConfig);
  const db = getDatabase(app);
  const auth = getAuth(app);
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
    try { connectDatabaseEmulator(db, '127.0.0.1', 9000); } catch {}
  }
  return { app, db, auth };
}

// Re-export commonly used APIs so callers don't fetch SDKs repeatedly
export {
  dbRef,
  onValue,
  off,
  set,
  update,
  get,
  serverTimestamp,
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  signOut,
};
