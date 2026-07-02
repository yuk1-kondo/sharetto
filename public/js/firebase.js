// Centralized Firebase initialization and re-exports

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getDatabase,
  ref as dbRef,
  onValue,
  off,
  set,
  update,
  get,
  push,
  remove,
  onChildAdded,
  connectDatabaseEmulator,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import {
  getFirestore,
  connectFirestoreEmulator,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

export function initFirebase(firebaseConfig) {
  const app = initializeApp(firebaseConfig);
  const db = getDatabase(app);
  const fs = getFirestore(app);

  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
    try { connectDatabaseEmulator(db, '127.0.0.1', 9000); } catch { /* noop */ }
    try { connectFirestoreEmulator(fs, '127.0.0.1', 8080); } catch { /* noop */ }
  }

  return { app, db, fs };
}

export {
  dbRef,
  onValue,
  off,
  set,
  update,
  get,
  push,
  remove,
  onChildAdded,
  serverTimestamp,
};
