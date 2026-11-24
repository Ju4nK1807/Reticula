import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { addHeightFog } from './atmosphere.js';
import { setZombieFace } from './zombieLook.js';

const HAIR = ['#a8400c', '#2c7426', '#8a0f0f', '#552784', '#1d4b9a', '#b08a14'];
const HATS = ['#7a1612', '#1c3a7a', '#1f5a2a', '#3e2366'];
const RUFFS = ['#b2ab9a', '#b2ab9a', '#8a1a16', '#a08a2a'];
const KITS = 10;

let kit = null;

function piece(geo, color, matrix) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('uv');
  if (matrix) g.applyMatrix4(matrix);
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

const at = (x, y, z, sx = 1, sy = sx, sz = sx) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(sx, sy, sz));

function measure(mesh, bone) {
  const geo = mesh.geometry;
  const bi = mesh.skeleton.bones.indexOf(bone);
  if (bi < 0) return null;
  const pos = geo.attributes.position;
  const idx = geo.attributes.skinIndex;
  const wt = geo.attributes.skinWeight;
  const box = new THREE.Box3();
  const pts = [];
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    let w = 0;
    for (let k = 0; k < 4; k++) if (idx.getComponent(i, k) === bi) w += wt.getComponent(i, k);
    if (w < 0.5) continue;
    v.fromBufferAttribute(pos, i);
    box.expandByPoint(v);
    pts.push(v.clone());
  }
  return pts.length > 20 ? { box, pts } : null;
}

const boneSpace = (mesh, bone) => new THREE.Matrix4().multiplyMatrices(mesh.skeleton.boneInverses[mesh.skeleton.bones.indexOf(bone)], mesh.bindMatrix);

function headKit(h, rnd, hair, hat, afro) {
  const { min, max } = h.box;
  const w = max.x - min.x;
  const d = max.z - min.z;
  const hh = max.y - min.y;
  const cx = (min.x + max.x) / 2;
  const cz = (min.z + max.z) / 2;
  const parts = [];
  const nr = w * 0.17;
  parts.push(piece(new THREE.SphereGeometry(1, 12, 8), '#9a0b0b', at(h.nose.x, h.nose.y, h.nose.z + nr * 0.35, nr)));
  const puff = new THREE.IcosahedronGeometry(1, 1);
  const hairCol = new THREE.Color(hair).multiplyScalar(0.75);
  const add = (x, y, z, r) => parts.push(piece(puff.clone(), hairCol, at(x, y, z, r, r * 0.85, r)));
  for (const side of [-1, 1]) {
    for (let i = 0; i < 5; i++) {
      add(cx + side * (w * 0.5 + rnd() * w * 0.12), min.y + hh * (0.5 + rnd() * 0.25), cz - d * (rnd() * 0.35), w * (0.17 + rnd() * 0.1));
    }
  }
  for (let i = 0; i < 4; i++) add(cx + (rnd() - 0.5) * w * 0.7, min.y + hh * (0.55 + rnd() * 0.2), min.z + d * 0.08, w * (0.16 + rnd() * 0.08));
  if (afro) {
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      add(cx + Math.cos(a) * w * 0.32, max.y - hh * 0.06 + rnd() * hh * 0.08, cz + Math.sin(a) * d * 0.3 - d * 0.08, w * (0.22 + rnd() * 0.08));
    }
  }
  if (hat) {
    const hr = w * 0.26;
    const hH = hh * 0.6;
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.15, 0, (rnd() - 0.5) * 0.7));
    const base = new THREE.Vector3(cx + (rnd() - 0.5) * w * 0.2, max.y - hh * (afro ? -0.02 : 0.08), cz - d * 0.05);
    const m = new THREE.Matrix4().compose(base.clone().add(new THREE.Vector3(0, hH / 2, 0).applyQuaternion(q)), q, new THREE.Vector3(1, 1, 1));
    parts.push(piece(new THREE.ConeGeometry(hr, hH, 12, 1, true), hat, m));
    const tip = base.clone().add(new THREE.Vector3(0, hH, 0).applyQuaternion(q));
    parts.push(piece(puff.clone(), '#b8b2a2', at(tip.x, tip.y, tip.z, w * 0.1)));
  }
  return mergeGeometries(parts, false);
}

