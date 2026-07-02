/**
 * Looking Glass 風 3D デスクトップ
 * WebGL 背景 + CSS perspective でパネルを空間配置
 */
import { prefersReducedMotion } from './scene-manager.js';
import { initSharettoScene } from './sharetto-scene.js';

export async function initSpatialDesktop(rootEl) {
  const rig = document.getElementById('spatial-rig');
  const can3d = Boolean(
    rootEl && rig && !prefersReducedMotion() && window.innerWidth >= 768,
  );

  if (can3d) {
    document.body.classList.add('spatial-active');
  } else {
    document.body.classList.add('spatial-fallback');
  }

  const scene = rootEl
    ? await initSharettoScene(rootEl)
    : { destroy() {}, setTimerRatio() {} };

  if (!can3d) return scene;

  let destroyed = false;
  let raf = 0;
  let curX = 0;
  let curY = 0;
  let tgtX = 0;
  let tgtY = 0;

  const onMove = (e) => {
    tgtY = (e.clientX / window.innerWidth - 0.5) * 5;
    tgtX = -(e.clientY / window.innerHeight - 0.5) * 3;
  };
  window.addEventListener('mousemove', onMove, { passive: true });

  const tick = () => {
    if (destroyed) return;
    curX += (tgtX - curX) * 0.07;
    curY += (tgtY - curY) * 0.07;
    rig.style.transform = `rotateX(${curX}deg) rotateY(${curY}deg)`;
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  const origDestroy = scene.destroy?.bind(scene);
  return {
    setTimerRatio(r) { scene.setTimerRatio?.(r); },
    destroy() {
      destroyed = true;
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('mousemove', onMove);
      rig.style.transform = '';
      document.body.classList.remove('spatial-active');
      origDestroy?.();
    },
  };
}
