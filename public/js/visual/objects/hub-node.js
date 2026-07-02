/**
 * Hub Node — PC 受信ハブ（中央の球 + リング）
 */
export function createHubNode(THREE) {
  const group = new THREE.Group();

  const coreGeo = new THREE.SphereGeometry(0.12, 32, 32);
  const coreMat = new THREE.MeshStandardMaterial({
    color: 0x2962ff,
    emissive: 0x1a3a8a,
    emissiveIntensity: 0.8,
    metalness: 0.4,
    roughness: 0.3,
  });
  const core = new THREE.Mesh(coreGeo, coreMat);
  group.add(core);

  const ringGeo = new THREE.TorusGeometry(0.22, 0.008, 8, 48);
  const ringMat = new THREE.MeshStandardMaterial({
    color: 0x6699ff,
    emissive: 0x2962ff,
    emissiveIntensity: 0.5,
    transparent: true,
    opacity: 0.8,
  });
  const orbitRing = new THREE.Mesh(ringGeo, ringMat);
  orbitRing.rotation.x = Math.PI / 2;
  group.add(orbitRing);

  const glowGeo = new THREE.SphereGeometry(0.18, 16, 16);
  const glowMat = new THREE.MeshBasicMaterial({
    color: 0x6699ff,
    transparent: true,
    opacity: 0.12,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const glow = new THREE.Mesh(glowGeo, glowMat);
  group.add(glow);

  return {
    group,
    update(dt, params, elapsed, intensity = 1) {
      const pulse = 1 + Math.sin(elapsed * 2) * 0.06 * intensity;
      core.scale.setScalar(pulse);
      coreMat.color.copy(params.color);
      coreMat.emissive.copy(params.emissive);
      ringMat.color.copy(params.color);
      glowMat.color.copy(params.color);
      glowMat.opacity = 0.08 + intensity * 0.1;
      orbitRing.rotation.z += dt * 0.8;
    },
    dispose() {
      coreGeo.dispose();
      coreMat.dispose();
      ringGeo.dispose();
      ringMat.dispose();
      glowGeo.dispose();
      glowMat.dispose();
    },
  };
}
