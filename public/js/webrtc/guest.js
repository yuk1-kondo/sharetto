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
import { P2P_CONNECT_TIMEOUT_MS } from '../constants.js';
import {
  setConnectionState,
} from '../connection-state.js';
import { CONNECTION_STATE } from '../constants.js';

function stripIce(cand) {
  const { at, ...rest } = cand || {};
  return rest;
}

/**
 * モバイル側（送信ゲスト）: PC へ WebRTC 接続
 */
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

      stopAnswer = watchAnswer(db, sessionId, peerId, async (answer) => {
        if (pc.signalingState === 'stable' && pc.remoteDescription) return;
        try {
          await pc.setRemoteDescription(answer);
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

      await new Promise((resolve, reject) => {
        const deadline = Date.now() + P2P_CONNECT_TIMEOUT_MS;
        const tick = () => {
          if (pc.connectionState === 'connected' || pc.iceConnectionState === 'connected') {
            resolve();
            return;
          }
          if (Date.now() > deadline) {
            reject(new Error('P2P connect timeout'));
            return;
          }
          setTimeout(tick, 250);
        };
        tick();
      });

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
