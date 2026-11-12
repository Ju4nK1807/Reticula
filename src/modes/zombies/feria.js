import * as THREE from 'three';
import { withObb } from '../../physics/obb.js';
import { sign } from './sections.js';
import { circusMaterials, garland, hangGarlands, stripeMaterial } from './circo.js';

/*
  La Feria (sureste, la sección más cara): parque de diversiones abandonado con carrusel, rueda de la
  fortuna, puestos de juegos y la Casa de la Risa, una tarima de dos pisos. Se entra desde la Estación
  o desde la Iglesia.

  Segundo piso: la terraza de la Casa de la Risa (TARIMA, a DECK_H m) se sube por dos escaleras
  (RAMPS). La altura del piso la da ZombieMap.floorAt con `floors`: el jugador y los zombis la siguen
  (los zombis suben por las escaleras: la navegación es la misma cuadrícula, porque debajo de la terraza
  no se puede entrar). Los muros de la tarima siguen como barandal arriba, así que solo se sube y se
  baja por las escaleras (o saltando el barandal).
*/

export const FERIA = { minX: 28, maxX: 60, minZ: 30, maxZ: 60 };
export const DECK_H = 3.6;
// Terraza en la esquina sureste (contra los muros de la sección).
export const TARIMA = { minX: 45, maxX: 60, minZ: 45, maxZ: 60 };
// Escaleras: rect, eje en que suben y de dónde a dónde (de 0 a DECK_H; el último tramo es un descanso).
export const RAMPS = [
  { minX: 39, maxX: 45, minZ: 52, maxZ: 54.5, axis: 'x', from: 39, to: 44.4 }, // oeste, sube hacia +x
  { minX: 51, maxX: 53.5, minZ: 38, maxZ: 45, axis: 'z', from: 38, to: 44.4 }, // norte, sube hacia +z
];
const RAIL = 1.15; // alto del barandal sobre la terraza
const WALL_T = 0.4;

/** Pisos altos de la Feria para ZombieMap.floorAt. */
export function feriaFloors() {
  return [{ ...TARIMA, h: DECK_H }, ...RAMPS.map((r) => ({ ...r, h: DECK_H }))];
}