const HAIR_NATURAL = ['#17120e', '#2e2117', '#55391f', '#8c7148', '#77746c', '#3a1e12'];
const HARD_HATS = ['#d8a612', '#d0641a', '#c8c8c0', '#2a5aa0'];
const FIRE_HELMETS = ['#7a1210', '#1a1a1a', '#b8941a'];
const CAPS = ['#7a1612', '#1c3a7a', '#2a2a2a', '#3a5a2a'];
const BEANIES = ['#2a2a2e', '#4a1a1a', '#2a3a4a'];
const SCRUB_CAPS = ['#2a6a6a', '#3a5a8a'];

function dome(h, { sx, sy, sz, y, z = 0, cut = 0.5, tilt = 0 }) {
  const { min, max } = h.box;
  const w = max.x - min.x;
  const d = max.z - min.z;
  const hh = max.y - min.y;
  const geo = new THREE.SphereGeometry(1, 18, 10, 0, Math.PI * 2, 0, Math.PI * cut);
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3((min.x + max.x) / 2, max.y - hh * y, (min.z + max.z) / 2 + d * z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt, 0, 0)),
    new THREE.Vector3(w * sx, hh * sy, d * sz),
  );
  return { geo, m };
}

function citizenHead(h, rnd, style, color) {
  const { min, max } = h.box;
  const w = max.x - min.x;
  const d = max.z - min.z;
  const hh = max.y - min.y;
  const cx = (min.x + max.x) / 2;
  const cz = (min.z + max.z) / 2;
  const parts = [];
  const put = ({ geo, m }, c) => parts.push(piece(geo, c, m));
  const hair = (c, long = false) => {
    const cap = dome(h, { sx: 0.58, sy: 0.44, sz: 0.6, y: 0.36, z: -0.05, cut: 0.56, tilt: -0.32 });
    const p = cap.geo.attributes.position;
    const seed = rnd() * 100;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const y = p.getY(i);
      const z = p.getZ(i);
      const n = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + seed) * 43758.5453;
      const k = 1 + (n - Math.floor(n) - 0.5) * 0.32 * Math.min(1, y * 3);
      p.setXYZ(i, x * k, y * k, z * k);
    }
    put(cap, new THREE.Color(c).multiplyScalar(0.7));
    const tuft = new THREE.IcosahedronGeometry(1, 0);
    for (let i = 0; i < 7; i++) {
      const r = w * (0.1 + rnd() * 0.07);
      const a = rnd() * Math.PI * 2;
      parts.push(piece(tuft.clone(), new THREE.Color(c).multiplyScalar(0.6 + rnd() * 0.2), at(cx + Math.cos(a) * w * 0.26, max.y - hh * (0.04 + rnd() * 0.1), cz - d * 0.1 + Math.sin(a) * d * 0.26, r, r * 0.7, r)));
    }
    if (long) {
      const puff = new THREE.IcosahedronGeometry(1, 1);
      for (let i = 0; i < 7; i++) {
        const r = w * (0.2 + rnd() * 0.06);
        parts.push(piece(puff.clone(), new THREE.Color(c).multiplyScalar(0.8), at(cx + (i / 6 - 0.5) * w * 0.8, min.y + hh * (0.32 + rnd() * 0.2), min.z + d * 0.12, r, r * 1.3, r * 0.7)));
      }
    }
  };
  if (style === 'hair' || style === 'long') hair(color, style === 'long');
  else if (style === 'police') {
    hair(HAIR_NATURAL[Math.floor(rnd() * 3)]);
    parts.push(piece(new THREE.CylinderGeometry(w * 0.5, w * 0.47, hh * 0.18, 18), color, at(cx, max.y - hh * 0.04, cz - d * 0.04)));
    parts.push(piece(new THREE.CylinderGeometry(w * 0.64, w * 0.58, hh * 0.07, 18), color, at(cx, max.y + hh * 0.08, cz - d * 0.06, 1, 1, d / w)));
    const visor = new THREE.Matrix4().compose(new THREE.Vector3(cx, max.y - hh * 0.12, cz + d * 0.42), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.35, 0, 0)), new THREE.Vector3(1, 1, 1));
    parts.push(piece(new THREE.BoxGeometry(w * 0.72, 0.6, d * 0.3), '#0b0b0d', visor));
    parts.push(piece(new THREE.BoxGeometry(w * 0.16, hh * 0.08, 0.8), '#b08a2a', at(cx, max.y + hh * 0.0, cz + d * 0.43)));
  } else if (style === 'hardhat') {
    put(dome(h, { sx: 0.64, sy: 0.4, sz: 0.68, y: 0.22, cut: 0.5 }), color);
    parts.push(piece(new THREE.CylinderGeometry(w * 0.72, w * 0.72, 0.9, 20), color, at(cx, max.y - hh * 0.22, cz + d * 0.06, 1, 1, (d / w) * 1.05)));
    parts.push(piece(new THREE.BoxGeometry(w * 0.12, hh * 0.06, d * 1.2), color, at(cx, max.y + hh * 0.14, cz)));
  } else if (style === 'fire') {
    put(dome(h, { sx: 0.64, sy: 0.42, sz: 0.68, y: 0.2, cut: 0.5 }), color);
    parts.push(piece(new THREE.CylinderGeometry(w * 0.64, w * 0.66, 0.9, 20), color, at(cx, max.y - hh * 0.2, cz - d * 0.14, 1, 1, (d / w) * 1.12)));
    parts.push(piece(new THREE.BoxGeometry(w * 0.26, hh * 0.14, 0.8), '#b8941a', at(cx, max.y + hh * 0.08, cz + d * 0.5)));
  } else if (style === 'cap') {
    hair(HAIR_NATURAL[Math.floor(rnd() * HAIR_NATURAL.length)]);
    put(dome(h, { sx: 0.6, sy: 0.34, sz: 0.64, y: 0.2, cut: 0.5, tilt: -0.1 }), color);
    const visor = new THREE.Matrix4().compose(new THREE.Vector3(cx, max.y - hh * 0.2, cz + d * 0.56), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.12, 0, 0)), new THREE.Vector3(1, 1, 1));
    parts.push(piece(new THREE.BoxGeometry(w * 0.62, 0.7, d * 0.42), color, visor));
  } else if (style === 'beanie' || style === 'scrub') {
    const scrub = style === 'scrub';
    put(dome(h, { sx: 0.6, sy: scrub ? 0.38 : 0.5, sz: 0.63, y: scrub ? 0.3 : 0.26, cut: 0.52, tilt: -0.15 }), color);
    if (!scrub) parts.push(piece(new THREE.TorusGeometry(w * 0.56, 1.4, 6, 20).rotateX(Math.PI / 2), new THREE.Color(color).multiplyScalar(0.8), at(cx, max.y - hh * 0.26, cz, 1, 1, (d / w) * 1.02)));
  }
  if (!parts.length) parts.push(piece(new THREE.BoxGeometry(0.01, 0.01, 0.01), '#000000', at(cx, max.y - hh * 0.5, cz)));
  return mergeGeometries(parts, false);
}

