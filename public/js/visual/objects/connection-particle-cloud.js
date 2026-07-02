import { CONNECTION_STATE } from '../../constants.js';

function createDotTexture(THREE) {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.7, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

/**
 * 接続パネル用 — 楕円体状の粒子クラウドのみ（リングなし）
 */
export function createConnectionParticleCloud(THREE, { particleCount = 360 } = {}) {
  const group = new THREE.Group();
  const count = particleCount;

  const positions = new Float32Array(count * 3);
  const basePositions = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  const drift = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    const u = Math.random();
    const v = Math.random();
    const theta = Math.PI * 2 * u;
    const phi = Math.acos(2 * v - 1);
    const r = Math.cbrt(Math.random());
    const rx = 1.25 * r * Math.sin(phi) * Math.cos(theta);
    const ry = 0.62 * r * Math.sin(phi) * Math.sin(theta);
    const rz = 0.82 * r * Math.cos(phi);
    const i3 = i * 3;
    basePositions[i3] = rx;
    basePositions[i3 + 1] = ry;
    basePositions[i3 + 2] = rz;
    positions[i3] = rx;
    positions[i3 + 1] = ry;
    positions[i3 + 2] = rz;
    phases[i] = Math.random() * Math.PI * 2;
    drift[i] = 0.6 + Math.random() * 0.8;
  }

  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const texture = createDotTexture(THREE);
  const pMat = new THREE.PointsMaterial({
    map: texture,
    color: 0x3d5fcc,
    size: 16,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.95,
    alphaTest: 0.12,
    depthWrite: false,
    blending: THREE.NormalBlending,
  });

  const particles = new THREE.Points(pGeo, pMat);
  group.add(particles);
  group.rotation.x = 0.42;
  group.rotation.z = 0.12;

  let timerRatio = 1;

  return {
    group,
    setTimerRatio(r) { timerRatio = Math.max(0, Math.min(1, r)); },
    update(dt, params, elapsed) {
      const breathe = 1 + Math.sin(elapsed * params.breathe) * 0.045;
      group.scale.set(1.05 * breathe, 0.88 * breathe, 1.0 * breathe);

      pMat.color.copy(params.color);
      pMat.opacity = 0.82 + (params.opacity ?? 0.13) * (0.6 + timerRatio * 0.4);
      pMat.size = params.particleSize ?? 14;

      const spin = params.spinSpeed ?? 0.35;
      group.rotation.y += dt * spin;

      const transferring = params.state === CONNECTION_STATE.TRANSFERRING
        || params.state === CONNECTION_STATE.COMPLETE;
      const pull = transferring ? 0.018 * (params.progress ?? 0) : 0;
      const wobbleAmp = 0.035 + params.particleSpeed * 0.012;
      const pos = pGeo.attributes.position.array;

      for (let i = 0; i < count; i++) {
        const i3 = i * 3;
        const w = wobbleAmp * Math.sin(elapsed * drift[i] * 1.6 + phases[i]);
        const bx = basePositions[i3];
        const by = basePositions[i3 + 1];
        const bz = basePositions[i3 + 2];
        const tx = bx * (1 - pull);
        const ty = by * (1 - pull);
        const tz = bz * (1 - pull);
        pos[i3] = tx + w;
        pos[i3 + 1] = ty + w * 0.55;
        pos[i3 + 2] = tz + w * 0.75;
      }
      pGeo.attributes.position.needsUpdate = true;
    },
    dispose() {
      texture.dispose();
      pGeo.dispose();
      pMat.dispose();
    },
  };
}
