import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { addHeightFog } from './atmosphere.js';
import { setZombieFace } from './zombieLook.js';

/*
  Disfraz de payaso de los zombis: las piezas con volumen (nariz roja, pelo de colores, sombrerito con
  pompón y gola alrededor del cuello). La pintura de la cara y el traje los pone el material
  (zombieLook.js).

  Al cargar el modelo se mide la cabeza en la pose de reposo (vértices que mueve el hueso de la cabeza):
  la punta de la nariz, el ancho y la altura. Las piezas se arman en ese espacio y se pasan una vez al
  del hueso (inversa de reposo · bind), así que se cuelgan del hueso y siguen la animación sin
  esqueleto propio. Si el zombi pierde la cabeza, el hueso se encoge y la nariz, el pelo y el sombrero
  se van con ella.

  Varias combinaciones ya armadas (colores de pelo, con o sin sombrero, pelo afro) y compartidas por
  todos los zombis: elegir una es cambiar la geometría. Un solo material con colores por vértice (sin
  sombreadores nuevos por variante). Son dos dibujos más por zombi.
*/

const HAIR = ['#a8400c', '#2c7426', '#8a0f0f', '#552784', '#1d4b9a', '#b08a14'];
const HATS = ['#7a1612', '#1c3a7a', '#1f5a2a', '#3e2366'];
const RUFFS = ['#b2ab9a', '#b2ab9a', '#8a1a16', '#a08a2a'];
const KITS = 10;

let kit = null;

// Pieza con un color (sin UVs, no indexada: así se unen todas).
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

// Caja y punta de la nariz de los vértices que mueve sobre todo el hueso `bone`.
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

// De la pose de reposo (espacio de la geometría) al espacio del hueso.
const boneSpace = (mesh, bone) => new THREE.Matrix4().multiplyMatrices(mesh.skeleton.boneInverses[mesh.skeleton.bones.indexOf(bone)], mesh.bindMatrix);

function headKit(h, rnd, hair, hat, afro) {
  const { min, max } = h.box;
  const w = max.x - min.x;
  const d = max.z - min.z;
  const hh = max.y - min.y;
  const cx = (min.x + max.x) / 2;
  const cz = (min.z + max.z) / 2;
  const parts = [];
  // Nariz roja (un poco brillante: es plástico).
  const nr = w * 0.17;
  parts.push(piece(new THREE.SphereGeometry(1, 12, 8), '#9a0b0b', at(h.nose.x, h.nose.y, h.nose.z + nr * 0.35, nr)));
  // Pelo: matas a los lados y atrás (o por toda la cabeza: afro), apelmazado y sucio.
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
  // Sombrerito cónico torcido con pompón.
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

// Gola: aro ancho y aplanado con pliegues (ondas) alrededor de la base del cuello.
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

/**
 * Prepara el disfraz a partir de la plantilla cargada (una vez). Devuelve null si el modelo no tiene
 * los huesos esperados (los zombis siguen igual, sin piezas).
 */
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
  // Punta de la nariz: lo más adelantado cerca del eje, en la mitad de la cara.
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
  kit = { heads, ruffs, material };
  return kit;
}

/** Piezas de un zombi: { head, ruff } (mallas para colgar de sus huesos) y `pick` para cambiarlas. */
export function clownPieces(k) {
  const head = new THREE.Mesh(k.heads[0], k.material);
  const ruffMesh = k.ruffs.length ? new THREE.Mesh(k.ruffs[0], k.material) : null;
  // Las geometrías están en el espacio del hueso: su esfera de recorte sigue a la animación.
  for (const m of [head, ruffMesh]) if (m) m.castShadow = false;
  return {
    head,
    ruff: ruffMesh,
    pick(rng = Math.random) {
      head.geometry = k.heads[Math.floor(rng() * k.heads.length)];
      if (ruffMesh) {
        ruffMesh.visible = rng() < 0.75;
        ruffMesh.geometry = k.ruffs[Math.floor(rng() * k.ruffs.length)];
      }
    },
  };
}
