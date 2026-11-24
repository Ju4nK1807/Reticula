import * as THREE from 'three';
import { glow, glowScale, paint } from '../../gfx/surfaces.js';
import { signTexture } from '../../gfx/canvasTextures.js';

const W = 1.2;
const H = 1.3;
const D = 0.82;
const BASE = 0.12;
const LOCKED = '#ff3030';
const OPEN = '#3dff8a';
const DOOR_OPEN = -1.25;
const _c = new THREE.Color();

let mats = null;
function materials() {
  mats ??= {
    steel: paint('#2b3038', { roughness: 0.34, metalness: 0.85 }),
    door: paint('#3b434d', { roughness: 0.28, metalness: 0.9 }),
    trim: paint('#8d949c', { roughness: 0.2, metalness: 1 }),
    brass: paint('#b68f3e', { roughness: 0.25, metalness: 1 }),
    base: paint('#16181b', { roughness: 0.6, metalness: 0.4 }),
    pad: paint('#111316', { roughness: 0.5, metalness: 0.3 }),
    keys: paint('#c9ccd0', { roughness: 0.4, metalness: 0.6 }),
  };
  return mats;
}

export function buildSafeModel() {
  const m = materials();
  const g = new THREE.Group();
  g.userData.dynamic = true;
  const part = (geo, mat, x, y, z, parent = g) => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  };
  part(new THREE.BoxGeometry(W + 0.1, BASE, D + 0.08), m.base, 0, BASE / 2, 0);
  const body = part(new THREE.BoxGeometry(W, H, D), m.steel, 0, BASE + H / 2, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) part(new THREE.BoxGeometry(0.06, H + 0.02, 0.06), m.trim, sx * (W / 2 - 0.02), BASE + H / 2, sz * (D / 2 - 0.02));
  part(new THREE.BoxGeometry(W + 0.02, 0.05, D + 0.02), m.trim, 0, BASE + H - 0.03, 0);

  const inner = new THREE.Group();
  inner.position.set(0, BASE + H / 2, D / 2 + 0.003);
  g.add(inner);
  part(new THREE.BoxGeometry(W - 0.16, H - 0.18, 0.004), m.pad, 0, 0, 0, inner);
  for (const y of [-0.22, 0.2]) part(new THREE.BoxGeometry(W - 0.2, 0.025, 0.01), m.trim, 0, y, 0.004, inner);
  const innerLight = glow(LOCKED);
  part(new THREE.BoxGeometry(W - 0.3, 0.02, 0.01), innerLight, 0, H / 2 - 0.14, 0.004, inner);

  const hinge = new THREE.Group();
  hinge.position.set(-W / 2 + 0.07, BASE + H / 2, D / 2 + 0.005);
  g.add(hinge);
  const DW = W - 0.14;
  const DH = H - 0.16;
  part(new THREE.BoxGeometry(DW, DH, 0.07), m.door, DW / 2, 0, 0.035, hinge);
  for (const y of [-DH / 2 + 0.18, DH / 2 - 0.18]) {
    part(new THREE.CylinderGeometry(0.035, 0.035, 0.16, 10), m.trim, -0.02, y, 0.04, hinge);
  }
  const wheel = new THREE.Group();
  wheel.position.set(DW / 2 + 0.16, -0.08, 0.1);
  hinge.add(wheel);
  part(new THREE.CylinderGeometry(0.05, 0.05, 0.06, 12), m.trim, 0, 0, 0, wheel).rotation.x = Math.PI / 2;
  for (let i = 0; i < 3; i++) {
    const spoke = new THREE.Group();
    spoke.rotation.z = (i * Math.PI * 2) / 3;
    wheel.add(spoke);
    part(new THREE.BoxGeometry(0.03, 0.2, 0.03), m.trim, 0, 0.1, 0, spoke);
    part(new THREE.SphereGeometry(0.03, 8, 6), m.brass, 0, 0.2, 0, spoke);
  }
  const dial = part(new THREE.CylinderGeometry(0.11, 0.12, 0.05, 24), m.brass, DW / 2 - 0.14, 0.2, 0.085, hinge);
  dial.rotation.x = Math.PI / 2;
  part(new THREE.TorusGeometry(0.135, 0.012, 6, 24), m.trim, DW / 2 - 0.14, 0.2, 0.08, hinge);
  part(new THREE.BoxGeometry(0.22, 0.3, 0.03), m.pad, DW / 2 + 0.18, 0.26, 0.085, hinge);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) part(new THREE.BoxGeometry(0.045, 0.035, 0.02), m.keys, DW / 2 + 0.12 + c * 0.06, 0.18 + (3 - r) * 0.045 - 0.06, 0.105, hinge);
  const led = glow(LOCKED);
  part(new THREE.BoxGeometry(0.17, 0.05, 0.02), led, DW / 2 + 0.18, 0.37, 0.105, hinge);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.15), new THREE.MeshBasicMaterial({ map: signTexture('CAJA FUERTE', '#e6c27a'), transparent: true, toneMapped: false }));
  sign.position.set(DW / 2 - 0.1, -DH / 2 + 0.14, 0.075);
  hinge.add(sign);
  const beamMat = new THREE.MeshBasicMaterial({ color: LOCKED, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 40, 12, 1, true), beamMat);
  beam.position.y = 20;
  beam.userData.noShadow = true;
  g.add(beam);

  let target = 0;
  let open = 0;
  return {
    group: g,
    body,
    led,
    beam,
    hinge,
    get color() {
      return target ? OPEN : LOCKED;
    },
    setLocked(locked) {
      target = locked ? 0 : 1;
      const col = locked ? LOCKED : OPEN;
      for (const mat of [led, innerLight]) {
        mat.userData.glow.set(col);
        mat.color.copy(_c.set(col)).multiplyScalar(glowScale());
      }
      beamMat.color.set(col);
      if (locked) {
        open = 0;
        hinge.rotation.y = 0;
      }
    },
    update(dt) {
      if (open === target) return;
      open = Math.min(target, open + dt * 0.9);
      hinge.rotation.y = DOOR_OPEN * open * open * (3 - 2 * open);
      wheel.rotation.z = -open * Math.PI * 1.5;
    },
  };
}

export const SAFE_COLORS = { locked: LOCKED, open: OPEN };
