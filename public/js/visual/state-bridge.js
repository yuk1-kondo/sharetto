import { CONNECTION_STATE } from '../constants.js';

/** 接続状態 → 3D ビジュアルパラメータ */
export const STATE_VISUAL = {
  [CONNECTION_STATE.IDLE]: {
    color: 0x2962ff,
    emissive: 0x1a3a8a,
    ringSpeed: 0.15,
    particleSpeed: 0.3,
    ringOpacity: 0.55,
    breathe: 0.4,
  },
  [CONNECTION_STATE.WAITING]: {
    color: 0x2962ff,
    emissive: 0x1a3a8a,
    ringSpeed: 0.2,
    particleSpeed: 0.35,
    ringOpacity: 0.6,
    breathe: 0.5,
  },
  [CONNECTION_STATE.CONNECTING]: {
    color: 0xffb300,
    emissive: 0xcc8800,
    ringSpeed: 0.6,
    particleSpeed: 1.2,
    ringOpacity: 0.75,
    breathe: 1.2,
  },
  [CONNECTION_STATE.CONNECTED]: {
    color: 0x16a34a,
    emissive: 0x0d6b30,
    ringSpeed: 0.35,
    particleSpeed: 0.5,
    ringOpacity: 0.7,
    breathe: 0.6,
  },
  [CONNECTION_STATE.TRANSFERRING]: {
    color: 0xff8f00,
    emissive: 0xcc6600,
    ringSpeed: 1.2,
    particleSpeed: 2.5,
    ringOpacity: 0.9,
    breathe: 2.0,
  },
  [CONNECTION_STATE.COMPLETE]: {
    color: 0xffd700,
    emissive: 0xcc9900,
    ringSpeed: 2.0,
    particleSpeed: 3.5,
    ringOpacity: 1.0,
    breathe: 3.0,
  },
  [CONNECTION_STATE.FAILED]: {
    color: 0xef4444,
    emissive: 0x991b1b,
    ringSpeed: 0.1,
    particleSpeed: 0.15,
    ringOpacity: 0.4,
    breathe: 0.2,
  },
};

export function getVisualParams(state) {
  return STATE_VISUAL[state] ?? STATE_VISUAL[CONNECTION_STATE.WAITING];
}

export function snapshotToVisual(snap) {
  const base = getVisualParams(snap.state);
  return {
    ...base,
    progress: snap.progress ?? 0,
    peerCount: snap.peerCount ?? 0,
    state: snap.state,
  };
}
