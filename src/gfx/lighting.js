import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeStatic } from './mergeStatic.js';

/*
  Iluminación de los mapas:
  - Luz de entorno (RoomEnvironment prefiltrado, compartido): reflejos suaves en metal y relleno
    ambiental para los materiales PBR. No requiere descargar un HDRI.
  - Sombras del sol (la primera DirectionalLight del mapa), ajustadas a la zona de juego, no a todo
    el terreno: así cada texel de la sombra cubre pocos centímetros.
  Calidad: alta = sombra 2048 suave · media = 1024 · baja = sin sombras.
*/

const SHADOW_SIZE = { alta: 2048, media: 1024, baja: 0 };
const MAX_HALF_EXTENT = 48; // m: más allá, la sombra pierde definición y no aporta
const ENV_INTENSITY = 0.35;
let envTexture = null;

/** Mapa de entorno compartido (reflejos de los materiales PBR). */
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

// Zona de juego: unión de los colliders (muros, coberturas), recortada a un tamaño razonable.
function playBounds(world) {
  const box = new THREE.Box3();
  for (const c of world.colliders) box.union(c);
  if (box.isEmpty()) box.setFromCenterAndSize(world.spawn ?? new THREE.Vector3(), new THREE.Vector3(40, 10, 40));
  return box;
}

/** Prepara un mapa recién creado (una sola vez): entorno, sol y qué proyecta o recibe sombra. */
export function prepareWorld(world, renderer) {
  if (world.gfx) return world.gfx;
  const scene = world.scene;
  scene.environment = environment(renderer);
  scene.environmentIntensity = world.envIntensity ?? ENV_INTENSITY;

  scene.traverse((o) => {
    if (!o.isMesh) return;
    const lit = !o.material?.isMeshBasicMaterial && !o.userData.noShadow; // el cielo no proyecta sombra
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
  // Geometría estática unida por material: muchas menos llamadas de dibujo (ver mergeStatic.js).
  const merge = mergeStatic(world);
  world.gfx = { sun, shadowSize: -1, merge };
  return world.gfx;
}

/** Aplica la calidad de sombras a un mapa preparado. */
export function applyShadowQuality(world, detail) {
  const gfx = world.gfx;
  if (!gfx?.sun) return;
  const size = SHADOW_SIZE[detail] ?? SHADOW_SIZE.alta;
  if (size === gfx.shadowSize) return;
  gfx.shadowSize = size;
  const { sun } = gfx;
  sun.castShadow = size > 0;
  sun.shadow.mapSize.set(size || 1, size || 1);
  sun.shadow.radius = detail === 'alta' ? 3 : 1;
  sun.shadow.map?.dispose();
  sun.shadow.map = null;
}

/** Marca un objeto dinámico (bots, dianas) para que proyecte sombra. */
export function castsShadow(object) {
  object.traverse((o) => {
    if (o.isMesh && !o.material?.isMeshBasicMaterial) o.castShadow = true;
  });
  return object;
}
