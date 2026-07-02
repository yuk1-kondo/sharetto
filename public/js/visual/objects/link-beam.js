/**
 * Link Beam — Hub と Peer を結ぶ光の曲線チューブ
 */
export function createLinkBeam(THREE) {
  const group = new THREE.Group();
  group.visible = false;

  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0.6, 0.1, 0.2),
    new THREE.Vector3(1.2, 0.05, 0.4),
    new THREE.Vector3(1.8, 0, 0),
  ]);

  let tubeGeo = new THREE.TubeGeometry(curve, 24, 0.012, 8, false);
  const tubeMat = new THREE.MeshBasicMaterial({
    color: 0x22c55e,
    transparent: true,
    opacity: 0.5,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const tube = new THREE.Mesh(tubeGeo, tubeMat);
  group.add(tube);

  let pulsePhase = 0;
  let rebuildCooldown = 0;

  function rebuildTube() {
    tubeGeo.dispose();
    tubeGeo = new THREE.TubeGeometry(curve, 24, 0.012, 8, false);
    tube.geometry = tubeGeo;
  }

  return {
    group,
    setVisible(v) { group.visible = v; },
    updateEndPoint(x, y, z, dt = 0.016) {
      curve.points[0].set(0, 0, 0);
      curve.points[1].set(x * 0.33, y * 0.33 + 0.1, z * 0.33);
      curve.points[2].set(x * 0.66, y * 0.66 + 0.05, z * 0.66);
      curve.points[3].set(x, y, z);

      rebuildCooldown -= dt;
      if (rebuildCooldown <= 0) {
        rebuildCooldown = 0.1;
        rebuildTube();
      }
    },
    update(dt, params) {
      if (!group.visible) return;
      pulsePhase += dt;
      tubeMat.color.copy(params.color);
      tubeMat.opacity = 0.35 + Math.sin(pulsePhase * 4) * 0.15;
    },
    dispose() {
      tubeGeo.dispose();
      tubeMat.dispose();
    },
  };
}
