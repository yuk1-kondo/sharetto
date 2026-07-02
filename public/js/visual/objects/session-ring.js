import { CONNECTION_STATE } from '../../constants.js';

/**
 * Session Ring — セッションを表すトーラス + 漂う粒子
 */
export function createSessionRing(THREE, {
  particleCount = 280,
  tubularSegments = 128,
  glowSegments = 64,
} = {}) {
  const group = new THREE.Group();

  const ringGeo = new THREE.TorusGeometry(1.8, 0.018, 16, tubularSegments);
  const ringMat = new THREE.MeshStandardMaterial({
    color: 0x2962ff,
    emissive: 0x1a3a8a,
    emissiveIntensity: 0.6,
    metalness: 0.3,
    roughness: 0.4,
    transparent: true,
    opacity: 0.6,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = Math.PI * 0.38;
  group.add(ring);

  const glowGeo = new THREE.TorusGeometry(1.8, 0.06, 8, glowSegments);
  const glowMat = new THREE.MeshBasicMaterial({
    color: 0x2962ff,
    transparent: true,
    opacity: 0.08,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const glow = new THREE.Mesh(glowGeo, glowMat);
  glow.rotation.x = ring.rotation.x;
  group.add(glow);

  const count = particleCount;
  const positions = new Float32Array(count * 3);
  const angles = new Float32Array(count);
  const speeds = new Float32Array(count);
  const radii = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    angles[i] = Math.random() * Math.PI * 2;
    speeds[i] = 0.3 + Math.random() * 0.7;
    radii[i] = 1.5 + Math.random() * 0.8;
    const a = angles[i];
    const r = radii[i];
    positions[i * 3] = Math.cos(a) * r;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 0.6;
    positions[i * 3 + 2] = Math.sin(a) * r * 0.5;
  }

  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const pMat = new THREE.PointsMaterial({
    color: 0x6699ff,
    size: 0.04,
    transparent: true,
    opacity: 0.7,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const particles = new THREE.Points(pGeo, pMat);
  group.add(particles);

  let timerRatio = 1;

  return {
    group,
    ring,
    glow,
    particles,
    angles,
    speeds,
    radii,
    setTimerRatio(r) { timerRatio = Math.max(0, Math.min(1, r)); },
    update(dt, params, elapsed) {
      const breathe = 1 + Math.sin(elapsed * params.breathe) * 0.04;
      group.scale.setScalar(breathe);

      ring.rotation.z += dt * params.ringSpeed;
      glow.rotation.z = ring.rotation.z;
      ringMat.color.copy(params.color);
      ringMat.emissive.copy(params.emissive);
      ringMat.opacity = params.ringOpacity * (0.5 + timerRatio * 0.5);
      glowMat.color.copy(params.color);
      glowMat.opacity = 0.06 + params.ringOpacity * 0.06;

      pMat.color.copy(params.color);
      pMat.size = 0.03 + params.particleSpeed * 0.01;

      const pos = pGeo.attributes.position.array;
      const isTransfer = params.state === CONNECTION_STATE.TRANSFERRING
        || params.state === CONNECTION_STATE.COMPLETE;
      const pull = isTransfer ? 0.03 * params.particleSpeed * (0.5 + (params.progress ?? 0) * 0.5) : 0;

      for (let i = 0; i < count; i++) {
        angles[i] += dt * speeds[i] * params.particleSpeed * 0.3;
        const a = angles[i];
        const r = radii[i];
        const tx = Math.cos(a) * r;
        const ty = Math.sin(a * 2) * 0.15;
        const tz = Math.sin(a) * r * 0.5;
        const i3 = i * 3;
        pos[i3] += (tx - pos[i3]) * (0.02 + pull);
        pos[i3 + 1] += (ty - pos[i3 + 1]) * (0.02 + pull);
        pos[i3 + 2] += (tz - pos[i3 + 2]) * (0.02 + pull);
      }
      pGeo.attributes.position.needsUpdate = true;
    },
    dispose() {
      ringGeo.dispose();
      ringMat.dispose();
      glowGeo.dispose();
      glowMat.dispose();
      pGeo.dispose();
      pMat.dispose();
    },
  };
}
