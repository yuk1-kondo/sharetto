import {
  createPeerConnection,
  attachIceHandlers,
  openDataChannel,
  sendFileOverChannel,
  sendTextOverChannel,
} from './transfer.js';
import {
  publishOffer,
  addIceCandidate,
  watchAnswer,
  watchRemoteIce,
} from './signaling.js';
import { P2P_CONNECT_TIMEOUT_MS, CONNECTION_STATE } from '../constants.js';
import { setConnectionState } from '../connection-state.js';

function stripIce(cand) {
  const { at, ...rest } = cand || {};
  return rest;
}

function waitForIceConnected(pc, timeoutMs) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const check = () => {
      const s = pc.iceConnectionState;
      if (s === 'connected' || s === 'completed') {
        resolve();
        return;
      }
      if (s === 'failed' || s === 'closed') {
        reject(new Error(`ICE ${s}`));
        return;
      }
      if (Date.now() > deadline) {
        reject(new Error('ICE timeout'));
        return;
      }
      setTimeout(check, 200);
    };
    check();
  });
}

export function createP2PGuest({ db, sessionId, onConnected, onFailed }) {
  const peerId = Math.random().toString(36).slice(2, 10);
  let pc = null;
  let channel = null;
  let stopAnswer = null;
  let stopIce = null;

  return {
    getChannel() { return channel; },
    getPeerId() { return peerId; },

    async connect() {
      setConnectionState(CONNECTION_STATE.CONNECTING, { detail: 'PCへ直接接続中…' });
      pc = createPeerConnection();
      channel = openDataChannel(pc);

      let answerApplied = false;
      stopAnswer = watchAnswer(db, sessionId, peerId, async (answer) => {
        if (answerApplied) return;
        try {
          await pc.setRemoteDescription(answer);
          answerApplied = true;
        } catch (e) {
          console.warn('[p2p-guest] setRemoteDescription', e);
        }
      });

      stopIce = watchRemoteIce(db, sessionId, peerId, 'host', async (cand) => {
        try { await pc.addIceCandidate(stripIce(cand)); } catch (e) { console.warn('[p2p-guest] ICE', e); }
      });

      await attachIceHandlers(pc, (candidate) => {
        addIceCandidate(db, sessionId, peerId, 'guest', candidate);
      });

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await publishOffer(db, sessionId, peerId, offer);

      const answerDeadline = Date.now() + P2P_CONNECT_TIMEOUT_MS;
      while (!answerApplied && Date.now() < answerDeadline) {
        await new Promise((r) => setTimeout(r, 200));
      }
      if (!answerApplied) throw new Error('answer timeout');

      await waitForIceConnected(pc, P2P_CONNECT_TIMEOUT_MS);

      if (channel.readyState !== 'open') {
        await new Promise((resolve, reject) => {
          const t = setTimeout(() => reject(new Error('channel timeout')), 8000);
          channel.addEventListener('open', () => { clearTimeout(t); resolve(); }, { once: true });
        });
      }

      setConnectionState(CONNECTION_STATE.CONNECTED, { detail: '直接接続完了' });
      onConnected?.(channel);
      return channel;
    },

    stop() {
      stopAnswer?.();
      stopIce?.();
      channel?.close();
      pc?.close();
    },

    fail(err) {
      onFailed?.(err);
    },
  };
}

export { sendFileOverChannel, sendTextOverChannel };
