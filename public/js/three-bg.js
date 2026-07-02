/**
 * Sharetto — Three.js immersive background
 * Floating particle network with mouse parallax and glow accents.
 */
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';

const COLORS = {
  particle: 0x7dd3fc,
  particleAlt: 0xffb300,
  line: 0x38bdf8,
};

export function initThreeBackground(options = {}) {
  const rootId = options.rootId || 'three-bg-root';
  const root = document.getElementById(rootId);
  if (!root) return null;

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    root.classList.add('three-bg-static');
    return null;
  }

  const isMobile = window.matchMedia('(max-width: 768px)').matches;
  const particleCount = isMobile ? 220 : 480;
  const connectDistance = isMobile ? 90 : 115;
  const connectDistSq = connectDistance * connectDistance;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x050816, 0.035);

  const camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    1,
    2000
  );
  camera.position.z = 420;

  const renderer = new THREE.WebGLRenderer({
    antialias: !isMobile,
    alpha: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.5 : 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x000000, 0);
  root.appendChild(renderer.domElement);

  // Particle field
  const positions = new Float32Array(particleCount * 3);
  const velocities = [];
  const spread = isMobile ? 520 : 680;

  for (let i = 0; i < particleCount; i++) {
    positions[i * 3] = (Math.random() - 0.5) * spread;
    positions[i * 3 + 1] = (Math.random() - 0.5) * spread;
    positions[i * 3 + 2] = (Math.random() - 0.5) * spread * 0.6;
    velocities.push({
      x: (Math.random() - 0.5) * 0.35,
      y: (Math.random() - 0.5) * 0.35,
      z: (Math.random() - 0.5) * 0.2,
    });
  }

  const particleGeo = new THREE.BufferGeometry();
  particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const particleMat = new THREE.PointsMaterial({
    size: isMobile ? 2.2 : 2.8,
    color: COLORS.particle,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });

  const particles = new THREE.Points(particleGeo, particleMat);
  scene.add(particles);

  // Accent orbs (larger glowing spheres)
  const orbGroup = new THREE.Group();
  const orbColors = [0xffb300, 0x00f2fe, 0xa78bfa, 0x34d399];
  const orbCount = isMobile ? 4 : 7;
  for (let i = 0; i < orbCount; i++) {
    const geo = new THREE.SphereGeometry(isMobile ? 18 : 24, 16, 16);
    const mat = new THREE.MeshBasicMaterial({
      color: orbColors[i % orbColors.length],
      transparent: true,
      opacity: 0.12,
    });
    const orb = new THREE.Mesh(geo, mat);
    orb.position.set(
      (Math.random() - 0.5) * spread * 0.8,
      (Math.random() - 0.5) * spread * 0.6,
      (Math.random() - 0.5) * 200
    );
    orb.userData = {
      phase: Math.random() * Math.PI * 2,
      speed: 0.3 + Math.random() * 0.5,
      amp: 20 + Math.random() * 40,
    };
    orbGroup.add(orb);
  }
  scene.add(orbGroup);

  // Connection lines (spatial grid for performance)
  const maxLineVerts = particleCount * 12;
  const linePositions = new Float32Array(maxLineVerts * 3);
  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.BufferAttribute(linePositions, 3).setUsage(THREE.DynamicDrawUsage));
  const lineMat = new THREE.LineBasicMaterial({
    color: COLORS.line,
    transparent: true,
    opacity: 0.14,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const lines = new THREE.LineSegments(lineGeo, lineMat);
  scene.add(lines);

  // Torus knot accent (subtle wireframe)
  const knotGeo = new THREE.TorusKnotGeometry(isMobile ? 60 : 90, 2.5, 120, 16);
  const knotMat = new THREE.MeshBasicMaterial({
    color: 0xffb300,
    wireframe: true,
    transparent: true,
    opacity: 0.06,
  });
  const knot = new THREE.Mesh(knotGeo, knotMat);
  knot.position.set(-180, 80, -120);
  scene.add(knot);

  const mouse = { x: 0, y: 0, targetX: 0, targetY: 0 };
  const onPointerMove = (e) => {
    mouse.targetX = (e.clientX / window.innerWidth - 0.5) * 2;
    mouse.targetY = (e.clientY / window.innerHeight - 0.5) * 2;
  };
  window.addEventListener('pointermove', onPointerMove, { passive: true });

  let running = true;
  const onVisibility = () => { running = !document.hidden; };
  document.addEventListener('visibilitychange', onVisibility);

  const clock = new THREE.Clock();
  let lineVertex = 0;

  function updateConnections() {
    lineVertex = 0;
    const pos = particleGeo.attributes.position.array;
    const cellSize = connectDistance;
    const grid = new Map();

    for (let i = 0; i < particleCount; i++) {
      const cx = Math.floor(pos[i * 3] / cellSize);
      const cy = Math.floor(pos[i * 3 + 1] / cellSize);
      const key = `${cx},${cy}`;
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push(i);
    }

    const tryLink = (i, j) => {
      if (lineVertex >= maxLineVerts - 1) return;
      const dx = pos[i * 3] - pos[j * 3];
      const dy = pos[i * 3 + 1] - pos[j * 3 + 1];
      const dz = pos[i * 3 + 2] - pos[j * 3 + 2];
      if (dx * dx + dy * dy + dz * dz < connectDistSq) {
        linePositions[lineVertex * 3] = pos[i * 3];
        linePositions[lineVertex * 3 + 1] = pos[i * 3 + 1];
        linePositions[lineVertex * 3 + 2] = pos[i * 3 + 2];
        lineVertex++;
        linePositions[lineVertex * 3] = pos[j * 3];
        linePositions[lineVertex * 3 + 1] = pos[j * 3 + 1];
        linePositions[lineVertex * 3 + 2] = pos[j * 3 + 2];
        lineVertex++;
      }
    };

    for (const [key, indices] of grid) {
      const [cx, cy] = key.split(',').map(Number);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const neighbor = grid.get(`${cx + dx},${cy + dy}`);
          if (!neighbor) continue;
          for (const i of indices) {
            for (const j of neighbor) {
              if (i >= j) continue;
              tryLink(i, j);
            }
          }
        }
      }
    }

    lineGeo.setDrawRange(0, lineVertex);
    lineGeo.attributes.position.needsUpdate = true;
  }

  function animate() {
    requestAnimationFrame(animate);
    if (!running) return;

    const t = clock.getElapsedTime();
    mouse.x += (mouse.targetX - mouse.x) * 0.04;
    mouse.y += (mouse.targetY - mouse.y) * 0.04;

    const pos = particleGeo.attributes.position.array;
    for (let i = 0; i < particleCount; i++) {
      pos[i * 3] += velocities[i].x;
      pos[i * 3 + 1] += velocities[i].y;
      pos[i * 3 + 2] += velocities[i].z;

      const limit = spread * 0.55;
      if (Math.abs(pos[i * 3]) > limit) velocities[i].x *= -1;
      if (Math.abs(pos[i * 3 + 1]) > limit) velocities[i].y *= -1;
      if (Math.abs(pos[i * 3 + 2]) > limit * 0.5) velocities[i].z *= -1;

      pos[i * 3] += Math.sin(t * 0.4 + i * 0.02) * 0.08;
      pos[i * 3 + 1] += Math.cos(t * 0.35 + i * 0.015) * 0.08;
    }
    particleGeo.attributes.position.needsUpdate = true;

    updateConnections();

    particles.rotation.y = t * 0.025 + mouse.x * 0.08;
    particles.rotation.x = mouse.y * 0.05;
    knot.rotation.x = t * 0.12;
    knot.rotation.y = t * 0.18;

    orbGroup.children.forEach((orb, idx) => {
      const { phase, speed, amp } = orb.userData;
      orb.position.y += Math.sin(t * speed + phase) * 0.15;
      orb.position.x += Math.cos(t * speed * 0.7 + phase) * 0.1;
      orb.material.opacity = 0.08 + Math.sin(t + idx) * 0.04;
    });

    camera.position.x = mouse.x * 35;
    camera.position.y = -mouse.y * 25;
    camera.lookAt(0, 0, 0);

    renderer.render(scene, camera);
  }

  animate();

  const onResize = () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  };
  window.addEventListener('resize', onResize);

  return {
    destroy() {
      running = false;
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibility);
      renderer.dispose();
      root.removeChild(renderer.domElement);
    },
  };
}
