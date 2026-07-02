/**
 * 接続状態パネル用ミニオービタル（粒子クラウドのみ）
 * ベージュ UI 向けライトテーマ色
 */
import { loadThree, prefersReducedMotion } from './scene-manager.js';
import { createConnectionParticleCloud } from './objects/connection-particle-cloud.js';
import { subscribeConnectionState, getConnectionSnapshot } from '../connection-state.js';
import { CONNECTION_STATE } from '../constants.js';

/** 明るい背景でくっきり見える色 */
const LIGHT_VISUAL = {
  [CONNECTION_STATE.IDLE]: {
    color: 0x4a6fd4, spinSpeed: 0.28, particleSpeed: 0.3, particleSize: 14, opacity: 0.15, breathe: 0.4,
  },
  [CONNECTION_STATE.WAITING]: {
    color: 0x3d5fcc, spinSpeed: 0.38, particleSpeed: 0.38, particleSize: 15, opacity: 0.2, breathe: 0.5,
  },
  [CONNECTION_STATE.CONNECTING]: {
    color: 0xc4684a, spinSpeed: 0.65, particleSpeed: 1.0, particleSize: 16, opacity: 0.22, breathe: 1.0,
  },
  [CONNECTION_STATE.CONNECTED]: {
    color: 0x3a9e58, spinSpeed: 0.45, particleSpeed: 0.48, particleSize: 15, opacity: 0.18, breathe: 0.55,
  },
  [CONNECTION_STATE.TRANSFERRING]: {
    color: 0xd4883a, spinSpeed: 0.9, particleSpeed: 2.2, particleSize: 17, opacity: 0.25, breathe: 1.8,
  },
  [CONNECTION_STATE.COMPLETE]: {
    color: 0xc4684a, spinSpeed: 1.2, particleSpeed: 2.8, particleSize: 18, opacity: 0.28, breathe: 2.2,
  },
  [CONNECTION_STATE.FAILED]: {
    color: 0xb83838, spinSpeed: 0.12, particleSpeed: 0.12, particleSize: 13, opacity: 0.1, breathe: 0.2,
  },
};

function snapshotToLightVisual(snap) {
  const base = LIGHT_VISUAL[snap.state] ?? LIGHT_VISUAL[CONNECTION_STATE.WAITING];
  return { ...base, state: snap.state, progress: snap.progress ?? 0 };
}

export async function initConnectionVisual(container) {
  if (!container || prefersReducedMotion()) {
    container?.classList.add('connection-visual--static');
    return { destroy() {}, setTimerRatio() {} };
  }

  let THREE;
  try {
    THREE = await loadThree();
  } catch (e) {
    console.warn('[connection-visual] Three.js unavailable', e);
    container.classList.add('connection-visual--static');
    return { destroy() {}, setTimerRatio() {} };
  }

  let destroyed = false;
  let visible = !document.hidden;
  let raf = 0;

  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 50);
  camera.position.set(0, 0.1, 3.4);
  camera.lookAt(0, 0, 0);

  const cloud = createConnectionParticleCloud(THREE, { particleCount: 380 });
  scene.add(cloud.group);

  let snap = snapshotToLightVisual(getConnectionSnapshot());
  const unsub = subscribeConnectionState((s) => { snap = snapshotToLightVisual(s); });

  const currentColor = new THREE.Color(snap.color);
  const targetColor = new THREE.Color();
  let params = { ...snap, color: currentColor };

  function resize() {
    const w = container.clientWidth || 300;
    const h = container.clientHeight || 100;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  }
  resize();
  window.addEventListener('resize', resize);

  const clock = new THREE.Clock();

  function startLoop() {
    if (destroyed || raf) return;
    raf = requestAnimationFrame(animate);
  }
  function stopLoop() {
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
  }
  document.addEventListener('visibilitychange', () => {
    visible = !document.hidden;
    if (visible) startLoop();
    else stopLoop();
  });

  function animate() {
    if (destroyed) return;
    raf = 0;
    if (!visible) return;

    const dt = Math.min(clock.getDelta(), 0.05);
    const elapsed = clock.elapsedTime;

    targetColor.set(snap.color);
    currentColor.lerp(targetColor, 0.08);
    params = {
      color: currentColor,
      spinSpeed: params.spinSpeed + (snap.spinSpeed - params.spinSpeed) * 0.08,
      particleSpeed: params.particleSpeed + (snap.particleSpeed - params.particleSpeed) * 0.08,
      particleSize: params.particleSize + (snap.particleSize - params.particleSize) * 0.08,
      opacity: params.opacity + (snap.opacity - params.opacity) * 0.08,
      breathe: params.breathe + (snap.breathe - params.breathe) * 0.08,
      state: snap.state,
      progress: params.progress + (snap.progress - params.progress) * 0.15,
    };

    cloud.update(dt, params, elapsed);
    renderer.render(scene, camera);
    raf = requestAnimationFrame(animate);
  }
  startLoop();

  return {
    setTimerRatio(r) { cloud.setTimerRatio(r); },
    destroy() {
      destroyed = true;
      stopLoop();
      unsub();
      window.removeEventListener('resize', resize);
      cloud.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
