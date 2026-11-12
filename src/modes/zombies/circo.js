import * as THREE from 'three';
import { glow } from '../../gfx/surfaces.js';
import { sign } from './sections.js';

/*
  El Circo: el cuarto de inicio del modo zombi es una carpa de circo abandonada. Muros de lona a rayas
  rojas y crema, techo de carpa a rayas que sube hasta una cumbrera con dos mástiles, pista con aserrín
  y su borde, banderines y guirnaldas de focos de colores (unos pocos funcionan), pedestales de los
  animales y carteles despintados. Todo estático (se une por material) salvo los carteles.

  El cuarto (ventanas tapiadas por donde entra la horda y las puertas) lo arma ZombieMap.lobby con la
  lona de `circusMaterials` en vez del revoque.
*/

// Lona a rayas verticales con mugre (manchas, chorreados y desgaste), en una textura de canvas.
function stripeTexture(colors, { size = 256, grime = 0.5, seed = 3 } = {}) {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const w = size / colors.length;
  colors.forEach((col, i) => {
    g.fillStyle = col;
    g.fillRect(i * w, 0, w + 1, size);
  });
  let s = seed;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  // Costuras entre franjas.
  g.fillStyle = 'rgba(0,0,0,0.25)';
  for (let i = 0; i <= colors.length; i++) g.fillRect(i * w - 1, 0, 2, size);
  // Mugre: manchas oscuras y chorreados de arriba hacia abajo.
  for (let i = 0; i < 40 * grime; i++) {
    const x = rnd() * size;
    const y = rnd() * size;
    const r = 6 + rnd() * 26;
    const sp = g.createRadialGradient(x, y, 0, x, y, r);
    sp.addColorStop(0, `rgba(25,18,10,${0.25 + rnd() * 0.3})`);
    sp.addColorStop(1, 'rgba(25,18,10,0)');
    g.fillStyle = sp;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  for (let i = 0; i < 18 * grime; i++) {
    const x = rnd() * size;
    const len = size * (0.2 + rnd() * 0.6);
    const grad = g.createLinearGradient(0, 0, 0, len);
    grad.addColorStop(0, 'rgba(20,14,8,0.4)');
    grad.addColorStop(1, 'rgba(20,14,8,0)');
    g.fillStyle = grad;
    g.fillRect(x, 0, 1 + rnd() * 3, len);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

/** Lona a rayas para muros (UVs en metros: `tile` m por par de franjas). */
export function stripeMaterial(colors, tile = 1.6, opts = {}) {
  const mat = new THREE.MeshStandardMaterial({ map: stripeTexture(colors, opts), roughness: 0.92, metalness: 0, side: opts.side ?? THREE.FrontSide });
  mat.userData.tile = tile;
  return mat;
}

let shared = null;
/** Materiales del circo (compartidos con la Feria). */
export function circusMaterials() {
  shared ??= {
    canvas: stripeMaterial(['#8a1c1a', '#b9a57f'], 1.6, { seed: 3 }),
    roof: stripeMaterial(['#951f1c', '#b88a1e'], 1, { seed: 7, side: THREE.DoubleSide }),
    roofBlue: stripeMaterial(['#1f3f7a', '#b9a57f'], 1, { seed: 11, side: THREE.DoubleSide }),
    sawdust: new THREE.MeshStandardMaterial({ color: '#7a5f3a', roughness: 1, metalness: 0 }),
    red: new THREE.MeshStandardMaterial({ color: '#7d1715', roughness: 0.6, metalness: 0.1 }),
    cream: new THREE.MeshStandardMaterial({ color: '#b5a17c', roughness: 0.7, metalness: 0 }),
    gold: new THREE.MeshStandardMaterial({ color: '#a07a22', roughness: 0.45, metalness: 0.6 }),
    flags: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, side: THREE.DoubleSide }),
    bulbs: ['#ffcf6a', '#ff5a6e', '#6ad0ff', '#9dff7a'].map((c) => glow(c)),
    dead: new THREE.MeshStandardMaterial({ color: '#2a2622', roughness: 0.5, metalness: 0.2 }),
  };
  return shared;
}

const FLAG_COLORS = ['#a3201c', '#c7a12a', '#1f4f9a', '#2f7a34', '#c8bfa8', '#6a2a8a'].map((c) => new THREE.Color(c));

/**
 * Banderines y focos colgados entre dos puntos (catenaria). Devuelve las geometrías: los banderines
 * (con color por vértice) se juntan en `flags` y los focos en `bulbs[color]`.
 */
export function garland(a, b, { sag = 0.6, every = 0.55, flags, bulbs, bulbEvery = 2, dead = 0.5, rnd = Math.random }) {
  const len = a.distanceTo(b);
  const n = Math.max(2, Math.round(len / every));
  const dir = b.clone().sub(a).setY(0).normalize();
  const side = new THREE.Vector3(-dir.z, 0, dir.x);
  const at = (t) => a.clone().lerp(b, t).add(new THREE.Vector3(0, -sag * 4 * t * (1 - t), 0));
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const p = at(t);
    if (flags && i % bulbEvery !== 0) {
      // Banderín triangular colgando de la cuerda (algunos rotos: más cortos).
      const h = 0.32 * (rnd() < 0.15 ? 0.55 : 1);
      const half = (every * 0.42) / 2;
      const p0 = p.clone().addScaledVector(dir, -half);
      const p1 = p.clone().addScaledVector(dir, half);
      const p2 = p.clone().add(new THREE.Vector3(0, -h, 0)).addScaledVector(side, (rnd() - 0.5) * 0.08);
      const col = FLAG_COLORS[Math.floor(rnd() * FLAG_COLORS.length)];
      flags.push([p0, p1, p2, col]);
    } else if (bulbs) {
      bulbs.push([p.clone().add(new THREE.Vector3(0, -0.08, 0)), rnd() < dead ? -1 : Math.floor(rnd() * 4)]);
    }
  }
  // La cuerda: segmentos finos.
  const rope = [];
  for (let i = 0; i < 10; i++) rope.push([at(i / 10), at((i + 1) / 10)]);
  return rope;
}

