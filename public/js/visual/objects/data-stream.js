import { orbitPosition } from '../orbit-math.js';

/**
 * Data Stream — 転送中のインスタンス粒子（輪に沿って流れる）
 */
export function createDataStream(THREE, { count = 80 } = {}) {
  const group = new THREE.Group();
  group.visible = false;

  const geo = new THREE.SphereGeometry(0.025, 6, 6);
  const mat = new THREE.MeshBasicMaterial({
    color: 0xff8f00,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  group.add(mesh);

  const dummy = new THREE.Object3D();
  const phases = new Float32Array(count);
  const speeds = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    phases[i] = Math.random();
    speeds[i] = 0.5 + Math.random() * 0.5;
  }

  return {
    group,
    setVisible(v) { group.visible = v; },
    update(dt, params, progress) {
      if (!group.visible) return;
      mat.color.copy(params.color);

      for (let i = 0; i < count; i++) {
        phases[i] = (phases[i] + dt * speeds[i] * params.particleSpeed * 0.15) % 1;
        const t = (phases[i] + progress * 0.2) % 1;
        const angle = t * Math.PI * 2;
        const pos = orbitPosition(angle);
        dummy.position.set(pos.x, pos.y, pos.z);
        const s = 0.6 + progress * 0.8;
        dummy.scale.setScalar(s);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      geo.dispose();
      mat.dispose();
    },
  };
}
