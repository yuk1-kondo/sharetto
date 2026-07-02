import { orbitPosition } from '../orbit-math.js';

/**
 * Peer Node — 接続中のスマホ（八面体が軌道上を周回）
 */
export function createPeerNode(THREE) {
  const group = new THREE.Group();
  group.visible = false;

  const geo = new THREE.OctahedronGeometry(0.09, 0);
  const mat = new THREE.MeshStandardMaterial({
    color: 0x16a34a,
    emissive: 0x0d6b30,
    emissiveIntensity: 0.7,
    metalness: 0.5,
    roughness: 0.25,
  });
  const mesh = new THREE.Mesh(geo, mat);
  group.add(mesh);

  let angle = 0;

  return {
    group,
    setVisible(v) { group.visible = v; },
    update(dt, params) {
      if (!group.visible) return;
      angle += dt * 0.5;
      const pos = orbitPosition(angle);
      group.position.set(pos.x, pos.y, pos.z);
      mesh.rotation.x += dt * 1.2;
      mesh.rotation.y += dt * 0.8;
      mat.color.copy(params.color);
      mat.emissive.copy(params.emissive);
    },
    dispose() {
      geo.dispose();
      mat.dispose();
    },
  };
}