/** Pasa banderines, focos y cuerdas a la escena (pocas mallas: se unen por material). */
export function hangGarlands(map, items) {
  const C = circusMaterials();
  const flagPos = [];
  const flagCol = [];
  for (const [p0, p1, p2, col] of items.flags) {
    flagPos.push(...p0.toArray(), ...p1.toArray(), ...p2.toArray());
    for (let k = 0; k < 3; k++) flagCol.push(col.r, col.g, col.b);
  }
  if (flagPos.length) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(flagPos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(flagCol, 3));
    geo.computeVertexNormals();
    map.scene.add(new THREE.Mesh(geo, C.flags));
  }
  const bulbGeo = new THREE.SphereGeometry(0.06, 6, 4);
  for (const [p, k] of items.bulbs) {
    const m = new THREE.Mesh(bulbGeo, k < 0 ? C.dead : C.bulbs[k]);
    m.position.copy(p);
    map.scene.add(m);
  }
  const up = new THREE.Vector3(0, 1, 0);
  for (const [a, b] of items.rope) {
    const len = a.distanceTo(b);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, len, 3), C.dead);
    m.position.copy(a).lerp(b, 0.5);
    m.quaternion.setFromUnitVectors(up, b.clone().sub(a).normalize());
    map.scene.add(m);
  }
}

// Techo de carpa: cada faldón va de un alero (recto, a la altura de los muros) a la cumbrera, en tiras
// angostas con sus UVs (las rayas convergen hacia arriba, como en una carpa de verdad).
function roofFace(pos, uv, eaveA, eaveB, ridgeA, ridgeB, strips) {
  const span = eaveA.distanceTo(eaveB);
  for (let i = 0; i < strips; i++) {
    const t0 = i / strips;
    const t1 = (i + 1) / strips;
    const e0 = eaveA.clone().lerp(eaveB, t0);
    const e1 = eaveA.clone().lerp(eaveB, t1);
    const r0 = ridgeA.clone().lerp(ridgeB, t0);
    const r1 = ridgeA.clone().lerp(ridgeB, t1);
    const u0 = t0 * span;
    const u1 = t1 * span;
    const slope = e0.distanceTo(r0);
    for (const [p, u, v] of [[e0, u0, 0], [e1, u1, 0], [r1, u1, slope], [e0, u0, 0], [r1, u1, slope], [r0, u0, slope]]) {
      pos.push(p.x, p.y, p.z);
      uv.push(u, v / 3);
    }
  }
}

/**
 * Viste el cuarto de inicio (rect = { minX, maxX, minZ, maxZ, wallH }) como la carpa. `spawn`: dónde
 * aparece el jugador (el centro de la pista queda libre).
 */
