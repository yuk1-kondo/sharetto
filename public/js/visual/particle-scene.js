/**
 * Three.js パーティクル演出 — 接続状態に連動
 * 転送ロジックとは独立したビジュアルレイヤー
 */
import { subscribeConnectionState } from '../connection-state.js';
import { CONNECTION_STATE } from '../constants.js';

const STATE_COLORS = {
  [CONNECTION_STATE.IDLE]: 0x2962ff,
  [CONNECTION_STATE.WAITING]: 0x2962ff,
  [CONNECTION_STATE.CONNECTING]: 0xffb300,
  [CONNECTION_STATE.CONNECTED]: 0x16a34a,
  [CONNECTION_STATE.TRANSFERRING]: 0xff8f00,
  [CONNECTION_STATE.COMPLETE]: 0xffd700,
  [CONNECTION_STATE.FAILED]: 0xef4444,
};

export async function initParticleScene(container) {
  if (!container) return { destroy() {} };

  let destroyed = false;
  let THREE;
  try {
    THREE = await import('https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js');
  } catch (e) {
    console.warn('[visual] Three.js load failed', e);
    return { destroy() {} };
  }

  const width = container.clientWidth || 320;
  const height = container.clientHeight || 200;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 100);
  camera.position.z = 4;

  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);

  const count = 420;
  const positions = new Float32Array(count * 3);
  const velocities = [];
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 3;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 2;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 1.5;
    velocities.push({
      x: (Math.random() - 0.5) * 0.01,
      y: (Math.random() - 0.5) * 0.01,
      z: (Math.random() - 0.5) * 0.005,
    });
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color: STATE_COLORS.waiting,
    size: 0.06,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geometry, material);
  scene.add(points);

  let targetColor = new THREE.Color(STATE_COLORS.waiting);
  let speed = 0.4;
  let pulse = 0;
  let progress = 0;

  const unsub = subscribeConnectionState((snap) => {
    const c = STATE_COLORS[snap.state] ?? STATE_COLORS.waiting;
    targetColor = new THREE.Color(c);
    progress = snap.progress || 0;
    switch (snap.state) {
      case CONNECTION_STATE.WAITING:
        speed = 0.35;
        material.size = 0.06;
        break;
      case CONNECTION_STATE.CONNECTING:
        speed = 1.2;
        material.size = 0.08;
        break;
      case CONNECTION_STATE.TRANSFERRING:
        speed = 2.5 + progress * 2;
        material.size = 0.1;
        break;
      case CONNECTION_STATE.COMPLETE:
        speed = 3.5;
        material.size = 0.12;
        pulse = 1;
        break;
      case CONNECTION_STATE.FAILED:
        speed = 0.2;
        material.size = 0.05;
        break;
      default:
        speed = 0.5;
    }
  });

  let raf = 0;
  const clock = new THREE.Clock();

  function animate() {
    if (destroyed) return;
    raf = requestAnimationFrame(animate);
    const dt = clock.getDelta();
    const pos = geometry.attributes.position.array;

    material.color.lerp(targetColor, 0.08);
    points.rotation.z += dt * speed * 0.15;

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      const v = velocities[i];
      pos[i3] += v.x * speed;
      pos[i3 + 1] += v.y * speed;
      pos[i3 + 2] += v.z * speed;

      if (snapTransferring()) {
        pos[i3] += (0 - pos[i3]) * 0.02 * speed;
        pos[i3 + 1] += (0 - pos[i3 + 1]) * 0.02 * speed;
      }

      if (Math.abs(pos[i3]) > 2) v.x *= -1;
      if (Math.abs(pos[i3 + 1]) > 1.2) v.y *= -1;
    }

    if (pulse > 0) {
      material.size = 0.12 + Math.sin(clock.elapsedTime * 8) * 0.03;
      pulse -= dt * 0.5;
    }

    geometry.attributes.position.needsUpdate = true;
    renderer.render(scene, camera);
  }

  let transferring = false;
  function snapTransferring() { return transferring; }
  subscribeConnectionState((s) => { transferring = s.state === CONNECTION_STATE.TRANSFERRING; });

  animate();

  const onResize = () => {
    const w = container.clientWidth || 320;
    const h = container.clientHeight || 200;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  };
  window.addEventListener('resize', onResize);

  return {
    destroy() {
      destroyed = true;
      cancelAnimationFrame(raf);
      unsub();
      window.removeEventListener('resize', onResize);
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