function citizenHeads(h, rnd, toHead) {
  const make = (style, colors) => colors.map((c) => citizenHead(h, rnd, style, c).applyMatrix4(toHead));
  return {
    hair: make('hair', HAIR_NATURAL),
    long: make('long', HAIR_NATURAL.slice(0, 4)),
    bald: make('bald', ['#000000']),
    police: make('police', ['#141c2e', '#1a2338']),
    hardhat: make('hardhat', HARD_HATS),
    fire: make('fire', FIRE_HELMETS),
    cap: make('cap', CAPS),
    beanie: make('beanie', BEANIES),
    scrub: make('scrub', SCRUB_CAPS),
  };
}

const HEADWEAR = {
  rags: { hair: 2, long: 1, beanie: 1.5, bald: 1 },
  office: { hair: 4, long: 1.5, bald: 1 },
  police: { police: 4, hair: 1 },
  medic: { scrub: 2, hair: 2, long: 1.5 },
  worker: { hardhat: 5, cap: 1, hair: 0.6 },
  jogger: { cap: 2, beanie: 1, hair: 2, long: 1 },
  firefighter: { fire: 5, hair: 0.6 },
};

function ruff(n, color) {
  const { min, max } = n.box;
  const cx = (min.x + max.x) / 2;
  const cz = (min.z + max.z) / 2;
  const r = Math.max(max.x - min.x, max.z - min.z) / 2 + 2.5;
  const geo = new THREE.TorusGeometry(r, 3.4, 6, 40);
  geo.rotateX(Math.PI / 2);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    const a = Math.atan2(z, x);
    const k = 1 + 0.16 * Math.sin(a * 16);
    p.setXYZ(i, x * k, p.getY(i) * 0.6 * (1 + 0.5 * Math.cos(a * 16)), z * k);
  }
  geo.computeVertexNormals();
  return piece(geo, color, at(cx, min.y + 1.5, cz));
}

