/**
 * ICE server configuration — STUN + TURN tiers for maximum connectivity.
 * TURN credentials in config.js can be replaced with your own (Metered, Cloudflare, etc.).
 */
import { iceConfig } from '../../config.js';

function stunEntries(urls) {
  return urls.map((urls) => (typeof urls === 'string' ? { urls } : urls));
}

/** @returns {RTCIceServer[]} */
export function getIceServers() {
  const servers = [];

  if (iceConfig?.stun?.length) {
    servers.push(...stunEntries(iceConfig.stun));
  } else {
    servers.push(
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    );
  }

  const turnPools = [
    ...(iceConfig?.customTurn ? [iceConfig.customTurn] : []),
    ...(iceConfig?.turn || []),
  ];

  for (const entry of turnPools) {
    if (!entry?.urls) continue;
    servers.push({
      urls: entry.urls,
      username: entry.username,
      credential: entry.credential,
    });
  }

  return servers;
}

/** Log ICE gathering summary once connected (dev aid). */
export function attachIceDiagnostics(pc, label = 'pc') {
  pc.addEventListener('iceconnectionstatechange', () => {
    if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
      pc.getStats().then((stats) => {
        stats.forEach((r) => {
          if (r.type === 'candidate-pair' && r.state === 'succeeded') {
            console.info(`[ice:${label}] connected via`, r.localCandidateId, r.remoteCandidateId);
          }
        });
      }).catch(() => {});
    }
  });
}
