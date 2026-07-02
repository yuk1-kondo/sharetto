/**
 * スマホ向け軽量 Three.js — ミニオービタル
 */
import { subscribeConnectionState, getConnectionSnapshot } from '../connection-state.js';
import { snapshotToVisual } from './state-bridge.js';
import { createSceneManager } from './scene-manager.js';
import { CONNECTION_STATE } from '../constants.js';

function buildMobileScene(THREE, { scene }) {
  const ringGeo = new THREE.TorusGeometry(1.2, 0.015, 8, 64);
  const ringMat = new THREE.MeshStandardMaterial({
    color: 0x2962ff,
    emissive: 0x1a3a8a,
    emissiveIntensity: 0.5,
    transparent: true,
    opacity: 0.65,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = Math.PI * 0.35;
  scene.add(ring);

  const hubGeo = new THREE.SphereGeometry(0.08, 16, 16);
  const hubMat = new THREE.MeshStandardMaterial({
    color: 0x2962ff,
    emissive: 0x2962ff,
    emissiveIntensity: 0.6,
  });
  const hub = new THREE.Mesh(hubGeo, hubMat);
  scene.add(hub);

  const count = 50;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 1 + Math.random() * 0.4;
    positions[i * 3] = Math.cos(a) * r;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 0.4;
    positions[i * 3 + 2] = Math.sin(a) * r * 0.4;
  }
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const pMat = new THREE.PointsMaterial({
    color: 0x6699ff,
    size: 0.05,
    transparent: true,
    opacity: 0.6,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const particles = new THREE.Points(pGeo, pMat);
  scene.add(particles);

  let color = new THREE.Color(0x2962ff);
  let emissive = new THREE.Color(0x1a3a8a);

  return {
    update(dt, snap, elapsed) {
      const target = snapshotToVisual(snap);
      color.lerp(new THREE.Color(target.color), 0.1);
      emissive.lerp(new THREE.Color(target.emissive), 0.1);
      ringMat.color.copy(color);
      ringMat.emissive.copy(emissive);
      hubMat.color.copy(color);
      hubMat.emissive.copy(emissive);
      pMat.color.copy(color);

      const speed = target.particleSpeed ?? 0.4;
      const transferring = snap.state === CONNECTION_STATE.TRANSFERRING;
      const p = snap.progress ?? 0;
      ring.rotation.z += dt * speed * 0.2;
      particles.rotation.y += dt * speed * (transferring ? 0.3 + p * 0.5 : 0.15);
      hub.scale.setScalar(1 + Math.sin(elapsed * 2) * (transferring ? 0.12 + p * 0.08 : 0.08));
      ringMat.opacity = transferring ? 0.65 + p * 0.35 : 0.65;
    },
    dispose() {
      scene.remove(ring, hub, particles);
      ringGeo.dispose();
      ringMat.dispose();
      hubGeo.dispose();
      hubMat.dispose();
      pGeo.dispose();
      pMat.dispose();
    },
  };
}

export async function initMobileScene(container) {
  return createSceneManager(container, buildMobileScene);
}
