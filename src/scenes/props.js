import * as THREE from 'three';
import { glow } from '../gfx/surfaces.js';
import { WEAPON_MODELS, fitWeaponModel } from '../combat/weaponModels.js';

/*
  Utilería de escenario: dron procedural (sin modelos descargados) y armas a escala real para
  estantes y mesas (los mismos GLB de primera persona, unidos por material).
*/

// --- Dron -----------------------------------------------------------------------------------------
const droneMats = () => ({
  body: new THREE.MeshStandardMaterial({ color: '#1b2025', roughness: 0.42, metalness: 0.6 }),
  shell: new THREE.MeshStandardMaterial({ color: '#2b333b', roughness: 0.35, metalness: 0.5 }),
  arm: new THREE.MeshStandardMaterial({ color: '#15191d', roughness: 0.5, metalness: 0.45 }),
  blade: new THREE.MeshStandardMaterial({ color: '#0d1013', roughness: 0.6, metalness: 0.2 }),
  blur: new THREE.MeshBasicMaterial({ color: '#9aa7b1', transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide }),
  ledFront: glow('#3dffc9'),
  ledBack: glow('#ff9a3d'),
  lens: glow('#7ff9ff'),
});

/**
 * Cuadricóptero de unos 50 cm. Devuelve { group, update(dt, t), camera } (camera = punto del
 * objetivo de la cámara, para colgarle un láser). La pieza es dinámica: no se une a la geometría fija.
 */
export function createDrone() {
  const M = droneMats();
  const group = new THREE.Group();
  group.userData.dynamic = true;
  const add = (geo, mat, x, y, z, parent = group) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  };
  add(new THREE.BoxGeometry(0.2, 0.07, 0.3), M.body, 0, 0, 0);
  add(new THREE.BoxGeometry(0.15, 0.04, 0.22), M.shell, 0, 0.05, -0.01);
  add(new THREE.BoxGeometry(0.08, 0.025, 0.06), M.shell, 0, 0.08, 0.04); // antena GPS
  // Brazos en X con motor, hélice y disco de movimiento.
  const rotors = [];
  const armGeo = new THREE.BoxGeometry(0.3, 0.022, 0.034);
  const motorGeo = new THREE.CylinderGeometry(0.028, 0.032, 0.045, 12);
  const bladeGeo = new THREE.BoxGeometry(0.24, 0.004, 0.024);
  const blurGeo = new THREE.CircleGeometry(0.125, 28);
  const ledGeo = new THREE.BoxGeometry(0.03, 0.012, 0.03);
  for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const arm = add(armGeo, M.arm, (sx * 0.15) / 2, 0.01, (sz * 0.15) / 2);
    arm.rotation.y = Math.atan2(-sz, sx);
    add(motorGeo, M.body, sx * 0.16, 0.035, sz * 0.16);
    const rotor = new THREE.Group();
    rotor.position.set(sx * 0.16, 0.065, sz * 0.16);
    add(bladeGeo, M.blade, 0, 0, 0, rotor);
    const blur = add(blurGeo, M.blur, 0, 0.003, 0, rotor);
    blur.rotation.x = -Math.PI / 2;
    rotor.userData.dir = sx * sz;
    group.add(rotor);
    rotors.push(rotor);
    add(ledGeo, sz > 0 ? M.ledFront : M.ledBack, sx * 0.16, -0.008, sz * 0.16);
  }
  // Patas de aterrizaje.
  const legGeo = new THREE.BoxGeometry(0.012, 0.07, 0.2);
  for (const sx of [-1, 1]) add(legGeo, M.arm, sx * 0.07, -0.07, 0);
  // Cámara con lente brillante, colgando al frente.
  const gimbal = new THREE.Group();
  gimbal.position.set(0, -0.055, 0.12);
  add(new THREE.SphereGeometry(0.03, 14, 10), M.body, 0, 0, 0, gimbal);
  const lens = add(new THREE.CircleGeometry(0.014, 16), M.lens, 0, -0.004, 0.029, gimbal);
  lens.rotation.x = -0.25;
  group.add(gimbal);

  const base = new THREE.Vector3();
  let baseSet = false;
  const seed = Math.random() * 10;
  return {
    group,
    camera: gimbal,
    /** Flota en el sitio (bamboleo suave) y gira las hélices. */
    update(dt, t) {
      if (!baseSet) {
        base.copy(group.position);
        baseSet = true;
      }
      const s = t + seed;
      group.position.set(base.x + Math.sin(s * 0.7) * 0.05, base.y + Math.sin(s * 1.6) * 0.035, base.z + Math.cos(s * 0.5) * 0.04);
      group.rotation.z = Math.sin(s * 1.1) * 0.035;
      group.rotation.x = Math.cos(s * 0.9) * 0.03;
      for (const r of rotors) r.rotation.y += r.userData.dir * dt * 55;
    },
    /** Mueve el punto de reposo (para drones que se desplazan). */
    setBase(v) {
      base.copy(v);
      baseSet = true;
    },
  };
}

