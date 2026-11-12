import * as THREE from 'three';

/*
  Modelos 3D de las armas en primera persona (GLB optimizados, CC0; ver public/models/weapons/credits.json).

  Los modelos vienen en escala real (metros) con el cañón hacia -Z. Al cargarlos:
  - Se colocan en el grupo del arma según `back` (dónde queda la culata, +Z hacia la cámara) y `top`
    (altura del lomo), y se escalan con `scale`.
  - La boca del cañón se calcula de la geometría (vértices más adelantados), para el fogonazo.
  - Los materiales planos del modelo se cambian por PBR: metal pavonado, polímero, madera y latón.
  Se cargan bajo demanda (el cargador GLTF va en un archivo aparte) y se cachean.
*/

const BASE = `${import.meta.env?.BASE_URL ?? './'}models/weapons/`;

// scale: tamaño en pantalla · back: culata (+Z hacia la cámara) · top: altura del lomo · x: lateral.
// tint: las armas nuevas reutilizan un modelo con otro tamaño y otro acabado (se distinguen a simple vista).
// grip / fore: dónde van la mano derecha (empuñadura) y la izquierda (guardamanos o corredera), en
//   coordenadas del arma ya colocada; medidas sobre cada modelo (ver combat/arms.js).
export const WEAPON_MODELS = {
  pistol: { file: 'pistol.glb', scale: 1.7, back: 0.06, top: 0.1, x: -0.03, grip: [-0.03, -0.07, 0.005], fore: null },
  smg: { file: 'smg.glb', scale: 1.25, back: 0.24, top: 0.11, x: -0.03, grip: [-0.03, -0.08, -0.05], fore: [-0.03, -0.02, -0.33] },
  rifle: { file: 'rifle.glb', scale: 1.2, back: 0.32, top: 0.12, x: -0.03, grip: [-0.033, -0.1, -0.02], fore: [-0.033, -0.005, -0.36] },
  shotgun: { file: 'shotgun.glb', scale: 1.25, back: 0.34, top: 0.1, x: -0.03, grip: [-0.03, -0.035, 0.13], fore: [-0.03, -0.03, -0.24] },
  sniper: { file: 'sniper.glb', scale: 1.15, back: 0.4, top: 0.135, x: -0.03, grip: [-0.04, -0.06, 0.02], fore: [-0.04, -0.005, -0.27] },
  magnum: { file: 'pistol.glb', scale: 1.9, back: 0.07, top: 0.105, x: -0.03, tint: '#8a8f98', grip: [-0.03, -0.075, 0.01], fore: null },
  burst: { file: 'rifle.glb', scale: 1.12, back: 0.3, top: 0.115, x: -0.03, tint: '#55603f', grip: [-0.033, -0.095, -0.02], fore: [-0.033, -0.005, -0.34] },
  lmg: { file: 'rifle.glb', scale: 1.38, back: 0.36, top: 0.135, x: -0.03, tint: '#30352c', grip: [-0.036, -0.11, -0.01], fore: [-0.036, -0.01, -0.42] },
  ray: { file: 'smg.glb', scale: 1.3, back: 0.24, top: 0.115, x: -0.03, tint: '#8a3fd0', grip: [-0.03, -0.083, -0.05], fore: [-0.03, -0.02, -0.34] },
  dmr: { file: 'sniper.glb', scale: 1.0, back: 0.34, top: 0.12, x: -0.03, tint: '#7a6548', grip: [-0.04, -0.055, 0.0], fore: [-0.04, -0.005, -0.24] },
};

// Paleta plana del autor → materiales PBR. Se elige por el nombre del material original.
const PBR = [
  [/brass|yellow/i, { color: '#b08a3c', roughness: 0.32, metalness: 1 }],
  [/brown|wood|chestnut|bole/i, { color: '#33241a', roughness: 0.6, metalness: 0 }],
  [/grey_dark(?!er)|grey\b|light/i, { color: '#4b5058', roughness: 0.38, metalness: 0.75 }],
  [/darker/i, { color: '#2a2d32', roughness: 0.44, metalness: 0.65 }],
  [/black_lighter/i, { color: '#1d2024', roughness: 0.5, metalness: 0.5 }],
  [/black/i, { color: '#121417', roughness: 0.58, metalness: 0.35 }],
];
const materialCache = new Map();

function pbrFor(original, tint = null) {
  const name = original?.name ?? '';
  const spec = PBR.find(([re]) => re.test(name))?.[1] ?? { color: original?.color ?? '#30343a', roughness: 0.5, metalness: 0.4 };
  const key = JSON.stringify(spec) + (tint ?? '');
  if (!materialCache.has(key)) {
    const m = new THREE.MeshStandardMaterial({ ...spec, flatShading: true });
    // Acabado de la variante: el metal y el polímero toman el color; el latón y la madera casi no.
    if (tint) m.color.lerp(new THREE.Color(tint), spec.metalness > 0.6 || spec.metalness === 0 ? 0.25 : 0.5);
    materialCache.set(key, m);
  }
  return materialCache.get(key);
}

let loaderPromise = null;
function loader() {
  loaderPromise ??= import('three/addons/loaders/GLTFLoader.js').then(({ GLTFLoader }) => new GLTFLoader());
  return loaderPromise;
}

const cache = new Map(); // id → Promise<{ object, muzzle }>

/** Ajusta un modelo cargado: materiales, escala y posición; devuelve la boca del cañón (local). */
export function fitWeaponModel(root, cfg) {
  root.traverse((o) => {
    if (o.isMesh) {
      const tint = cfg.tint ?? null;
      o.material = Array.isArray(o.material) ? o.material.map((m) => pbrFor(m, tint)) : pbrFor(o.material, tint);
      o.frustumCulled = false;
    }
  });
  root.scale.setScalar(cfg.scale);
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const center = box.getCenter(new THREE.Vector3());
  root.position.set((cfg.x ?? 0) - center.x, cfg.top - box.max.y, cfg.back - box.max.z);
  root.updateMatrixWorld(true);

  // Boca del cañón: promedio de los vértices a menos de 1.5 cm del extremo delantero.
  const front = box.min.z + root.position.z;
  const v = new THREE.Vector3();
  const sum = new THREE.Vector3();
  let n = 0;
  root.traverse((o) => {
    if (!o.isMesh) return;
    const pos = o.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      if (v.z < front + 0.015) {
        sum.add(v);
        n++;
      }
    }
  });
  const muzzle = n ? sum.divideScalar(n) : new THREE.Vector3(0, cfg.top - 0.03, front);
  muzzle.z = front - 0.01;
  return muzzle;
}

/** Carga (una vez) el modelo de un arma. Resuelve a null si no existe o falla. */
export function loadWeaponModel(id) {
  const cfg = WEAPON_MODELS[id];
  if (!cfg || typeof document === 'undefined') return Promise.resolve(null);
  if (!cache.has(id)) {
    cache.set(
      id,
      loader()
        .then((l) => l.loadAsync(BASE + cfg.file))
        .then((gltf) => {
          const object = new THREE.Group();
          object.add(gltf.scene);
          const muzzle = fitWeaponModel(gltf.scene, cfg);
          return { object, muzzle };
        })
        .catch(() => null),
    );
  }
  return cache.get(id);
}
