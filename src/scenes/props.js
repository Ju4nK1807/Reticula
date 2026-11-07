import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
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
 * Cuadricóptero de unos 50 cm. Devuelve { group, update(dt, t), camera, setBase } (camera = punto del
 * objetivo de la cámara, para colgarle un láser). Las piezas fijas van unidas por material (7 mallas en
 * vez de 26) y las hélices son discos de movimiento: a esa velocidad no se ven las palas.
 */
export function createDrone() {
  const M = droneMats();
  const group = new THREE.Group();
  group.userData.dynamic = true;
  const parts = new Map(); // material → geometrías ya ubicadas
  const put = (geo, mat, x, y, z, ry = 0) => {
    const g = geo.clone();
    if (ry) g.rotateY(ry);
    g.translate(x, y, z);
    if (!parts.has(mat)) parts.set(mat, []);
    parts.get(mat).push(g.index ? g.toNonIndexed() : g);
  };
  put(new THREE.BoxGeometry(0.2, 0.07, 0.3), M.body, 0, 0, 0);
  put(new THREE.BoxGeometry(0.15, 0.04, 0.22), M.shell, 0, 0.05, -0.01);
  put(new THREE.BoxGeometry(0.08, 0.025, 0.06), M.shell, 0, 0.08, 0.04); // antena GPS
  const armGeo = new THREE.BoxGeometry(0.3, 0.022, 0.034);
  const motorGeo = new THREE.CylinderGeometry(0.028, 0.032, 0.045, 12);
  const discGeo = new THREE.CircleGeometry(0.125, 28).rotateX(-Math.PI / 2);
  const ledGeo = new THREE.BoxGeometry(0.03, 0.012, 0.03);
  for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    put(armGeo, M.arm, (sx * 0.15) / 2, 0.01, (sz * 0.15) / 2, Math.atan2(-sz, sx));
    put(motorGeo, M.body, sx * 0.16, 0.035, sz * 0.16);
    put(discGeo, M.blur, sx * 0.16, 0.068, sz * 0.16);
    put(ledGeo, sz > 0 ? M.ledFront : M.ledBack, sx * 0.16, -0.008, sz * 0.16);
  }
  const legGeo = new THREE.BoxGeometry(0.012, 0.07, 0.2);
  for (const sx of [-1, 1]) put(legGeo, M.arm, sx * 0.07, -0.07, 0);
  // Cámara con lente brillante, colgando al frente.
  const gimbal = new THREE.Object3D();
  gimbal.position.set(0, -0.055, 0.12);
  group.add(gimbal);
  put(new THREE.SphereGeometry(0.03, 14, 10), M.body, 0, -0.055, 0.12);
  const lensGeo = new THREE.CircleGeometry(0.014, 16).rotateX(-0.25);
  put(lensGeo, M.lens, 0, -0.059, 0.149);
  for (const [mat, geos] of parts) {
    const mesh = new THREE.Mesh(mergeGeometries(geos.map(plainUV), false), mat);
    mesh.castShadow = mat === M.body; // solo el cuerpo da sombra (las hélices y las luces, no)
    mesh.userData.noShadow = mat !== M.body;
    group.add(mesh);
  }

  const base = new THREE.Vector3();
  let baseSet = false;
  const seed = Math.random() * 10;
  return {
    group,
    camera: gimbal,
    /** Flota en el sitio (bamboleo suave). */
    update(dt, t) {
      if (!baseSet) {
        base.copy(group.position);
        baseSet = true;
      }
      const s = t + seed;
      group.position.set(base.x + Math.sin(s * 0.7) * 0.05, base.y + Math.sin(s * 1.6) * 0.035, base.z + Math.cos(s * 0.5) * 0.04);
      group.rotation.z = Math.sin(s * 1.1) * 0.035;
      group.rotation.x = Math.cos(s * 0.9) * 0.03;
    },
    /** Mueve el punto de reposo (para drones que se desplazan). */
    setBase(v) {
      base.copy(v);
      baseSet = true;
    },
  };
}

// Geometría con posición, normal y uv (todas iguales: se pueden unir aunque vengan de primitivas distintas).
function plainUV(geo) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', geo.attributes.position);
  g.setAttribute('normal', geo.attributes.normal);
  g.setAttribute('uv', geo.attributes.uv);
  return g;
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