export function buildFeria(map, M) {
  const C = circusMaterials();
  const b = map.block.bind(map);
  const v = (x, y, z) => new THREE.Vector3(x, y, z);
  const stripesY = stripeMaterial(['#1f3f7a', '#b9a57f', '#8a1c1a', '#b9a57f'], 2.4, { seed: 19 });
  const T = TARIMA;

  // --- Casa de la Risa: la tarima de dos pisos -------------------------------------------------------
  // Muros de la base (lona) que siguen como barandal arriba: con hueco donde llega cada escalera.
  const rail = (x0, x1, z0, z1) => {
    const w = x1 - x0;
    const d = z1 - z0;
    const m = b(w, DECK_H, d, stripesY, (x0 + x1) / 2, (z0 + z1) / 2);
    map.colliders.at(-1).max.y = DECK_H + RAIL; // el barandal también frena (no las balas)
    // Barandal: pasamanos y balaustres (solo se ven).
    const top = Math.abs(w) > Math.abs(d) ? [w, 0.08, 0.1] : [0.1, 0.08, d];
    b(top[0], top[1], top[2], M.metal, (x0 + x1) / 2, (z0 + z1) / 2, DECK_H + RAIL - 0.08, false);
    b(top[0], top[1], top[2], M.metal, (x0 + x1) / 2, (z0 + z1) / 2, DECK_H + 0.5, false);
    const len = Math.max(w, d);
    for (let t = 0; t <= len + 0.01; t += 1.2) {
      const px = w > d ? x0 + t : (x0 + x1) / 2;
      const pz = w > d ? (z0 + z1) / 2 : z0 + t;
      b(0.07, RAIL, 0.07, M.metal, px, pz, DECK_H, false);
    }
    return m;
  };
  const west = RAMPS[0];
  const north = RAMPS[1];
  rail(T.minX - WALL_T / 2, T.minX + WALL_T / 2, T.minZ, west.minZ);
  rail(T.minX - WALL_T / 2, T.minX + WALL_T / 2, west.maxZ, T.maxZ);
  rail(T.minX - WALL_T / 2, north.minX, T.minZ - WALL_T / 2, T.minZ + WALL_T / 2);
  rail(north.maxX, T.maxX, T.minZ - WALL_T / 2, T.minZ + WALL_T / 2);
  // Piso de la terraza (tablones): frena granadas y casquillos; los zombis y la navegación lo ignoran
  // (está alto) y pisan con floorAt.
  b(T.maxX - T.minX, 0.3, T.maxZ - T.minZ, M.wood, (T.minX + T.maxX) / 2, (T.minZ + T.maxZ) / 2, DECK_H - 0.3);
  // Escaleras: peldaños (se ven y frenan balas, sin colisión: se pisa con floorAt), laterales con su
  // colisión invisible (como barandal) y pasamanos inclinado.
  for (const r of RAMPS) {
    const alongX = r.axis === 'x';
    const run = r.to - r.from;
    const steps = Math.round(DECK_H / 0.2);
    const width = alongX ? r.maxZ - r.minZ : r.maxX - r.minX;
    const mid = alongX ? (r.minZ + r.maxZ) / 2 : (r.minX + r.maxX) / 2;
    for (let i = 0; i < steps; i++) {
      const h = ((i + 1) / steps) * DECK_H;
      const at = r.from + (i + 0.5) * (run / steps);
      const len = run / steps + 0.02;
      const m = alongX ? b(len, h, width, M.wood, at, mid, 0, false) : b(width, h, len, M.wood, mid, at, 0, false);
      map.solids.push(m);
    }
    // Descanso arriba (hasta la terraza).
    const restLen = (alongX ? r.maxX : r.maxZ) - r.to;
    const rest = alongX ? b(restLen, DECK_H, width, M.wood, r.to + restLen / 2, mid, 0, false) : b(width, DECK_H, restLen, M.wood, mid, r.to + restLen / 2, 0, false);
    map.solids.push(rest);
    for (const s of [-1, 1]) {
      const sideAt = mid + s * (width / 2 + 0.1);
      const box = alongX ? new THREE.Box3(v(r.minX, 0, sideAt - 0.1), v(r.maxX, DECK_H + RAIL, sideAt + 0.1)) : new THREE.Box3(v(sideAt - 0.1, 0, r.minZ), v(sideAt + 0.1, DECK_H + RAIL, r.maxZ));
      map.colliders.push(box);
      // Pasamanos inclinado.
      const slope = Math.hypot(run, DECK_H);
      const hand = new THREE.Mesh(new THREE.BoxGeometry(alongX ? slope : 0.07, 0.07, alongX ? 0.07 : slope), M.metal);
      const c = r.from + run / 2;
      hand.position.set(alongX ? c : sideAt, DECK_H / 2 + 0.95, alongX ? sideAt : c);
      if (alongX) hand.rotation.z = Math.atan2(DECK_H, run);
      else hand.rotation.x = -Math.atan2(DECK_H, run);
      map.scene.add(hand);
      for (let k = 0; k <= 4; k++) {
        const t = k / 4;
        const px = alongX ? r.from + run * t : sideAt;
        const pz = alongX ? sideAt : r.from + run * t;
        b(0.06, 0.95, 0.06, M.metal, px, pz, DECK_H * t, false);
      }
    }
  }
  // Fachada: carteles de la Casa de la Risa (hacia el oeste y hacia el norte).
  sign(map, 'CASA DE LA RISA', '#ffcf5a', T.minX - WALL_T / 2 - 0.03, 2.4, 49, -Math.PI / 2, 3.2, 0.62);
  sign(map, 'CASA DE LA RISA', '#ffcf5a', 56.5, 2.4, T.minZ - WALL_T / 2 - 0.03, Math.PI, 3.2, 0.62);
  sign(map, 'SUBE SI TE ATREVES', '#ff5a5a', 47.6, DECK_H + 2.6, T.maxZ - 0.06, Math.PI, 3, 0.45);
  // Arriba: guirnaldas entre postes y una luz de feria (con la electricidad) más un foco rojo que
  // titila (batería).
  const poles = [v(T.minX + 0.4, 0, T.minZ + 0.4), v(T.maxX - 0.6, 0, T.minZ + 0.4), v(T.maxX - 0.6, 0, T.maxZ - 0.6), v(T.minX + 0.4, 0, T.maxZ - 0.6)];
  for (const p of poles) b(0.14, 3.2, 0.14, M.wood, p.x, p.z, DECK_H, false);
  let s = 23;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const items = { flags: [], bulbs: [], rope: [] };
  for (let i = 0; i < 4; i++) {
    const a = poles[i].clone().setY(DECK_H + 3.1);
    const c = poles[(i + 1) % 4].clone().setY(DECK_H + 3.1);
    items.rope.push(...garland(a, c, { sag: 0.7, flags: items.flags, bulbs: items.bulbs, rnd, dead: 0.35 }));
  }
  items.rope.push(...garland(poles[0].clone().setY(DECK_H + 3.1), poles[2].clone().setY(DECK_H + 3.1), { sag: 0.9, flags: items.flags, bulbs: items.bulbs, rnd, dead: 0.35 }));
  map.lights.add({ pos: v(52.5, DECK_H + 2.6, 52.5), color: '#ffd28a', intensity: 30, distance: 14, power: true });
  map.pools.push({ pos: v(52.5, DECK_H + 0.02, 52.5), radius: 5, color: '#ffcf8a', power: true });
  map.lights.add({ pos: v(46.5, DECK_H + 2.2, 58.5), color: '#ff3b3b', intensity: 8, distance: 8, power: false, flicker: 'broken' });

  // --- Carrusel ---------------------------------------------------------------------------------------
  const CX = 36.5;
  const CZ = 41;
  const disk = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 0.16, 32), C.red);
  disk.position.set(CX, 0.08, CZ);
  map.scene.add(disk);
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.9, 4, 16), C.gold);
  column.position.set(CX, 2, CZ);
  map.scene.add(column);
  map.solids.push(column);
  map.colliders.push(new THREE.Box3().setFromCenterAndSize(column.position, v(1.6, 4, 1.6)));
  const canopy = new THREE.Mesh(new THREE.ConeGeometry(4.6, 1.8, 24, 1, true), C.roof);
  canopy.position.set(CX, 4.9, CZ);
  map.scene.add(canopy);
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 4.6, 0.45, 24, 1, true), C.roofBlue);
  rim.position.set(CX, 3.8, CZ);
  map.scene.add(rim);
  // Caballitos en sus barras (uno caído): cuerpo, cuello y cabeza; frenan el paso (forma real).
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    const x = CX + Math.cos(a) * 2.7;
    const z = CZ + Math.sin(a) * 2.7;
    const ry = -a;
    const fallen = i === 4;
    const y = fallen ? 0.45 : 0.9 + (i % 2) * 0.35;
    const g = new THREE.Group();
    const add = (w, h, d, mat, px, py, pz) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(px, py, pz);
      g.add(m);
      return m;
    };
    add(0.34, 0.42, 1.05, i % 2 ? C.cream : M.wood, 0, y, 0);
    add(0.22, 0.5, 0.25, i % 2 ? C.cream : M.wood, 0, y + 0.35, 0.45);
    add(0.2, 0.22, 0.42, i % 2 ? C.cream : M.wood, 0, y + 0.6, 0.58);
    add(0.36, 0.08, 0.5, C.red, 0, y + 0.24, -0.05); // montura
    if (!fallen) add(0.05, 3.7, 0.05, C.gold, 0, 1.95, 0);
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    if (fallen) g.rotation.z = 1.2;
    map.flatten(g);
    map.colliders.push(withObb(new THREE.Box3(v(x - 0.6, 0, z - 0.6), v(x + 0.6, 1.6, z + 0.6)), x, z, 0.2, 0.55, ry));
  }

  // --- Rueda de la fortuna (detenida), contra el muro sur ------------------------------------------------
  const WX = 33;
  const WY = 7.6;
  const WZ = 58.6;
  const WR = 6.4;
  const wheel = new THREE.Group();
  const bar = (len, mat, x, y, ang, z = 0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(len, 0.14, 0.14), mat);
    m.position.set(x, y, z);
    m.rotation.z = ang;
    wheel.add(m);
  };
  for (const zOff of [-0.35, 0.35]) {
    for (let i = 0; i < 28; i++) {
      const a0 = (i / 28) * Math.PI * 2;
      const a1 = ((i + 1) / 28) * Math.PI * 2;
      const mx = (Math.cos(a0) + Math.cos(a1)) / 2;
      const my = (Math.sin(a0) + Math.sin(a1)) / 2;
      bar(WR * (a1 - a0) + 0.05, M.metal, mx * WR, my * WR, (a0 + a1) / 2 + Math.PI / 2, zOff);
    }
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      bar(WR, M.rust, (Math.cos(a) * WR) / 2, (Math.sin(a) * WR) / 2, a, zOff);
    }
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 1.1, 12), C.gold);
  hub.rotation.x = Math.PI / 2;
  wheel.add(hub);
  // Góndolas colgando (una sola, la de abajo, casi toca el suelo).
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.2;
    const gx = Math.cos(a) * WR;
    const gy = Math.sin(a) * WR - 0.9;
    const m = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.8, 0.9), i % 2 ? C.red : C.roofBlue);
    m.position.set(gx, gy, 0);
    m.rotation.z = (rnd() - 0.5) * 0.3;
    wheel.add(m);
  }
  wheel.position.set(WX, WY, WZ);
  map.flatten(wheel);
  // Patas en A (con su colisión al pie).
  for (const sx of [-3.6, 3.6]) {
    for (const sz of [-0.9, 0.9]) {
      const foot = v(WX + sx, 0, WZ + sz);
      const top = v(WX, WY, WZ + sz * 0.5);
      const len = foot.distanceTo(top);
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.22, len, 0.22), M.metal);
      leg.position.copy(foot).lerp(top, 0.5);
      leg.quaternion.setFromUnitVectors(v(0, 1, 0), top.clone().sub(foot).normalize());
      map.scene.add(leg);
    }
    map.colliders.push(new THREE.Box3(v(WX + sx - 0.4, 0, WZ - 1.1), v(WX + sx + 0.4, 2, WZ + 1.1)));
  }
  // Caseta de control de la rueda.
  b(1.6, 2.2, 1.4, stripesY, WX + 4.8, WZ - 0.4);

  // --- Puestos de juegos contra el muro norte (mostrador y toldo a rayas) ------------------------------------
  for (const [x, label] of [[31.5, 'TIRO AL PAYASO'], [46.5, 'PREMIOS']]) {
    const z = FERIA.minZ + 1.7;
    b(3.2, 1.0, 1.0, M.wood, x, z);
    for (const dx of [-1.55, 1.55]) b(0.1, 2.6, 0.1, M.wood, x + dx, z + 0.45, 0, false);
    const awning = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.4), C.roof);
    awning.position.set(x, 2.55, z + 0.4);
    awning.rotation.x = -Math.PI / 2 + 0.45;
    map.scene.add(awning);
    sign(map, label, '#ffcf5a', x, 2.0, z - 0.45, 0, 2.4, 0.4);
  }
  // Payasos de cartón (blancos de tiro) caídos en el mostrador.
  for (let i = 0; i < 3; i++) b(0.35, 0.55, 0.04, C.cream, 30.6 + i * 0.9, FERIA.minZ + 1.5, 1.0, false);

  // --- Postes con guirnaldas y luces de feria (con la electricidad) ----------------------------------------
  const lightPoles = [v(31, 0, 47), v(42, 0, 35), v(43, 0, 48.5), v(32.5, 0, 34)];
  for (const p of lightPoles) {
    b(0.2, 5, 0.2, M.wood, p.x, p.z);
    b(0.5, 0.25, 0.3, M.metal, p.x, p.z, 4.8, false);
  }
  const gItems = { flags: [], bulbs: [], rope: [] };
  for (const [a, c] of [[0, 2], [1, 2], [3, 1], [3, 0]]) {
    gItems.rope.push(...garland(lightPoles[a].clone().setY(4.9), lightPoles[c].clone().setY(4.9), { sag: 1, flags: gItems.flags, bulbs: gItems.bulbs, rnd, dead: 0.45 }));
  }
  gItems.rope.push(...garland(lightPoles[2].clone().setY(4.9), v(CX, 5.6, CZ), { sag: 0.6, flags: gItems.flags, bulbs: gItems.bulbs, rnd }));
  for (const k of ['flags', 'bulbs', 'rope']) items[k].push(...gItems[k]);
  hangGarlands(map, items);
  for (const [p, color] of [[v(37, 4.6, 46.5), '#ff8ab8'], [v(43, 4.6, 36), '#8ad8ff'], [v(31.5, 4.6, 52), '#ffd28a']]) {
    map.lights.add({ pos: p, color, intensity: 26, distance: 13, power: true });
    map.pools.push({ pos: p.clone().setY(0.02), radius: 4.5, color, power: true });
  }
  // Depósito de la feria: cajas apiladas en la esquina noreste (lejos de la puerta y de la entrada).
  for (const [x, z, s] of [[59.05, 31.1, 1.1], [59.2, 32.35, 0.8], [57.85, 31.0, 0.8]]) map.crate(x, z, s);
  map.fireBarrel(48.5, 41.5, M);
  map.fireBarrel(30, 44.5, M);
  sign(map, 'FERIA', '#ff5a8a', FERIA.minX + 0.03, 4.4, 34.5, Math.PI / 2, 2.6, 0.7);

  // Manchas: sangre, aceite y basura.
  for (const [x, z, sz, ry] of [[38, 47.5, 1.8, 0.3], [49, 36, 1.4, 2.2], [36, 57, 2, 1.1], [34, 53, 1.5, 0.6], [44.5, 42, 1.2, 2.7]]) map.decal('blood', x, z, sz, ry);
  for (const [x, z, sz, ry] of [[40, 33, 2.2, 0.8], [33, 49, 1.8, 2], [55.5, 34, 1.6, 0.2]]) map.decal('litter', x, z, sz, ry);
}
