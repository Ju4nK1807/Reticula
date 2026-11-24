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

/*
  Acabados: cada arma tiene su propio diseño de color (antes casi todas salían negras y grises, y las
  que comparten modelo se confundían). Los materiales planos del autor se agrupan por papel:
    frame  armazón y polímero (las piezas negras: lo que más se ve)
    metal  cajón de mecanismos, cañón y piezas grises
    wood   culata, empuñadura y guardamanos (las piezas marrones)
    light  miras y detalles claros (blanco y gris claro) · red: punto de mira rojo de la escopeta
    brass  latón (cartuchos y remaches)
  `hud`: color del ícono del arma en el HUD. Cada papel es [color, rugosidad, metalicidad, (brillo propio)]. `glow` hace brillar las miras y los
  detalles: a oscuras (modo zombi) el arma se reconoce por su color de acento.
*/
const F = (color, roughness, metalness, glow = 0) => ({ color, roughness, metalness, glow });
export const FINISHES = {
  // Pistola: polímero negro con corredera de acero pulido y miras verdes.
  pistol: { name: 'Acero y polímero', hud: '#57ff9a', frame: F('#16181b', 0.62, 0.15), metal: F('#7d848e', 0.26, 0.95), wood: F('#2a2420', 0.7, 0), light: F('#57ff9a', 0.4, 0, 1.6), red: F('#ff3b3b', 0.4, 0, 1.4), brass: F('#b08a3c', 0.3, 1) },
  // Subfusil: polímero color arena (coyote) con metal negro y detalles cian.
  smg: { name: 'Arena del desierto', hud: '#e0b878', frame: F('#a8885a', 0.68, 0.05), metal: F('#25282c', 0.4, 0.8), wood: F('#8a6c45', 0.66, 0), light: F('#36d6ff', 0.4, 0, 1.6), red: F('#36d6ff', 0.4, 0, 1.6), brass: F('#b08a3c', 0.3, 1) },
  // Rifle: verde militar (ranger) con cajón negro y miras verde lima.
  rifle: { name: 'Verde militar', hud: '#8fd16a', frame: F('#4c5a37', 0.66, 0.08), metal: F('#22252a', 0.38, 0.85), wood: F('#5f6d44', 0.64, 0), light: F('#00ffa3', 0.4, 0, 1.6), red: F('#00ffa3', 0.4, 0, 1.6), brass: F('#b08a3c', 0.3, 1) },
  // Escopeta: acero pavonado azulado, madera de nogal y punto de mira rojo.
  shotgun: { name: 'Pavonado y nogal', hud: '#ff6a4a', frame: F('#1f2738', 0.3, 0.88), metal: F('#334058', 0.28, 0.9), wood: F('#7b4424', 0.55, 0), light: F('#d8dde6', 0.35, 0.6), red: F('#ff3324', 0.4, 0, 1.8), brass: F('#c49a3e', 0.28, 1) },
  // Francotirador: camuflaje ártico (blanco hueso) con metal negro y detalles rojos.
  sniper: { name: 'Ártico', hud: '#e8ece6', frame: F('#d6d9d2', 0.72, 0.02), metal: F('#2b2f34', 0.36, 0.85), wood: F('#c3c7bd', 0.7, 0), light: F('#ff4d6d', 0.4, 0, 1.5), red: F('#ff4d6d', 0.4, 0, 1.5), brass: F('#b08a3c', 0.3, 1) },
  // Revólver: niquelado brillante con cachas de palo de rosa y detalles dorados.
  magnum: { name: 'Niquelado', hud: '#ffd94d', frame: F('#c9ccd2', 0.16, 1), metal: F('#e4e6ea', 0.12, 1), wood: F('#5c1f16', 0.48, 0), light: F('#ffd94d', 0.3, 0.8, 0.8), red: F('#ffd94d', 0.3, 0.8, 0.8), brass: F('#d9ab3c', 0.22, 1) },
  // Rifle de ráfaga: gris urbano azulado con detalles naranja.
  burst: { name: 'Urbano', hud: '#ff8a2a', frame: F('#56677c', 0.6, 0.12), metal: F('#1d2228', 0.38, 0.85), wood: F('#38414f', 0.62, 0), light: F('#ff8a2a', 0.4, 0, 1.7), red: F('#ff8a2a', 0.4, 0, 1.7), brass: F('#b08a3c', 0.3, 1) },
  // Ametralladora: verde oliva oscuro, metal gastado y detalles ámbar.
  lmg: { name: 'Oliva pesado', hud: '#ffb020', frame: F('#3d4229', 0.7, 0.1), metal: F('#3a3936', 0.5, 0.75), wood: F('#4e4a30', 0.66, 0), light: F('#ffb020', 0.4, 0, 1.6), red: F('#ffb020', 0.4, 0, 1.6), brass: F('#b8913c', 0.3, 1) },
  // Fusil de tirador: tierra (marrón) con madera clara y detalles cian.
  dmr: { name: 'Tierra', hud: '#36d6ff', frame: F('#6e5639', 0.64, 0.08), metal: F('#2c2823', 0.4, 0.8), wood: F('#9a7448', 0.58, 0), light: F('#36d6ff', 0.4, 0, 1.6), red: F('#36d6ff', 0.4, 0, 1.6), brass: F('#b08a3c', 0.3, 1) },
  // Desintegrador: violeta metalizado con bobinas de energía cian que brillan.
  ray: { name: 'Energía', hud: '#c77dff', frame: F('#4b1f82', 0.3, 0.75), metal: F('#22163a', 0.3, 0.85), wood: F('#8a3fe0', 0.35, 0.3, 0.6), light: F('#7df9ff', 0.3, 0, 3), red: F('#7df9ff', 0.3, 0, 3), brass: F('#d38bff', 0.25, 0.6, 1.4) },
};
// Acabado de los modelos sin arma propia (el arma de los soldados de los menús): el clásico.
const DEFAULT_FINISH = { frame: F('#121417', 0.58, 0.35), metal: F('#4b5058', 0.38, 0.75), wood: F('#33241a', 0.6, 0), light: F('#8c939c', 0.38, 0.75), red: F('#8a1a14', 0.5, 0.2), brass: F('#b08a3c', 0.32, 1) };

