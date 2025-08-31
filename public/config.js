// Centralized public configuration for Sharetto
// Note: These values are public for Firebase client SDK usage.

export const firebaseConfig = {
  apiKey: "AIzaSyBfQL3uQps2xRvfJn7CWaa-7KNmvNopARA",
  authDomain: "sharetto-app.firebaseapp.com",
  databaseURL: "https://sharetto-app-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "sharetto-app",
  storageBucket: "sharetto-app.appspot.com",
  messagingSenderId: "41080814725",
  appId: "1:41080814725:web:9e08830290acdb28903dec"
};

// Feature flags (public)
export const features = {
  // Invite code UI was removed; keep flag in case we want to re-enable in future
  enableInviteCodeGate: false,
};

