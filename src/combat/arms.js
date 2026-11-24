import * as THREE from 'three';

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

function grippingHand(side = 1) {
  const M = ARM_MATERIALS;
  const g = new THREE.Group();
  g.add(part(box, M.glove, 0.03, 0.085, 0.075, 0.03 * side, 0, 0.01));
  g.add(part(box, M.glove, 0.06, 0.07, 0.03, 0.0, -0.005, -0.035));
  for (let i = 0; i < 3; i++) g.add(part(box, M.knuckle, 0.062, 0.018, 0.012, 0, 0.022 - i * 0.022, -0.052));
  g.add(part(box, M.glove, 0.022, 0.022, 0.06, -0.026 * side, 0.03, -0.01, 0.3));
  g.add(part(cylinder, M.cuff, 0.04, 0.03, 0.04, 0.018 * side, -0.02, 0.06, Math.PI / 2 - 0.5));
  return g;
}

function supportHand(side = -1) {
  const M = ARM_MATERIALS;
  const g = new THREE.Group();
  g.add(part(box, M.glove, 0.07, 0.026, 0.085, 0, 0, 0));
  g.add(part(box, M.glove, 0.018, 0.05, 0.075, 0.04 * -side, 0.025, -0.005));
  for (let i = 0; i < 3; i++) g.add(part(box, M.knuckle, 0.012, 0.016, 0.02, 0.05 * -side, 0.045, -0.03 + i * 0.024));
  g.add(part(box, M.glove, 0.02, 0.045, 0.05, 0.04 * side, 0.02, 0.02));
  return g;
}

export function buildArms(cfg) {
  const M = ARM_MATERIALS;
  const group = new THREE.Group();
  const grip = new THREE.Vector3().fromArray(cfg?.grip ?? [-0.03, -0.09, 0]);

  const right = grippingHand(1);
  right.position.copy(grip);
  right.rotation.set(0.25, 0, -0.08);
  group.add(right);
  const rWrist = grip.clone().add(new THREE.Vector3(0.02, -0.035, 0.07));
  const rElbow = grip.clone().add(new THREE.Vector3(0.13, -0.26, 0.42));
  group.add(limb(rElbow, rWrist, 0.05, 0.034, M.sleeve));

  if (cfg?.fore) {
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

export function buildKnifeArm() {
  const M = ARM_MATERIALS;
  const group = new THREE.Group();
  const knife = new THREE.Group();
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(0.165, 0.004);
  shape.lineTo(0.19, 0.016);
  shape.lineTo(0.15, 0.028);
  shape.lineTo(0, 0.026);
  shape.lineTo(0, 0);
  const blade = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.004, bevelEnabled: false }), M.steel);
  blade.rotation.y = Math.PI / 2;
  blade.position.set(0.002, -0.013, -0.02);
  knife.add(blade);
  knife.add(part(box, M.handle, 0.024, 0.03, 0.022, 0, 0, -0.012));
  knife.add(part(box, M.handle, 0.02, 0.026, 0.11, 0, 0, 0.045));
  for (const m of knife.children) m.frustumCulled = false;
  const hand = grippingHand(1);
  hand.rotation.set(Math.PI / 2, 0, 0);
  hand.position.set(0, 0.0, 0.045);
  group.add(knife, hand);
  group.add(limb(new THREE.Vector3(0.12, -0.18, 0.42), new THREE.Vector3(0.015, -0.02, 0.1), 0.05, 0.034, M.sleeve));
  return group;
}

export function buildThrowArm() {
  const M = ARM_MATERIALS;
  const group = new THREE.Group();
  const hand = new THREE.Group();
  hand.add(part(box, M.glove, 0.075, 0.03, 0.085, 0, -0.045, 0));
  hand.add(part(box, M.glove, 0.02, 0.06, 0.07, 0.042, -0.02, 0));
  hand.add(part(box, M.glove, 0.02, 0.05, 0.05, -0.04, -0.015, 0.01));
  const slot = new THREE.Group();
  hand.add(slot);
  group.add(hand);
  group.add(limb(new THREE.Vector3(-0.16, -0.3, 0.36), new THREE.Vector3(-0.01, -0.07, 0.06), 0.05, 0.033, M.sleeve));
  group.userData.slot = slot;
  return group;
}
