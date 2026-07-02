import {
  createPeerConnection,
  attachIceHandlers,
  createFileReceiver,
  sendFileOverChannel,
  sendTextOverChannel,
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

export function createP2PHost({ fs, sessionId, onFile, onText, onPeerConnected }) {
  const peers = new Map();
  const processing = new Set();
  let stopWatch = null;

  function getActiveChannel() {
    for (const { channel } of peers.values()) {
      if (channel?.readyState === 'open') return channel;
    }
    return null;
  }

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
        setTimeout(() => setConnectionState(CONNECTION_STATE.CONNECTED, { detail: '双方向で送受信できます', progress: 0 }), 2000);
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
        addIceCandidate(fs, sessionId, peerId, 'host', candidate);
      });

      await pc.setRemoteDescription(data.offer);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await publishAnswer(fs, sessionId, peerId, answer);
      await markPeerAnswered(fs, sessionId, peerId);

      stopIce = watchRemoteIce(fs, sessionId, peerId, 'guest', async (cand) => {
        try {
          await pc.addIceCandidate(stripIce(cand));
        } catch (e) {
          console.warn('[p2p-host] ICE', e);
        }
      });

      const channel = await channelPromise;
      incrementPeerCount(1);
      setConnectionState(CONNECTION_STATE.CONNECTED, {
        detail: '直接接続 — 双方向で送受信できます',
        peerCount: peers.size + 1,
      });
      await setSignalingStatus(fs, sessionId, 'connected');
      peers.set(peerId, { pc, stopIce, channel });
      onPeerConnected?.(peerId, channel);
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
      await initHostSignaling(fs, sessionId);
      setConnectionState(CONNECTION_STATE.WAITING, { detail: 'スマホからの接続を待っています' });
      stopWatch = watchPeerOffers(fs, sessionId, (peerId, data) => {
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
    getActiveChannel,
    isConnected() {
      return !!getActiveChannel();
    },
    sendText(text) {
      const ch = getActiveChannel();
      if (!ch) throw new Error('スマホが接続されていません');
      sendTextOverChannel(ch, text);
    },
    async sendFile(file, onProgress) {
      const ch = getActiveChannel();
      if (!ch) throw new Error('スマホが接続されていません');
      return sendFileOverChannel(ch, file, onProgress);
    },
  };
}
