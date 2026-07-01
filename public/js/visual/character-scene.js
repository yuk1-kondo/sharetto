/**
 * Three.js ポリゴンキャラクター — ファイル転送演出 + ドラッグ操作
 * 接続状態に連動し、転送中はファイルキューブがキャラに届く演出
 */
import { subscribeConnectionState } from '../connection-state.js';
import { CONNECTION_STATE } from '../constants.js';

const STATE_COLORS = {
  [CONNECTION_STATE.IDLE]: 0x2962ff,
  [CONNECTION_STATE.WAITING]: 0x2962ff,
  [CONNECTION_STATE.CONNECTING]: 0xffb300,
  [CONNECTION_STATE.CONNECTED]: 0x16a34a,
  [CONNECTION_STATE.TRANSFERRING]: 0xff8f00,
  [CONNECTION_STATE.COMPLETE]: 0xffd700,
  [CONNECTION_STATE.FAILED]: 0xef4444,
};

const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function createLowPolyCharacter(THREE, accentColor) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: accentColor });
  const limbMat = new THREE.MeshLambertMaterial({ color: 0x1e40af });
  const faceMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const eyeMat = new THREE.MeshLambertMaterial({ color: 0x111827 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.65, 0.35), bodyMat);
  body.position.y = 0.05;
  body.name = 'body';
  group.add(body);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.38, 0.32), bodyMat);
  head.position.y = 0.58;
  head.name = 'head';
  group.add(head);

  const eyeGeo = new THREE.BoxGeometry(0.08, 0.08, 0.04);
  const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
  eyeL.position.set(-0.1, 0.62, 0.17);
  const eyeR = eyeL.clone();
  eyeR.position.x = 0.1;
  group.add(eyeL, eyeR);

  const smile = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.04, 0.04), eyeMat);
  smile.position.set(0, 0.48, 0.17);
  group.add(smile);

  const armGeo = new THREE.BoxGeometry(0.14, 0.42, 0.14);
  const armL = new THREE.Mesh(armGeo, limbMat);
  armL.position.set(-0.38, 0.12, 0);
  armL.name = 'armL';
  const armR = armL.clone();
  armR.position.x = 0.38;
  armR.name = 'armR';
  group.add(armL, armR);

  const legGeo = new THREE.BoxGeometry(0.16, 0.38, 0.16);
  const legL = new THREE.Mesh(legGeo, limbMat);
  legL.position.set(-0.16, -0.42, 0);
  legL.name = 'legL';
  const legR = legL.clone();
  legR.position.x = 0.16;
  legR.name = 'legR';
  group.add(legL, legR);

  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.28, 6), faceMat);
  antenna.position.set(0, 0.88, 0);
  antenna.name = 'antenna';
  group.add(antenna);

  const antennaTip = new THREE.Mesh(new THREE.OctahedronGeometry(0.08, 0), new THREE.MeshLambertMaterial({ color: 0xffd700 }));
  antennaTip.position.set(0, 1.05, 0);
  antennaTip.name = 'antennaTip';
  group.add(antennaTip);

  group.userData.materials = [bodyMat, limbMat, faceMat, eyeMat, antennaTip.material];
  return group;
}

function spawnFileCube(THREE, scene, targetPos) {
  const geo = new THREE.BoxGeometry(0.18, 0.18, 0.18);
  const mat = new THREE.MeshLambertMaterial({
    color: new THREE.Color().setHSL(0.12 + Math.random() * 0.08, 0.85, 0.55),
  });
  const cube = new THREE.Mesh(geo, mat);
  cube.position.set(2.2 + Math.random() * 0.4, (Math.random() - 0.5) * 1.2, 0.3);
  cube.userData = {
    phase: 'incoming',
    target: targetPos.clone(),
    speed: 1.2 + Math.random() * 0.8,
    rotSpeed: (Math.random() - 0.5) * 4,
  };
  scene.add(cube);
  return cube;
}

