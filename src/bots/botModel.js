import * as THREE from 'three';

// Proporciones de un personaje de shooter (~1.77 m). Cabeza ≈ 25 cm, como en la mayoría de juegos.
export const BOT_DIMENSIONS = {
  legHeight: 0.86,
  headCenter: 1.635, // altura del centro de la cabeza de pie
  chestCenter: 1.17,
  crouchDrop: 0.56, // cuánto baja el torso al agacharse (la cabeza queda a ~1.21 m)
};

const GEO = {
  leg: new THREE.BoxGeometry(0.18, 0.86, 0.22),
  torso: new THREE.BoxGeometry(0.5, 0.62, 0.3),
  arm: new THREE.BoxGeometry(0.14, 0.58, 0.16),
  head: new THREE.BoxGeometry(0.25, 0.27, 0.27),
  visor: new THREE.BoxGeometry(0.2, 0.065, 0.03),
  pack: new THREE.BoxGeometry(0.36, 0.4, 0.12),
  gun: new THREE.BoxGeometry(0.07, 0.1, 0.62),
};

// Construye el modelo low-poly. Cada malla con userData.part ('head' | 'body' | 'legs') es una hitbox.
export function buildBotModel(color) {
  const base = new THREE.Color(color);
  const mats = {
    body: new THREE.MeshLambertMaterial({ color: base, flatShading: true, emissive: '#ffffff', emissiveIntensity: 0 }),
    legs: new THREE.MeshLambertMaterial({ color: base.clone().multiplyScalar(0.55), flatShading: true, emissive: '#ffffff', emissiveIntensity: 0 }),
    head: new THREE.MeshLambertMaterial({ color: base.clone().lerp(new THREE.Color('#ffffff'), 0.15), flatShading: true, emissive: '#ffffff', emissiveIntensity: 0 }),
    gear: new THREE.MeshLambertMaterial({ color: '#1b1f26', flatShading: true }),
    visor: new THREE.MeshBasicMaterial({ color: '#e8faff' }),
  };

  const group = new THREE.Group();
  const hitMeshes = [];
  const mesh = (geo, mat, parent, x, y, z, part = null) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    parent.add(m);
    if (part) {
      m.userData.part = part;
      hitMeshes.push(m);
    }
    return m;
  };

  const legs = [mesh(GEO.leg, mats.legs, group, -0.11, 0.43, 0, 'legs'), mesh(GEO.leg, mats.legs, group, 0.11, 0.43, 0, 'legs')];

  const upper = new THREE.Group();
  upper.position.y = BOT_DIMENSIONS.legHeight;
  group.add(upper);
  mesh(GEO.torso, mats.body, upper, 0, 0.31, 0, 'body');
  mesh(GEO.pack, mats.gear, upper, 0, 0.34, -0.2, 'body');
  const armL = mesh(GEO.arm, mats.body, upper, -0.33, 0.3, 0.06, 'body');
  const armR = mesh(GEO.arm, mats.body, upper, 0.33, 0.3, 0.06, 'body');
  armL.rotation.x = armR.rotation.x = -0.7;
  mesh(GEO.head, mats.head, upper, 0, 0.775, 0, 'head');
  mesh(GEO.visor, mats.visor, upper, 0, 0.79, 0.15);
  mesh(GEO.gun, mats.gear, upper, 0.12, 0.3, 0.38);

  const gunTip = new THREE.Object3D();
  gunTip.position.set(0.12, 0.3, 0.7);
  upper.add(gunTip);

  return { group, upper, legs, hitMeshes, mats, gunTip };
}
