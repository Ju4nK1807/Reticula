import * as THREE from 'three';

/*
  Brazos en primera persona (low-poly, sin texturas): manga táctica, guante y dedos.

  - buildArms(cfg): los dos brazos sujetando el arma. La mano derecha va en la empuñadura (cfg.grip)
    y la izquierda en el guardamanos o la corredera (cfg.fore); con la pistola y el revólver la
    izquierda acompaña a la derecha (agarre a dos manos). Coordenadas del grupo del arma: se mueven
    con ella (retroceso, recarga, apuntar). Los codos quedan fuera de la pantalla.
  - buildKnifeArm(): brazo derecho con el cuchillo (golpe cuerpo a cuerpo).
  - buildThrowArm(): brazo izquierdo con una granada en la mano (lanzamiento).
  Anclas medidas sobre los modelos 3D (ver WEAPON_MODELS.grip / fore en weaponModels.js).
*/

const std = (color, roughness, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness, flatShading: true });
export const ARM_MATERIALS = {
  sleeve: std('#3d4636', 0.95),
  cuff: std('#2a3026', 0.9),
  glove: std('#1c1e21', 0.6, 0.05),
  knuckle: std('#2c2f33', 0.55, 0.1),
  steel: std('#c9ced6', 0.22, 0.95),
  handle: std('#141517', 0.7, 0.1),
};

const cylinder = new THREE.CylinderGeometry(1, 1, 1, 8, 1);
const box = new THREE.BoxGeometry(1, 1, 1);
const _dir = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

// Tramo de brazo entre dos puntos (cilindro que se afina hacia la muñeca).
function limb(from, to, rFrom, rTo, mat) {
  const len = from.distanceTo(to);
  const geo = new THREE.CylinderGeometry(rTo, rFrom, 1, 8, 1);
  const m = new THREE.Mesh(geo, mat);
  m.scale.y = len;
  m.position.copy(from).add(to).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(UP, _dir.subVectors(to, from).normalize());
  m.frustumCulled = false;
  return m;
}

function part(geo, mat, sx, sy, sz, x, y, z, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.scale.set(sx, sy, sz);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  m.frustumCulled = false;
  return m;
}

// Mano enguantada cerrada alrededor de algo vertical (empuñadura): palma, dedos y pulgar.
// Local: el agarre está en el origen, los dedos rodean hacia +X (lado izquierdo del arma para la
// mano derecha). `side` = 1 derecha, -1 izquierda (espejo).
function grippingHand(side = 1) {
  const M = ARM_MATERIALS;
  const g = new THREE.Group();
  g.add(part(box, M.glove, 0.03, 0.085, 0.075, 0.03 * side, 0, 0.01)); // palma (lado de afuera)
  g.add(part(box, M.glove, 0.06, 0.07, 0.03, 0.0, -0.005, -0.035)); // dedos delante del mango
  for (let i = 0; i < 3; i++) g.add(part(box, M.knuckle, 0.062, 0.018, 0.012, 0, 0.022 - i * 0.022, -0.052)); // nudillos
  g.add(part(box, M.glove, 0.022, 0.022, 0.06, -0.026 * side, 0.03, -0.01, 0.3)); // pulgar
  g.add(part(cylinder, M.cuff, 0.04, 0.03, 0.04, 0.018 * side, -0.02, 0.06, Math.PI / 2 - 0.5)); // puño de la manga
  return g;
}

// Mano abierta sosteniendo desde abajo (guardamanos): palma bajo el arma y dedos hacia arriba.
function supportHand(side = -1) {
  const M = ARM_MATERIALS;
  const g = new THREE.Group();
  g.add(part(box, M.glove, 0.07, 0.026, 0.085, 0, 0, 0)); // palma
  g.add(part(box, M.glove, 0.018, 0.05, 0.075, 0.04 * -side, 0.025, -0.005)); // dedos del otro lado
  for (let i = 0; i < 3; i++) g.add(part(box, M.knuckle, 0.012, 0.016, 0.02, 0.05 * -side, 0.045, -0.03 + i * 0.024));
  g.add(part(box, M.glove, 0.02, 0.045, 0.05, 0.04 * side, 0.02, 0.02)); // pulgar del lado de cerca
  return g;
}

