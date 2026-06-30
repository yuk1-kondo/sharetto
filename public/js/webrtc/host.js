import {
  createPeerConnection,
  attachIceHandlers,
  createFileReceiver,
} from './transfer.js';
import {
  publishAnswer,
  addIceCandidate,
  watchPeerOffers,
  watchRemoteIce,
  markPeerAnswered,
  initHostSignaling,
  setSignalingStatus,
} from './signaling.js';
import { CONNECTION_STATE, P2P_CONNECT_TIMEOUT_MS } from '../constants.js';
import {
  setConnectionState,
  setTransferProgress,
  incrementPeerCount,
} from '../connection-state.js';

function stripIce(cand) {
  const { at, ...rest } = cand || {};
  return rest;
}

export function createP2PHost({ db, sessionId, onFile, onText }) {
  const peers = new Map();
  const processing = new Set();
  let stopWatch = null;

  async function handlePeer(peerId, data) {
    if (peers.has(peerId) || processing.has(peerId)) return;
    processing.add(peerId);

    setConnectionState(CONNECTION_STATE.CONNECTING, { detail: `端末 ${peerId.slice(0, 4)} と接続中` });

    const pc = createPeerConnection();
    const receiver = createFileReceiver(
      (file) => {
        setConnectionState(CONNECTION_STATE.TRANSFERRING, { detail: `${file.name} を受信中` });
        onFile?.(file, peerId);
        setConnectionState(CONNECTION_STATE.COMPLETE, { detail: `${file.name} を受信しました`, progress: 1 });
        setTimeout(() => setConnectionState(CONNECTION_STATE.CONNECTED, { detail: '追加の送信を待機中', progress: 0 }), 2000);
      },
      (text) => onText?.(text, peerId),
      (p, name) => setTransferProgress(p, name ? `${name} ${Math.round(p * 100)}%` : undefined),
    );

    const channelPromise = new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('timeout')), P2P_CONNECT_TIMEOUT_MS);
      pc.ondatachannel = (ev) => {
        clearTimeout(t);
        receiver.bindChannel(ev.channel);
        resolve(ev.channel);
      };
    });

    let stopIce = null;

    try {
      await attachIceHandlers(pc, (candidate) => {
        addIceCandidate(db, sessionId, peerId, 'host', candidate);
      });

      await pc.setRemoteDescription(data.offer);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await publishAnswer(db, sessionId, peerId, answer);
      await markPeerAnswered(db, sessionId, peerId);

      stopIce = watchRemoteIce(db, sessionId, peerId, 'guest', async (cand) => {
        try {
          await pc.addIceCandidate(stripIce(cand));
        } catch (e) {
          console.warn('[p2p-host] ICE', e);
        }
      });

      await channelPromise;
      incrementPeerCount(1);
      setConnectionState(CONNECTION_STATE.CONNECTED, {
        detail: '直接接続が確立しました',
        peerCount: peers.size + 1,
      });
      await setSignalingStatus(db, sessionId, 'connected');
      peers.set(peerId, { pc, stopIce });
    } catch (e) {
      console.warn('[p2p-host] peer failed', e);
      setConnectionState(CONNECTION_STATE.FAILED, { detail: '直接接続に失敗しました' });
      stopIce?.();
      pc.close();
    } finally {
      processing.delete(peerId);
    }
  }

  return {
    async start() {
      await initHostSignaling(db, sessionId);
      setConnectionState(CONNECTION_STATE.WAITING, { detail: 'スマホからの接続を待っています' });
      stopWatch = watchPeerOffers(db, sessionId, (peerId, data) => {
        handlePeer(peerId, data).catch((e) => console.error('[p2p-host]', e));
      });
    },
    stop() {
      stopWatch?.();
      peers.forEach(({ pc, stopIce }) => {
        stopIce?.();
        pc.close();
      });
      peers.clear();
      processing.clear();
    },
  };
}
