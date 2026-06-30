import { ICE_SERVERS, CHUNK_SIZE_BYTES, MSG } from '../constants.js';

export function createPeerConnection() {
  return new RTCPeerConnection({ iceServers: ICE_SERVERS });
}

export async function attachIceHandlers(pc, onCandidate) {
  pc.onicecandidate = (ev) => {
    if (ev.candidate) onCandidate(ev.candidate.toJSON());
  };
}

export function waitForDataChannel(pc, label = 'sharetto') {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('DataChannel timeout')), 20000);
    pc.ondatachannel = (ev) => {
      clearTimeout(timeout);
      ev.channel.binaryType = 'arraybuffer';
      resolve(ev.channel);
    };
    try {
      const ch = pc.createDataChannel(label, { ordered: true });
      ch.binaryType = 'arraybuffer';
      ch.addEventListener('open', () => {
        clearTimeout(timeout);
        resolve(ch);
      }, { once: true });
    } catch (e) {
      clearTimeout(timeout);
      reject(e);
    }
  });
}

export function openDataChannel(pc, label = 'sharetto') {
  const ch = pc.createDataChannel(label, { ordered: true });
  ch.binaryType = 'arraybuffer';
  return ch;
}

export async function sendFileOverChannel(channel, file, onProgress) {
  const fid = Math.random().toString(36).slice(2, 10);
  const buffer = await file.arrayBuffer();
  const totalChunks = Math.ceil(buffer.byteLength / CHUNK_SIZE_BYTES) || 1;

  channel.send(JSON.stringify({
    type: MSG.FILE_START,
    id: fid,
    name: file.name,
    mimeType: file.type || 'application/octet-stream',
    size: buffer.byteLength,
    totalChunks,
  }));

  for (let i = 0; i < totalChunks; i++) {
    const start = i * CHUNK_SIZE_BYTES;
    const chunk = buffer.slice(start, start + CHUNK_SIZE_BYTES);
    channel.send(JSON.stringify({ type: MSG.FILE_CHUNK, id: fid, index: i, total: totalChunks }));
    channel.send(chunk);
    onProgress?.((i + 1) / totalChunks, file.name);
    await new Promise((r) => setTimeout(r, 0));
  }

  channel.send(JSON.stringify({ type: MSG.FILE_END, id: fid, name: file.name }));
  return fid;
}

export function sendTextOverChannel(channel, text) {
  channel.send(JSON.stringify({ type: MSG.TEXT, body: text, at: Date.now() }));
}

export function createFileReceiver(onFile, onText, onProgress) {
  const buffers = new Map();
  const metas = new Map();
  let pendingMeta = null;

  function handleMessage(data) {
    if (typeof data === 'string') {
      let msg;
      try { msg = JSON.parse(data); } catch { return; }
      if (msg.type === MSG.FILE_START) {
        pendingMeta = msg;
        buffers.set(msg.id, []);
        metas.set(msg.id, msg);
      } else if (msg.type === MSG.FILE_CHUNK) {
        pendingMeta = msg;
      } else if (msg.type === MSG.FILE_END) {
        const parts = buffers.get(msg.id) || [];
        const meta = metas.get(msg.id) || msg;
        const blob = new Blob(parts, { type: meta.mimeType || 'application/octet-stream' });
        onFile?.({ id: msg.id, name: meta.name || msg.name, blob, size: blob.size, mimeType: meta.mimeType });
        buffers.delete(msg.id);
        metas.delete(msg.id);
        onProgress?.(1, meta.name);
      } else if (msg.type === MSG.TEXT) {
        onText?.(msg.body);
      }
      return;
    }
    if (data instanceof ArrayBuffer && pendingMeta?.type === MSG.FILE_CHUNK) {
      const id = pendingMeta.id;
      if (!buffers.has(id)) buffers.set(id, []);
      buffers.get(id).push(data);
      const total = pendingMeta.total || 1;
      const index = pendingMeta.index ?? 0;
      onProgress?.((index + 1) / total, metas.get(id)?.name);
    }
  }

  return {
    bindChannel(channel) {
      channel.binaryType = 'arraybuffer';
      channel.onmessage = (ev) => handleMessage(ev.data);
    },
  };
}