// scale: tamaño en pantalla · back: culata (+Z hacia la cámara) · top: altura del lomo · x: lateral.
// finish: acabado (FINISHES): las armas que reutilizan un modelo se distinguen por su tamaño y su color.
// grip / fore: dónde van la mano derecha (empuñadura) y la izquierda (guardamanos o corredera), en
//   coordenadas del arma ya colocada; medidas sobre cada modelo (ver combat/arms.js).
export const WEAPON_MODELS = {
  pistol: { file: 'pistol.glb', scale: 1.7, back: 0.06, top: 0.1, x: -0.03, finish: 'pistol', grip: [-0.03, -0.07, 0.005], fore: null },
  smg: { file: 'smg.glb', scale: 1.25, back: 0.24, top: 0.11, x: -0.03, finish: 'smg', grip: [-0.03, -0.08, -0.05], fore: [-0.03, -0.02, -0.33] },
  rifle: { file: 'rifle.glb', scale: 1.2, back: 0.32, top: 0.12, x: -0.03, finish: 'rifle', grip: [-0.033, -0.1, -0.02], fore: [-0.033, -0.005, -0.36] },
  shotgun: { file: 'shotgun.glb', scale: 1.25, back: 0.34, top: 0.1, x: -0.03, finish: 'shotgun', grip: [-0.03, -0.035, 0.13], fore: [-0.03, -0.03, -0.24] },
  sniper: { file: 'sniper.glb', scale: 1.15, back: 0.4, top: 0.135, x: -0.03, finish: 'sniper', grip: [-0.04, -0.06, 0.02], fore: [-0.04, -0.005, -0.27] },
  magnum: { file: 'pistol.glb', scale: 1.9, back: 0.07, top: 0.105, x: -0.03, finish: 'magnum', grip: [-0.03, -0.075, 0.01], fore: null },
  burst: { file: 'rifle.glb', scale: 1.12, back: 0.3, top: 0.115, x: -0.03, finish: 'burst', grip: [-0.033, -0.095, -0.02], fore: [-0.033, -0.005, -0.34] },
  lmg: { file: 'rifle.glb', scale: 1.38, back: 0.36, top: 0.135, x: -0.03, finish: 'lmg', grip: [-0.036, -0.11, -0.01], fore: [-0.036, -0.01, -0.42] },
  ray: { file: 'smg.glb', scale: 1.3, back: 0.24, top: 0.115, x: -0.03, finish: 'ray', grip: [-0.03, -0.083, -0.05], fore: [-0.03, -0.02, -0.34] },
  dmr: { file: 'sniper.glb', scale: 1.0, back: 0.34, top: 0.12, x: -0.03, finish: 'dmr', grip: [-0.04, -0.055, 0.0], fore: [-0.04, -0.005, -0.24] },
};

// Papel de cada material plano del autor (por su nombre). El orden importa: «Black_Lighter» es negro
// (armazón), no un detalle claro.
const ROLES = [
  [/brass|yellow/i, 'brass'],
  [/brown|wood|chestnut|bole/i, 'wood'],
  [/red|brick/i, 'red'],
  [/black_lighter/i, 'frame'],
  [/black/i, 'frame'],
  [/darker/i, 'metal'],
  [/white|grey_light/i, 'light'],
  [/grey/i, 'metal'],
];
const materialCache = new Map();

/** Papel (frame, metal, wood, light, red, brass) de un material del modelo según su nombre. */
export function materialRole(name = '') {
  return ROLES.find(([re]) => re.test(name))?.[1] ?? 'metal';
}

/** Acabado de un arma (o el clásico si no tiene). */
export function finishOf(id) {
  return FINISHES[id] ?? DEFAULT_FINISH;
}

function pbrFor(original, finishId = null) {
  const role = materialRole(original?.name ?? '');
  const key = `${finishId ?? 'default'}:${role}`;
  if (!materialCache.has(key)) {
    const spec = finishOf(finishId)[role];
    const m = new THREE.MeshStandardMaterial({ color: spec.color, roughness: spec.roughness, metalness: spec.metalness, flatShading: true });
    if (spec.glow) {
      m.emissive.set(spec.color);
      m.emissiveIntensity = spec.glow;
    }
    m.name = `arma-${key}`;
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
      const finish = cfg.finish ?? null;
      o.material = Array.isArray(o.material) ? o.material.map((m) => pbrFor(m, finish)) : pbrFor(o.material, finish);
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
