/**
 * Three.js シーンのライフサイクル管理
 */
import { subscribeConnectionState, getConnectionSnapshot } from '../connection-state.js';
import { snapshotToVisual } from './state-bridge.js';

const THREE_CDN = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

let threePromise = null;

export function loadThree() {
  if (!threePromise) {
    threePromise = import(THREE_CDN).catch((e) => {
      threePromise = null;
      throw e;
    });
  }
  return threePromise;
}

export function prefersReducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
}

/**
 * @param {HTMLElement} container
 * @param {(THREE: object, opts: object) => { update: Function, dispose: Function, setTimerRatio?: Function }} buildScene
 */
export async function createSceneManager(container, buildScene) {
  if (!container || prefersReducedMotion()) {
    return { destroy() {}, setTimerRatio() {} };
  }

  let THREE;
  try {
    THREE = await loadThree();
  } catch (e) {
    console.warn('[visual] Three.js load failed', e);
    return { destroy() {}, setTimerRatio() {} };
  }

  let destroyed = false;
  let visible = !document.hidden;
  let raf = 0;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
  } catch (e) {
    console.warn('[visual] WebGL unavailable', e);
    return { destroy() {}, setTimerRatio() {} };
  }

  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0xe8ecf4, 0.12);

  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  camera.position.set(0, 0.3, 5.5);
  camera.lookAt(0, 0, 0);

  const lights = [];
  scene.add(new THREE.AmbientLight(0xffffff, 0.5));
  const keyLight = new THREE.DirectionalLight(0xffffff, 0.8);
  keyLight.position.set(2, 3, 4);
  scene.add(keyLight);
  lights.push(keyLight);
  const fillLight = new THREE.PointLight(0x6699ff, 0.4, 20);
  fillLight.position.set(-3, -1, 2);
  scene.add(fillLight);
  lights.push(fillLight);

  const visual = buildScene(THREE, { scene, camera, renderer });
  const clock = new THREE.Clock();

  let snap = snapshotToVisual(getConnectionSnapshot());
  const unsub = subscribeConnectionState((s) => { snap = snapshotToVisual(s); });

  function resize() {
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  }
  resize();
  window.addEventListener('resize', resize);

  function startLoop() {
    if (destroyed || raf) return;
    raf = requestAnimationFrame(animate);
  }

  function stopLoop() {
    if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  }

  const onVis = () => {
    visible = !document.hidden;
    if (visible) startLoop();
    else stopLoop();
  };
  document.addEventListener('visibilitychange', onVis);

  function animate() {
    if (destroyed) return;
    raf = 0;
    if (!visible) return;
    const dt = Math.min(clock.getDelta(), 0.05);
    visual.update?.(dt, snap, clock.elapsedTime);
    renderer.render(scene, camera);
    raf = requestAnimationFrame(animate);
  }
  startLoop();

  return {
    setTimerRatio(r) { visual.setTimerRatio?.(r); },
    destroy() {
      destroyed = true;
      stopLoop();
      unsub();
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVis);
      visual.dispose?.();
      lights.forEach((l) => scene.remove(l));
      scene.fog = null;
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