export function buildCircus(map, rect, spawn) {
  const C = circusMaterials();
  const b = map.block.bind(map);
  const r = rect;
  const cx = (r.minX + r.maxX) / 2;
  const cz = (r.minZ + r.maxZ) / 2;
  const eave = r.wallH;
  const ridgeY = eave + 4.6;
  const ridgeHalf = (r.maxX - r.minX) / 2 - 6;
  const o = 0.45; // alero
  const v = (x, y, z) => new THREE.Vector3(x, y, z);
  const E = { nw: v(r.minX - o, eave, r.minZ - o), ne: v(r.maxX + o, eave, r.minZ - o), sw: v(r.minX - o, eave, r.maxZ - 0.1), se: v(r.maxX + o, eave, r.maxZ - 0.1) };
  const R = { w: v(cx - ridgeHalf, ridgeY, cz), e: v(cx + ridgeHalf, ridgeY, cz) };

  // Techo: cuatro faldones a rayas.
  const pos = [];
  const uv = [];
  roofFace(pos, uv, E.nw, E.ne, R.w, R.e, 40);
  roofFace(pos, uv, E.se, E.sw, R.e, R.w, 40);
  roofFace(pos, uv, E.sw, E.nw, R.w, R.w, 16);
  roofFace(pos, uv, E.ne, E.se, R.e, R.e, 16);
  const roofGeo = new THREE.BufferGeometry();
  roofGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  roofGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  roofGeo.computeVertexNormals();
  const roof = new THREE.Mesh(roofGeo, C.roof);
  map.scene.add(roof);
  // Faldón con flecos (triángulos colgando del alero, por dentro y por fuera).
  const fringe = [];
  const corners = [E.nw, E.ne, E.se, E.sw, E.nw];
  for (let k = 0; k < 4; k++) {
    const a = corners[k];
    const c = corners[k + 1];
    const n = Math.round(a.distanceTo(c) / 0.6);
    for (let i = 0; i < n; i++) {
      const p0 = a.clone().lerp(c, i / n);
      const p1 = a.clone().lerp(c, (i + 1) / n);
      const p2 = p0.clone().lerp(p1, 0.5).add(v(0, -0.5, 0));
      fringe.push([p0, p1, p2, FLAG_COLORS[i % 2 ? 1 : 0]]);
    }
  }
  // Mástiles en los extremos de la cumbrera, con una bandera arriba (por fuera).
  for (const p of [R.w, R.e]) {
    b(0.22, ridgeY + 1.6, 0.22, C.red, p.x, p.z);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.5), C.roofBlue);
    flag.position.set(p.x + 0.45, ridgeY + 1.3, p.z);
    map.scene.add(flag);
  }

  // Lona en el muro del fondo (es la fachada de un edificio): paneles finos sin colisión, sin tapar el
  // callejón de la Iglesia ni el arma de la pared.
  const backZ = r.maxZ - 0.015;
  for (const [x0, x1] of [[r.minX, -0.2], [4.2, r.maxX]]) b(x1 - x0, eave, 0.02, C.canvas, (x0 + x1) / 2, backZ, 0, false);

  // Pista: aserrín y borde a franjas rojas y blancas (bajo: se pisa por encima).
  const ring = new THREE.Mesh(new THREE.CircleGeometry(3.3, 40), C.sawdust);
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(spawn.x, 0.03, spawn.z);
  ring.userData.ground = true;
  map.scene.add(ring);
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const seg = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.14, 0.22), i % 2 ? C.cream : C.red);
    seg.position.set(spawn.x + Math.cos(a) * 3.4, 0.07, spawn.z + Math.sin(a) * 3.4);
    seg.rotation.y = -a + Math.PI / 2;
    map.scene.add(seg);
  }
  // Pedestales de los animales (tambores rojos con borde dorado) y una pelota a rayas.
  const drum = (x, z, rad, h) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad * 1.08, h, 18), C.red);
    m.position.set(x, h / 2, z);
    map.scene.add(m);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(rad * 1.04, rad * 1.04, 0.07, 18), C.gold);
    top.position.set(x, h - 0.02, z);
    map.scene.add(top);
    map.solids.push(m);
    map.colliders.push(new THREE.Box3().setFromCenterAndSize(v(x, h / 2, z), v(rad * 1.6, h, rad * 1.6)));
  };
  drum(spawn.x - 2.2, spawn.z + 1.9, 0.55, 0.75);
  drum(spawn.x + 2.4, spawn.z - 1.6, 0.48, 0.6);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.55, 18, 12), C.roofBlue);
  ball.position.set(spawn.x + 2.0, 0.55, spawn.z + 2.1);
  ball.rotation.set(0.4, 0.2, 0.9);
  map.scene.add(ball);
  map.solids.push(ball);
  map.colliders.push(new THREE.Box3().setFromCenterAndSize(ball.position, v(0.9, 1.1, 0.9)));
  // Banco de madera volcado y una escalera de trapecio contra el muro oeste.
  b(2.4, 0.45, 0.5, map.materials.wood, r.minX + 1.4, r.maxZ - 1.4);
  b(0.12, 4.2, 0.6, map.materials.wood, r.minX + 0.6, r.minZ + 2.6, 0, false);

  // Guirnaldas desde la cumbrera a los muros: banderines y focos (algunos funcionan).
  let s = 5;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const items = { flags: [...fringe], bulbs: [], rope: [] };
  const top = (t) => R.w.clone().lerp(R.e, t).add(v(0, -0.25, 0));
  for (const [t, to] of [[0, v(r.minX + 0.4, eave - 0.3, r.minZ + 0.6)], [1, v(r.maxX - 0.4, eave - 0.3, r.minZ + 0.6)], [0, v(r.minX + 0.4, eave - 0.3, r.maxZ - 0.6)], [1, v(r.maxX - 0.4, eave - 0.3, r.maxZ - 0.6)], [0.5, v(cx, eave - 0.3, r.minZ + 0.5)], [0.5, v(cx - 4, eave - 0.3, r.maxZ - 0.5)]]) {
    items.rope.push(...garland(top(t), to, { sag: 0.5, flags: items.flags, bulbs: items.bulbs, rnd }));
  }
  // Por fuera: cadenas de focos desde la punta de los mástiles hasta las esquinas del alero (de noche
  // dibujan la silueta de la carpa desde la plaza).
  for (const [m, c] of [[R.w, E.nw], [R.w, E.sw], [R.e, E.ne], [R.e, E.se], [R.w, R.e]]) {
    const a = m.clone().add(v(0, 1.45, 0));
    const to = c === R.e ? R.e.clone().add(v(0, 1.45, 0)) : c.clone().add(v(Math.sign(c.x - cx) * 0.3, 0.1, Math.sign(c.z - cz) * 0.3));
    items.rope.push(...garland(a, to, { sag: 0.25, every: 0.7, bulbs: items.bulbs, dead: 0.3, rnd }));
  }
  hangGarlands(map, items);

  // Luz: el foco de la pista (cálido, titila) y focos de colores que todavía funcionan (tienen batería
  // propia, sin electricidad).
  b(0.7, 0.35, 0.5, C.dead, spawn.x, spawn.z, ridgeY - 1.2, false);
  map.lights.add({ pos: v(spawn.x, ridgeY - 1.6, spawn.z), color: '#ffd6a0', intensity: 30, distance: 13, power: false, flicker: 'tube' });
  map.pools.push({ pos: v(spawn.x, 0.04, spawn.z), radius: 3.6, color: '#ffcf96', power: false });
  map.lights.add({ pos: v(cx - 2, ridgeY - 1.6, cz), color: '#ff4f6a', intensity: 14, distance: 11, power: false, flicker: 'broken' });
  map.lights.add({ pos: v(cx + 3, ridgeY - 1.8, cz), color: '#ffc46a', intensity: 12, distance: 10, power: false, flicker: 'tube' });

  // Carteles despintados (adentro) y el letrero de la carpa sobre la puerta (afuera, hacia la plaza).
  sign(map, 'GRAN CIRCO', '#ffcf5a', cx, eave + 0.9, r.minZ - o - 0.05, Math.PI, 4.2, 0.9);
  sign(map, '¡PAYASOS!', '#ff5a5a', r.minX + 0.45, 3.1, r.minZ + 3.2, Math.PI / 2, 2.4, 0.55);
  sign(map, 'FUNCIÓN ESTA NOCHE', '#e8d8a8', r.maxX - 0.45, 3.1, r.maxZ - 3, -Math.PI / 2, 2.6, 0.5);
  sign(map, 'NO ALIMENTE A LOS PAYASOS', '#e8d8a8', cx + 4.5, 3.2, r.maxZ - 0.06, Math.PI, 3.2, 0.45);
  // Sangre en el aserrín y arrastres hacia las ventanas.
  for (const [x, z, sz, ry] of [[spawn.x + 1.2, spawn.z - 0.6, 1.6, 0.4], [spawn.x - 1.6, spawn.z - 1.4, 1.1, 2.1], [r.minX + 2.2, cz + 0.4, 1.4, 1.2], [r.maxX - 2.6, r.minZ + 1.8, 1.2, 2.8]]) map.decal('blood', x, z, sz, ry);
  for (const [x, z, sz, ry] of [[cx - 5, r.maxZ - 2.5, 1.6, 0.3], [cx + 6, cz + 3, 1.3, 1.7]]) map.decal('litter', x, z, sz, ry);
}