export async function initCharacterScene(container) {
  if (!container) return { destroy() {} };
  if (REDUCED_MOTION) {
    container.innerHTML = '<div class="visual-fallback" aria-hidden="true">📦 転送準備中</div>';
    return { destroy() { container.innerHTML = ''; } };
  }

  let destroyed = false;
  let THREE;
  try {
    THREE = await import('https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js');
  } catch (e) {
    console.warn('[visual] Three.js load failed', e);
    return { destroy() {} };
  }

  const width = container.clientWidth || 360;
  const height = container.clientHeight || 280;

  const scene = new THREE.Scene();
  scene.background = null;

  const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 100);
  camera.position.set(0, 0.2, 4.2);
  camera.lookAt(0, 0, 0);

  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.domElement.style.touchAction = 'none';
  container.appendChild(renderer.domElement);

  scene.add(new THREE.AmbientLight(0xffffff, 0.65));
  const keyLight = new THREE.DirectionalLight(0xffffff, 0.85);
  keyLight.position.set(2, 4, 3);
  scene.add(keyLight);
  const fillLight = new THREE.DirectionalLight(0x93c5fd, 0.35);
  fillLight.position.set(-3, 1, 2);
  scene.add(fillLight);

  const character = createLowPolyCharacter(THREE, STATE_COLORS.waiting);
  character.position.set(0, -0.15, 0);
  scene.add(character);

  const dragPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const hitPoint = new THREE.Vector3();
  let isDragging = false;
  let dragOffset = new THREE.Vector3();
  let userMoved = false;

  const bounds = { x: 1.6, y: 1.1 };

  const bgCount = 80;
  const bgGeo = new THREE.BufferGeometry();
  const bgPos = new Float32Array(bgCount * 3);
  for (let i = 0; i < bgCount; i++) {
    bgPos[i * 3] = (Math.random() - 0.5) * 5;
    bgPos[i * 3 + 1] = (Math.random() - 0.5) * 3;
    bgPos[i * 3 + 2] = (Math.random() - 0.5) * 2 - 1;
  }
  bgGeo.setAttribute('position', new THREE.BufferAttribute(bgPos, 3));
  const bgMat = new THREE.PointsMaterial({
    color: 0x93c5fd,
    size: 0.04,
    transparent: true,
    opacity: 0.5,
  });
  const bgPoints = new THREE.Points(bgGeo, bgMat);
  scene.add(bgPoints);

  let connState = CONNECTION_STATE.WAITING;
  let progress = 0;
  let targetAccent = new THREE.Color(STATE_COLORS.waiting);
  const fileCubes = [];
  let spawnTimer = 0;
  let celebrate = 0;

  const unsub = subscribeConnectionState((snap) => {
    connState = snap.state;
    progress = snap.progress || 0;
    targetAccent = new THREE.Color(STATE_COLORS[snap.state] ?? STATE_COLORS.waiting);
    if (snap.state === CONNECTION_STATE.COMPLETE) celebrate = 2.5;
  });

  function clampCharacter() {
    character.position.x = THREE.MathUtils.clamp(character.position.x, -bounds.x, bounds.x);
    character.position.y = THREE.MathUtils.clamp(character.position.y, -bounds.y, bounds.y);
  }

  function setPointer(e) {
    const rect = renderer.domElement.getBoundingClientRect();
    const cx = e.clientX ?? e.touches?.[0]?.clientX;
    const cy = e.clientY ?? e.touches?.[0]?.clientY;
    pointer.x = ((cx - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((cy - rect.top) / rect.height) * 2 + 1;
  }

  function pickCharacter() {
    raycaster.setFromCamera(pointer, camera);
    return raycaster.intersectObject(character, true);
  }

  function onPointerDown(e) {
    setPointer(e);
    const hits = pickCharacter();
    if (hits.length) {
      isDragging = true;
      userMoved = true;
      raycaster.ray.intersectPlane(dragPlane, hitPoint);
      dragOffset.copy(character.position).sub(hitPoint);
      renderer.domElement.setPointerCapture(e.pointerId);
    }
  }

  function onPointerMove(e) {
    setPointer(e);
    if (!isDragging) return;
    raycaster.setFromCamera(pointer, camera);
    if (raycaster.ray.intersectPlane(dragPlane, hitPoint)) {
      character.position.copy(hitPoint).add(dragOffset);
      clampCharacter();
    }
  }

  function onPointerUp(e) {
    isDragging = false;
    try { renderer.domElement.releasePointerCapture(e.pointerId); } catch { /* noop */ }
  }

  renderer.domElement.addEventListener('pointerdown', onPointerDown);
  renderer.domElement.addEventListener('pointermove', onPointerMove);
  renderer.domElement.addEventListener('pointerup', onPointerUp);
  renderer.domElement.addEventListener('pointercancel', onPointerUp);

  let raf = 0;
  const clock = new THREE.Clock();

  function animateCharacter(t, dt) {
    const body = character.getObjectByName('body');
    const head = character.getObjectByName('head');
    const armL = character.getObjectByName('armL');
    const armR = character.getObjectByName('armR');
    const legL = character.getObjectByName('legL');
    const legR = character.getObjectByName('legR');
    const antennaTip = character.getObjectByName('antennaTip');

    const bob = Math.sin(t * 2.2) * 0.04;
    const transferring = connState === CONNECTION_STATE.TRANSFERRING;
    const connecting = connState === CONNECTION_STATE.CONNECTING;

    if (!isDragging) {
      if (!userMoved) character.position.x = Math.sin(t * 0.6) * 0.25;
      character.position.y = -0.15 + bob + (celebrate > 0 ? Math.abs(Math.sin(t * 10)) * 0.15 : 0);
    }

    if (body?.material) body.material.color.lerp(targetAccent, 0.06);
    if (head?.material) head.material.color.lerp(targetAccent, 0.06);

    const runPhase = t * (transferring ? 8 + progress * 6 : 2);
    if (armL) armL.rotation.x = transferring ? Math.sin(runPhase) * 0.7 : Math.sin(t * 1.5) * 0.15;
    if (armR) armR.rotation.x = transferring ? -Math.sin(runPhase) * 0.7 : -Math.sin(t * 1.5) * 0.15;
    if (legL) legL.rotation.x = transferring ? Math.sin(runPhase) * 0.45 : 0;
    if (legR) legR.rotation.x = transferring ? -Math.sin(runPhase) * 0.45 : 0;

    if (antennaTip) {
      antennaTip.rotation.y += dt * (connecting ? 6 : transferring ? 4 : 1.5);
      antennaTip.rotation.z = Math.sin(t * 3) * 0.2;
    }

    character.rotation.z = isDragging ? 0 : Math.sin(t * 0.8) * 0.04;
    if (celebrate > 0) {
      character.rotation.y = Math.sin(t * 6) * 0.3;
      celebrate -= dt;
    } else if (!isDragging) {
      character.rotation.y = Math.sin(t * 0.5) * 0.08;
    }
  }

  function updateFileCubes(dt) {
    if (connState !== CONNECTION_STATE.TRANSFERRING && connState !== CONNECTION_STATE.COMPLETE) {
      while (fileCubes.length) {
        const c = fileCubes.pop();
        scene.remove(c);
        c.geometry.dispose();
        c.material.dispose();
      }
      return;
    }

    spawnTimer -= dt;
    if (spawnTimer <= 0 && fileCubes.length < 12) {
      fileCubes.push(spawnFileCube(THREE, scene, character.position));
      spawnTimer = 0.35 - progress * 0.15;
    }

    for (let i = fileCubes.length - 1; i >= 0; i--) {
      const cube = fileCubes[i];
      const ud = cube.userData;
      cube.rotation.x += ud.rotSpeed * dt;
      cube.rotation.y += ud.rotSpeed * dt * 0.7;

      if (ud.phase === 'incoming') {
        cube.position.lerp(ud.target, dt * ud.speed);
        if (cube.position.distanceTo(ud.target) < 0.12) {
          ud.phase = 'delivering';
          ud.target.set(-2.3, -0.1 + Math.random() * 0.3, 0);
        }
      } else {
        cube.position.lerp(ud.target, dt * ud.speed * 1.4);
        if (cube.position.distanceTo(ud.target) < 0.1) {
          scene.remove(cube);
          cube.geometry.dispose();
          cube.material.dispose();
          fileCubes.splice(i, 1);
        }
      }
    }
  }

  function animate() {
    if (destroyed) return;
    raf = requestAnimationFrame(animate);
    const dt = clock.getDelta();
    const t = clock.elapsedTime;

    animateCharacter(t, dt);
    updateFileCubes(dt);

    bgMat.color.lerp(targetAccent, 0.04);
    bgPoints.rotation.z += dt * (connState === CONNECTION_STATE.TRANSFERRING ? 0.4 : 0.08);
    const bgArr = bgGeo.attributes.position.array;
    for (let i = 0; i < bgCount; i++) {
      const i3 = i * 3;
      bgArr[i3 + 1] += Math.sin(t + i) * 0.0008 * (connState === CONNECTION_STATE.TRANSFERRING ? 4 : 1);
    }
    bgGeo.attributes.position.needsUpdate = true;

    renderer.render(scene, camera);
  }

  animate();

  const onResize = () => {
    const w = container.clientWidth || 360;
    const h = container.clientHeight || 280;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  };
  window.addEventListener('resize', onResize);

  return {
    destroy() {
      destroyed = true;
      cancelAnimationFrame(raf);
      unsub();
      window.removeEventListener('resize', onResize);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('pointercancel', onPointerUp);
      fileCubes.forEach((c) => {
        scene.remove(c);
        c.geometry.dispose();
        c.material.dispose();
      });
      character.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
      });
      character.userData.materials?.forEach((m) => m.dispose());
      bgGeo.dispose();
      bgMat.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