/** Los dos brazos para el arma con anclas `cfg.grip` y `cfg.fore` (null = arma corta). */
export function buildArms(cfg) {
  const M = ARM_MATERIALS;
  const group = new THREE.Group();
  const grip = new THREE.Vector3().fromArray(cfg?.grip ?? [-0.03, -0.09, 0]);

  // Brazo derecho: mano en la empuñadura, antebrazo hacia abajo y atrás (codo fuera de cámara).
  const right = grippingHand(1);
  right.position.copy(grip);
  right.rotation.set(0.25, 0, -0.08);
  group.add(right);
  const rWrist = grip.clone().add(new THREE.Vector3(0.02, -0.035, 0.07));
  const rElbow = grip.clone().add(new THREE.Vector3(0.13, -0.26, 0.42));
  group.add(limb(rElbow, rWrist, 0.05, 0.034, M.sleeve));

  if (cfg?.fore) {
    // Brazo izquierdo: mano bajo el guardamanos, antebrazo cruzando hacia abajo a la izquierda.
    const fore = new THREE.Vector3().fromArray(cfg.fore);
    const left = supportHand(-1);
    left.position.copy(fore).add(new THREE.Vector3(0, -0.03, 0));
    left.rotation.set(0.1, 0, 0.15);
    group.add(left);
    const lWrist = fore.clone().add(new THREE.Vector3(-0.035, -0.05, 0.05));
    const lElbow = fore.clone().add(new THREE.Vector3(-0.24, -0.28, 0.38));
    group.add(limb(lElbow, lWrist, 0.05, 0.032, M.sleeve));
    group.add(limb(lWrist, lWrist.clone().lerp(lElbow, 0.12), 0.036, 0.036, M.cuff));
  } else {
    // Arma corta: la izquierda envuelve a la derecha (agarre a dos manos).
    const left = grippingHand(-1);
    left.position.copy(grip).add(new THREE.Vector3(-0.012, -0.02, 0.012));
    left.rotation.set(0.3, 0.35, 0.1);
    left.scale.setScalar(0.96);
    group.add(left);
    const lWrist = grip.clone().add(new THREE.Vector3(-0.04, -0.06, 0.06));
    const lElbow = grip.clone().add(new THREE.Vector3(-0.3, -0.24, 0.36));
    group.add(limb(lElbow, lWrist, 0.05, 0.033, M.sleeve));
  }
  return group;
}

/** Brazo derecho con el cuchillo (hoja hacia -Z, filo hacia abajo). */
export function buildKnifeArm() {
  const M = ARM_MATERIALS;
  const group = new THREE.Group();
  const knife = new THREE.Group();
  // Hoja: perfil con punta (extrusión fina).
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(0.165, 0.004);
  shape.lineTo(0.19, 0.016);
  shape.lineTo(0.15, 0.028);
  shape.lineTo(0, 0.026);
  shape.lineTo(0, 0);
  const blade = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.004, bevelEnabled: false }), M.steel);
  blade.rotation.y = Math.PI / 2; // de +X a -Z
  blade.position.set(0.002, -0.013, -0.02);
  knife.add(blade);
  knife.add(part(box, M.handle, 0.024, 0.03, 0.022, 0, 0, -0.012)); // guarda
  knife.add(part(box, M.handle, 0.02, 0.026, 0.11, 0, 0, 0.045)); // mango
  for (const m of knife.children) m.frustumCulled = false;
  const hand = grippingHand(1);
  hand.rotation.set(Math.PI / 2, 0, 0); // agarre horizontal: el mango va hacia la cámara
  hand.position.set(0, 0.0, 0.045);
  group.add(knife, hand);
  group.add(limb(new THREE.Vector3(0.12, -0.18, 0.42), new THREE.Vector3(0.015, -0.02, 0.1), 0.05, 0.034, M.sleeve));
  return group;
}

/** Brazo izquierdo con una granada en la mano; `grenade` = malla de la granada (se reemplaza por tipo). */
export function buildThrowArm() {
  const M = ARM_MATERIALS;
  const group = new THREE.Group();
  const hand = new THREE.Group();
  hand.add(part(box, M.glove, 0.075, 0.03, 0.085, 0, -0.045, 0)); // palma bajo la granada
  hand.add(part(box, M.glove, 0.02, 0.06, 0.07, 0.042, -0.02, 0)); // dedos que la rodean
  hand.add(part(box, M.glove, 0.02, 0.05, 0.05, -0.04, -0.015, 0.01)); // pulgar
  const slot = new THREE.Group(); // aquí va la granada del tipo elegido
  hand.add(slot);
  group.add(hand);
  group.add(limb(new THREE.Vector3(-0.16, -0.3, 0.36), new THREE.Vector3(-0.01, -0.07, 0.06), 0.05, 0.033, M.sleeve));
  group.userData.slot = slot;
  return group;
}