export function prepareClownKit(scene) {
  if (kit) return kit;
  let mesh = scene.getObjectByName('Zombie');
  if (!mesh?.isSkinnedMesh) scene.traverse((o) => (mesh = mesh?.isSkinnedMesh ? mesh : o.isSkinnedMesh ? o : mesh));
  const head = mesh?.skeleton.getBoneByName('Head');
  if (!head) return null;
  scene.updateMatrixWorld(true);
  const h = measure(mesh, head);
  if (!h) return null;
  const { min, max } = h.box;
  const w = max.x - min.x;
  const cx = (min.x + max.x) / 2;
  h.nose = h.pts.filter((p) => Math.abs(p.x - cx) < w * 0.08 && p.y > min.y + (max.y - min.y) * 0.3 && p.y < min.y + (max.y - min.y) * 0.75).reduce((a, p) => (!a || p.z > a.z ? p : a), null);
  if (!h.nose) return null;
  setZombieFace({ nose: h.nose, width: w, bottom: min.y, top: max.y, centerZ: (min.z + max.z) / 2 });
  let s = 11;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const toHead = boneSpace(mesh, head);
  const heads = [];
  for (let i = 0; i < KITS; i++) heads.push(headKit(h, rnd, HAIR[i % HAIR.length], i % 3 === 1 ? HATS[i % HATS.length] : null, i % 4 === 3).applyMatrix4(toHead));
  const neckBone = mesh.skeleton.getBoneByName('Neck');
  const n = neckBone && measure(mesh, neckBone);
  const ruffs = n ? RUFFS.map((c) => ruff(n, c).applyMatrix4(boneSpace(mesh, neckBone))) : [];
  const material = addHeightFog(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0 }));
  const citizen = citizenHeads(h, rnd, toHead);
  kit = { heads, ruffs, citizen, material };
  return kit;
}

export function clownPieces(k) {
  const head = new THREE.Mesh(k.heads[0], k.material);
  const ruffMesh = k.ruffs.length ? new THREE.Mesh(k.ruffs[0], k.material) : null;
  for (const m of [head, ruffMesh]) if (m) m.castShadow = false;
  return {
    head,
    ruff: ruffMesh,
    pick(rng = Math.random, outfit = 'clown') {
      const odds = HEADWEAR[outfit];
      if (!odds || !k.citizen) {
        head.geometry = k.heads[Math.floor(rng() * k.heads.length)];
        if (ruffMesh) {
          ruffMesh.visible = rng() < 0.75;
          ruffMesh.geometry = k.ruffs[Math.floor(rng() * k.ruffs.length)];
        }
        return;
      }
      const total = Object.values(odds).reduce((s, w) => s + w, 0);
      let r = rng() * total;
      let style = 'hair';
      for (const [id, w] of Object.entries(odds)) if ((r -= w) < 0) {
        style = id;
        break;
      }
      const list = k.citizen[style];
      head.geometry = list[Math.floor(rng() * list.length)];
      if (ruffMesh) ruffMesh.visible = false;
    },
  };
}
