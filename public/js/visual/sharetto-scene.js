/**
 * Sharetto Orbital Link — メイン 3D シーン
 */
import { createSceneManager } from './scene-manager.js';
import { createSessionRing } from './objects/session-ring.js';
import { createHubNode } from './objects/hub-node.js';
import { createPeerNode } from './objects/peer-node.js';
import { createLinkBeam } from './objects/link-beam.js';
import { createDataStream } from './objects/data-stream.js';
import { getVisualParams } from './state-bridge.js';
import { CONNECTION_STATE } from '../constants.js';

export function buildOrbitalScene(THREE, { scene }) {
  const isMobile = window.innerWidth < 768;
  const ring = createSessionRing(THREE, {
    particleCount: isMobile ? 120 : 280,
    tubularSegments: isMobile ? 48 : 128,
    glowSegments: isMobile ? 32 : 64,
  });
  const hub = createHubNode(THREE);
  const peer = createPeerNode(THREE);
  const link = createLinkBeam(THREE);
  const stream = createDataStream(THREE, { count: isMobile ? 40 : 80 });

  const root = new THREE.Group();
  root.add(ring.group);
  root.add(hub.group);
  root.add(peer.group);
  root.add(link.group);
  root.add(stream.group);
  scene.add(root);

  let currentColor = new THREE.Color(0x2962ff);
  let currentEmissive = new THREE.Color(0x1a3a8a);
  const targetColor = new THREE.Color();
  const targetEmissive = new THREE.Color();
  let currentParams = {
    ...getVisualParams(CONNECTION_STATE.WAITING),
    color: currentColor,
    emissive: currentEmissive,
    state: CONNECTION_STATE.WAITING,
    progress: 0,
    ringSpeed: 0.2,
    particleSpeed: 0.35,
    ringOpacity: 0.6,
    breathe: 0.5,
  };
  let burstT = 0;

  function lerpParams(target, t) {
    targetColor.set(target.color);
    targetEmissive.set(target.emissive);
    currentColor.lerp(targetColor, t);
    currentEmissive.lerp(targetEmissive, t);
    currentParams = {
      color: currentColor,
      emissive: currentEmissive,
      ringSpeed: currentParams.ringSpeed + (target.ringSpeed - currentParams.ringSpeed) * t,
      particleSpeed: currentParams.particleSpeed + (target.particleSpeed - currentParams.particleSpeed) * t,
      ringOpacity: currentParams.ringOpacity + (target.ringOpacity - currentParams.ringOpacity) * t,
      breathe: currentParams.breathe + (target.breathe - currentParams.breathe) * t,
      state: target.state,
      progress: currentParams.progress + ((target.progress ?? 0) - currentParams.progress) * Math.max(t, 0.2),
    };
  }

  return {
    setTimerRatio(r) { ring.setTimerRatio(r); },
    update(dt, snap, elapsed) {
      const target = { ...getVisualParams(snap.state), state: snap.state, progress: snap.progress ?? 0 };
      lerpParams(target, 0.08);

      const connected = snap.state === CONNECTION_STATE.CONNECTED
        || snap.state === CONNECTION_STATE.TRANSFERRING
        || snap.state === CONNECTION_STATE.COMPLETE;
      const transferring = snap.state === CONNECTION_STATE.TRANSFERRING;

      peer.setVisible(connected);
      link.setVisible(connected);
      stream.setVisible(transferring);

      peer.update(dt, currentParams);
      if (connected) {
        link.updateEndPoint(peer.group.position.x, peer.group.position.y, peer.group.position.z, dt);
        link.update(dt, currentParams);
      }

      if (snap.state === CONNECTION_STATE.COMPLETE && burstT <= 0) burstT = 0.8;
      if (burstT > 0) {
        root.scale.setScalar(1 + Math.sin(((0.8 - burstT) / 0.8) * Math.PI) * 0.08);
        burstT -= dt;
      } else {
        root.scale.setScalar(1);
      }

      root.rotation.y = Math.sin(elapsed * 0.15) * 0.08;

      const hubIntensity = connected ? 1.2 : 0.7;
      ring.update(dt, currentParams, elapsed);
      hub.update(dt, currentParams, elapsed, hubIntensity);
      stream.update(dt, currentParams, currentParams.progress);
    },
    dispose() {
      scene.remove(root);
      ring.dispose();
      hub.dispose();
      peer.dispose();
      link.dispose();
      stream.dispose();
    },
  };
}

export async function initSharettoScene(container) {
  return createSceneManager(container, buildOrbitalScene);
}
