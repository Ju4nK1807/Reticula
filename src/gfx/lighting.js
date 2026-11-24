import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeStatic } from './mergeStatic.js';

const SHADOW_SIZE = { alta: 2048, media: 1024, baja: 0 };
const MAX_HALF_EXTENT = 48;
const ENV_INTENSITY = 0.35;
let envTexture = null;

export function environment(renderer) {
  if (!envTexture) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    envTexture = pmrem.fromScene(room, 0.04).texture;
    room.dispose?.();
    pmrem.dispose();
  }
  return envTexture;
}

function findSun(scene) {
  let sun = null;
  scene.traverse((o) => {
    if (!sun && o.isDirectionalLight) sun = o;
  });
  return sun;
}

function playBounds(world) {
  const box = new THREE.Box3();
  for (const c of world.colliders) box.union(c);
  if (box.isEmpty()) box.setFromCenterAndSize(world.spawn ?? new THREE.Vector3(), new THREE.Vector3(40, 10, 40));
  return box;
}

export function prepareWorld(world, renderer) {
  if (world.gfx) return world.gfx;
  const scene = world.scene;
  scene.environment = environment(renderer);
  scene.environmentIntensity = world.envIntensity ?? ENV_INTENSITY;

  scene.traverse((o) => {
    if (!o.isMesh) return;
    const lit = !o.material?.isMeshBasicMaterial && !o.userData.noShadow;
    o.receiveShadow = lit;
    o.castShadow = lit && !o.userData.ground;
  });

  const sun = findSun(scene);
  if (sun) {
    const box = playBounds(world);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const half = Math.min(MAX_HALF_EXTENT, Math.max(size.x, size.z) / 2 + 4);
    const dir = sun.position.clone().sub(sun.target.position).normalize();
    sun.target.position.copy(center);
    sun.position.copy(center).addScaledVector(dir, half * 2);
    if (!sun.target.parent) scene.add(sun.target);
    const cam = sun.shadow.camera;
    cam.left = -half;
    cam.right = half;
    cam.top = half;
    cam.bottom = -half;
    cam.near = 0.5;
    cam.far = half * 4 + size.y;
    cam.updateProjectionMatrix();
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    sun.updateMatrixWorld(true);
    sun.target.updateMatrixWorld(true);
  }
  const merge = mergeStatic(world);
  world.gfx = { sun, shadowSize: -1, merge };
  return world.gfx;
}

let shadowMode = 'auto';
export function setShadowMode(mode) {
  shadowMode = mode === 'on' || mode === 'off' ? mode : 'auto';
}

export function shadowSizeFor(detail, mode = shadowMode) {
  if (mode === 'off') return 0;
  const size = SHADOW_SIZE[detail] ?? SHADOW_SIZE.alta;
  return mode === 'on' && size === 0 ? SHADOW_SIZE.media : size;
}

export function applyShadowQuality(world, detail) {
  const gfx = world.gfx;
  if (!gfx?.sun) return;
  const size = shadowSizeFor(detail);
  if (size === gfx.shadowSize) return;
  gfx.shadowSize = size;
  const { sun } = gfx;
  sun.castShadow = size > 0;
  sun.shadow.mapSize.set(size || 1, size || 1);
  sun.shadow.radius = detail === 'alta' ? 3 : 1;
  sun.shadow.map?.dispose();
  sun.shadow.map = null;
}

export function castsShadow(object) {
  object.traverse((o) => {
    if (o.isMesh && !o.material?.isMeshBasicMaterial) o.castShadow = true;
  });
  return object;
}
