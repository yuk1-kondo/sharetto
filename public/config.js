// Centralized public configuration for Sharetto
// Note: Firebase client keys are public by design.

export const firebaseConfig = {
  apiKey: "AIzaSyBfQL3uQps2xRvfJn7CWaa-7KNmvNopARA",
  authDomain: "sharetto-app.firebaseapp.com",
  databaseURL: "https://sharetto-app-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "sharetto-app",
  storageBucket: "sharetto-app.appspot.com",
  messagingSenderId: "41080814725",
  appId: "1:41080814725:web:9e08830290acdb28903dec"
};

/**
 * ICE servers — STUN + TURN for NAT traversal.
 * Replace customTurn with your Metered / Cloudflare / Twilio credentials for production scale.
 * OpenRelay entries help in restrictive networks (public test relay).
 */
export const iceConfig = {
  stun: [
    'stun:stun.l.google.com:19302',
    'stun:stun1.l.google.com:19302',
    'stun:stun2.l.google.com:19302',
  ],
  turn: [
    {
      urls: [
        'turn:openrelay.metered.ca:80',
        'turn:openrelay.metered.ca:443',
        'turn:openrelay.metered.ca:443?transport=tcp',
        'turns:openrelay.metered.ca:443?transport=tcp',
      ],
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: [
        'turn:relay.metered.ca:80',
        'turn:relay.metered.ca:443',
        'turn:relay.metered.ca:443?transport=tcp',
        'turns:relay.metered.ca:443',
      ],
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
  ],
  /** Add your own TURN (recommended after Blaze upgrade): */
  customTurn: null,
  // customTurn: {
  //   urls: ['turn:your-turn.example.com:3478'],
  //   username: 'user',
  //   credential: 'pass',
  // },
};