// --- Armas de utilería ------------------------------------------------------------------------------
let loaderPromise = null;
const raw = new Map(); // id → Promise<THREE.Object3D | null> (modelo a escala real, ajustado)

function loadRaw(id) {
  const cfg = WEAPON_MODELS[id];
  if (!cfg || typeof document === 'undefined') return Promise.resolve(null);
  if (!raw.has(id)) {
    loaderPromise ??= import('three/addons/loaders/GLTFLoader.js').then(({ GLTFLoader }) => new GLTFLoader());
    const BASE = `${import.meta.env?.BASE_URL ?? './'}models/weapons/`;
    raw.set(
      id,
      loaderPromise
        .then((l) => l.loadAsync(BASE + cfg.file))
        .then((gltf) => {
          // Escala real: culata en z = 0, lomo en y = 0, centrada en x. Cañón hacia -Z.
          fitWeaponModel(gltf.scene, { scale: 1, back: 0, top: 0, x: 0 });
          return gltf.scene;
        })
        .catch(() => null),
    );
  }
  return raw.get(id);
}

// Geometría solo con posición y normal (todas iguales: se pueden unir).
function plain(geometry, matrix) {
  const src = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', src.attributes.position.clone());
  if (src.attributes.normal) g.setAttribute('normal', src.attributes.normal.clone());
  else g.computeVertexNormals();
  g.applyMatrix4(matrix);
  return g;
}

// Une la geometría de `models` (cada uno con su matriz) en una malla por material.
async function mergeByMaterial(entries) {
  const { mergeGeometries } = await import('three/addons/utils/BufferGeometryUtils.js');
  const byMaterial = new Map();
  for (const { model, matrix } of entries) {
    model.updateMatrixWorld(true);
    model.traverse((o) => {
      if (!o.isMesh) return;
      const m = new THREE.Matrix4().multiplyMatrices(matrix, o.matrixWorld);
      const mat = Array.isArray(o.material) ? o.material[0] : o.material;
      if (!byMaterial.has(mat)) byMaterial.set(mat, []);
      byMaterial.get(mat).push(plain(o.geometry, m));
    });
  }
  const group = new THREE.Group();
  for (const [mat, geos] of byMaterial) {
    const merged = mergeGeometries(geos, false);
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.dynamic = true; // llega después de preparar el mapa: no entra en la unión estática
    group.add(mesh);
  }
  group.userData.dynamic = true;
  return group;
}

/**
 * Coloca armas en el mundo y las une por material (pocas llamadas de dibujo para todo el estante).
 * placements: [{ id, position: Vector3, rotation: Euler, scale? }]. Resuelve al grupo agregado a `parent`.
 */
export async function placeWeapons(parent, placements) {
  const models = await Promise.all(placements.map((p) => loadRaw(p.id)));
  const entries = [];
  placements.forEach((p, i) => {
    if (!models[i]) return;
    const pivot = new THREE.Object3D();
    pivot.position.copy(p.position);
    pivot.rotation.copy(p.rotation);
    pivot.scale.setScalar(p.scale ?? 1);
    pivot.updateMatrixWorld(true);
    entries.push({ model: models[i], matrix: pivot.matrixWorld });
  });
  const group = await mergeByMaterial(entries);
  parent.add(group);
  return group;
}

/**
 * Un arma suelta a escala real (para colgarla de un personaje): grupo con origen en el extremo de la
 * culata y el lomo, cañón hacia -Z. Resuelve a null si no se pudo cargar.
 */
export async function loadWeaponProp(id) {
  const model = await loadRaw(id);
  if (!model) return null;
  return mergeByMaterial([{ model, matrix: new THREE.Matrix4() }]);
}
