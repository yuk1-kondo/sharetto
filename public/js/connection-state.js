import { CONNECTION_STATE, CONNECTION_STATE_LABELS } from './constants.js';

const listeners = new Set();
let state = CONNECTION_STATE.IDLE;
let detail = '';
let progress = 0;
let peerCount = 0;

function emit() {
  const snapshot = getConnectionSnapshot();
  listeners.forEach((fn) => {
    try { fn(snapshot); } catch (e) { console.warn('[connection-state]', e); }
  });
}

export function getConnectionSnapshot() {
  return {
    state,
    label: CONNECTION_STATE_LABELS[state] || state,
    detail,
    progress,
    peerCount,
  };
}

export function subscribeConnectionState(fn) {
  listeners.add(fn);
  fn(getConnectionSnapshot());
  return () => listeners.delete(fn);
}

export function setConnectionState(next, opts = {}) {
  state = next;
  if (opts.detail !== undefined) detail = opts.detail;
  if (opts.progress !== undefined) progress = opts.progress;
  if (opts.peerCount !== undefined) peerCount = opts.peerCount;
  emit();
}

export function setTransferProgress(value, detailText) {
  progress = Math.max(0, Math.min(1, value));
  if (detailText !== undefined) detail = detailText;
  if (state !== CONNECTION_STATE.TRANSFERRING && progress > 0 && progress < 1) {
    state = CONNECTION_STATE.TRANSFERRING;
  }
  emit();
}

export function incrementPeerCount(delta = 1) {
  peerCount = Math.max(0, peerCount + delta);
  emit();
}

export function resetConnectionState() {
  state = CONNECTION_STATE.IDLE;
  detail = '';
  progress = 0;
  peerCount = 0;
  emit();
}
