/**
 * ICE candidate を remoteDescription 設定前にバッファする
 */
export function createIceQueue(pc) {
  const queue = [];
  let canAdd = false;

  async function flush() {
    if (!canAdd || !pc.remoteDescription) return;
    while (queue.length) {
      const cand = queue.shift();
      try {
        await pc.addIceCandidate(cand);
      } catch (e) {
        console.warn('[ice-queue] addIceCandidate', e);
      }
    }
  }

  return {
    markRemoteDescriptionSet() {
      canAdd = true;
      return flush();
    },
    async add(candidate) {
      if (!candidate) return;
      if (canAdd && pc.remoteDescription) {
        try {
          await pc.addIceCandidate(candidate);
        } catch (e) {
          console.warn('[ice-queue] addIceCandidate', e);
        }
      } else {
        queue.push(candidate);
      }
    },
    clear() {
      queue.length = 0;
      canAdd = false;
    },
  };
}
