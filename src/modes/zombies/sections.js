import * as THREE from 'three';
import { glow } from '../../gfx/surfaces.js';
import { signTexture } from '../../gfx/canvasTextures.js';

/*
  Secciones nuevas del Barrio en ruinas (las arma ZombieMap):

  - Subestación (oeste de la plaza): patio eléctrico con el GENERADOR (enciende la luz de todo el
    barrio: farolas, máquinas de bebidas y la Forja), transformadores cercados, postes con focos y una
    baliza roja de emergencia que gira mientras no hay electricidad.
  - Hospital (noroeste): ruina sin techo con un pasillo central y seis salas (dos salas de camas,
    quirófano con la Forja, recepción, farmacia y depósito). Se entra por un pasillo desde la
    Subestación o por otro desde el Mercado: el mapa forma un circuito.
  Todo es geometría estática (se une por material) salvo los carteles, la palanca y la baliza.
*/

export const SUBESTACION = { minX: -60, maxX: -34, minZ: -32, maxZ: -2 };
export const HOSPITAL = { minX: -56, maxX: -14, minZ: -64, maxZ: -40 };
export const CORRIDOR = { minZ: -54, maxZ: -50 }; // pasillo del hospital (este-oeste)
export const ROOM_X = [-42, -28]; // tabiques entre salas
// Puertas de las salas al pasillo (x). Anchas (2.2 m) y centradas en celdas de la navegación (x.5):
// con el radio de un zombi, una puerta más angosta queda cerrada para la horda.
export const DOORWAYS = [-48.5, -35.5, -21.5];
const DOOR_HALF = 1.1;
const WALL = 3.4; // altura de los tabiques del hospital

/** Valla de alambre (textura de rombos con transparencia), doble cara. Repite cada 15 cm. */
function fenceMaterial() {
  const mat = new THREE.MeshStandardMaterial({ color: '#8a8f94', alphaTest: 0.5, side: THREE.DoubleSide, metalness: 0.6, roughness: 0.5 });
  mat.userData.tile = 0.15; // UVs en metros (World.block)
  if (typeof document === 'undefined') return mat;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.strokeStyle = '#fff';
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(0, 32);
  g.lineTo(32, 0);
  g.lineTo(64, 32);
  g.lineTo(32, 64);
  g.closePath();
  g.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  mat.alphaMap = tex;
  return mat;
}

/** Cartel con texto pintado (una llamada de dibujo cada uno: pocos). */
export function sign(map, text, color, x, y, z, ry, w = 2.2, h = 0.5) {
  const mat = new THREE.MeshBasicMaterial({ map: signTexture(text, color), transparent: true, toneMapped: false, color: new THREE.Color(0.75, 0.75, 0.75) });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  m.position.set(x, y, z);
  m.rotation.y = ry;
  m.userData.dynamic = true;
  map.scene.add(m);
  return m;
}

// --- Subestación -------------------------------------------------------------------------------------
export function buildSubestacion(map, M) {
  const b = map.block.bind(map);
  // Caseta del generador: tres muros y techo (abierta al este).
  const H = { minX: -59, maxX: -50, minZ: -25, maxZ: -13 };
  b(0.5, 4.2, H.maxZ - H.minZ, M.concrete, H.minX + 0.25, (H.minZ + H.maxZ) / 2);
  b(H.maxX - H.minX, 4.2, 0.5, M.concrete, (H.minX + H.maxX) / 2, H.minZ + 0.25);
  b(H.maxX - H.minX, 4.2, 0.5, M.concrete, (H.minX + H.maxX) / 2, H.maxZ - 0.25);
  b(H.maxX - H.minX + 0.6, 0.3, H.maxZ - H.minZ + 0.6, M.concrete, (H.minX + H.maxX) / 2, (H.minZ + H.maxZ) / 2, 4.2, false); // techo
  // Generador: bloque oxidado con radiador, escape y tuberías.
  b(3.8, 1.9, 1.8, M.rust, -55.5, -19);
  b(0.9, 1.5, 1.6, M.metal, -53.1, -19, 0.1);
  for (let i = 0; i < 7; i++) b(0.04, 1.2, 1.85, M.metal, -57.2 + i * 0.12, -19, 0.4, false); // aletas
  b(0.25, 2.6, 0.25, M.metal, -56.6, -18.4, 1.9, false); // escape
  b(4.6, 0.18, 0.18, M.rust, -54.2, -17.6, 3.2, false);
  b(0.18, 3.2, 0.18, M.rust, -51.9, -17.6, 0, false);
  // Tablero con la palanca (contra el muro sur de la caseta, mirando al norte).
  b(1.2, 1.8, 0.35, M.machine, -51.6, -24.3);
  const lever = new THREE.Group();
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 0.08), M.metal);
  arm.position.y = 0.25;
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), glow('#ff3b2f'));
  knob.position.y = 0.52;
  lever.add(arm, knob);
  lever.position.set(-51.6, 1.2, -24.08);
  lever.rotation.x = 0.9; // abajo: apagado
  lever.userData.dynamic = true;
  map.scene.add(lever);
  map.lever = { group: lever, off: 0.9, on: -0.9 };
  map.interactables.push({ kind: 'power', id: 'generador', pos: new THREE.Vector3(-51.6, 0, -22.9), radius: 1.9 });
  sign(map, 'GENERADOR', '#ffd166', -51.6, 2.3, -24.1, 0, 1.6, 0.36);
  // Baliza roja de emergencia: gira y alumbra mientras no hay electricidad.
  const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.28, 12), glow('#ff2a1a'));
  beacon.position.set(-50.6, 4.5, -19);
  beacon.userData.dynamic = true;
  map.scene.add(beacon);
  map.beacon = { mesh: beacon, src: map.lights.add({ pos: new THREE.Vector3(-49.8, 4.0, -19), color: '#ff2a1a', intensity: 30, distance: 13, power: false }) };

  // Transformadores cercados (al norte, junto al muro).
  for (const x of [-40.5, -37]) {
    b(1.8, 2.3, 1.3, M.metal, x, -29.3);
    for (let i = 0; i < 5; i++) b(1.9, 0.04, 0.06, M.rust, x, -28.62, 0.6 + i * 0.35, false);
    for (const dx of [-0.5, 0, 0.5]) b(0.12, 0.6, 0.12, M.concrete, x + dx, -29.3, 2.3, false); // aisladores
  }
  b(8.6, 2.4, 0.04, map.fence ?? (map.fence = fenceMaterial()), -38.7, -27, 0);
  b(0.04, 2.4, 5, map.fence, -43, -29.5, 0);
  for (let x = -43; x <= -34.4; x += 2.15) b(0.08, 2.5, 0.08, M.metal, x, -27, 0, false);
  sign(map, 'PELIGRO · ALTA TENSIÓN', '#ffd166', -38.7, 1.6, -26.95, 0, 2.6, 0.38);
  // Postes de luz con travesaño y focos (necesitan la electricidad).
  for (const [x, z] of [[-47, -9], [-37.5, -19.5]]) {
    b(0.28, 8, 0.28, M.wood, x, z, 0);
    b(2.2, 0.16, 0.16, M.wood, x, z, 7.2, false);
    b(0.6, 0.35, 0.4, M.metal, x, z + 0.3, 6.6, false);
    b(0.5, 0.05, 0.3, M.lamp, x, z + 0.3, 6.56, false);
    map.lights.add({ pos: new THREE.Vector3(x, 6.2, z + 0.6), color: '#e8f0ff', intensity: 75, distance: 18, power: true });
    map.cones.push({ top: new THREE.Vector3(x, 6.55, z + 0.3), height: 6.5, radius: 3.6, color: '#dbe6ff', power: true });
    map.pools.push({ pos: new THREE.Vector3(x, 0.02, z + 0.6), radius: 5.5, color: '#cfe0ff', power: true });
  }
  // Carretes de cable y cajas.
  for (const [x, z] of [[-45, -5.5], [-38.5, -11]]) {
    const spool = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.9, 16), M.wood);
    spool.rotation.x = Math.PI / 2;
    spool.position.set(x, 0.9, z);
    map.scene.add(spool);
    map.solids.push(spool);
    map.colliders.push(new THREE.Box3().setFromCenterAndSize(spool.position, new THREE.Vector3(1.8, 1.8, 0.9)));
  }
  for (const [x, z, s] of [[-58.2, -9.5, 1.1], [-57.2, -8.3, 0.8], [-35.4, -3.2, 1]]) map.crate(x, z, s);
  map.fireBarrel(-43, -15, M);
  map.lamp(-35.6, -7.5, M, { ry: -1.9, broken: true });
  for (const [x, z, s, ry] of [[-52, -15.5, 1.3, 0.5], [-41, -21, 2.2, 1.1], [-49, -4.5, 1.8, 2.4]]) map.decal('oil', x, z, s, ry);
}

// --- Hospital -----------------------------------------------------------------------------------------
export function buildHospital(map, M) {
  const b = map.block.bind(map);
  const r = HOSPITAL;
  const wall = M.peeling;
  // Tabiques del pasillo con las puertas de las salas.
  for (const z of [CORRIDOR.minZ, CORRIDOR.maxZ]) {
    let a = r.minX;
    for (const d of [...DOORWAYS, r.maxX + 10]) {
      const end = Math.min(d - DOOR_HALF, r.maxX);
      if (end - a > 0.1) b(end - a, WALL, 0.25, wall, (a + end) / 2, z);
      a = d + DOOR_HALF;
    }
  }
  // Tabiques entre salas (norte y sur del pasillo).
  for (const x of ROOM_X) {
    b(0.25, WALL, r.maxZ - CORRIDOR.maxZ, wall, x, (CORRIDOR.maxZ + r.maxZ) / 2);
    b(0.25, WALL, CORRIDOR.minZ - r.minZ, wall, x, (r.minZ + CORRIDOR.minZ) / 2);
  }
  // Zócalo azul a lo largo del pasillo y vigas con tubos fluorescentes (algunos titilan).
  for (const z of [CORRIDOR.minZ + 0.14, CORRIDOR.maxZ - 0.14]) b(r.maxX - r.minX, 1.1, 0.03, M.peelingBlue, (r.minX + r.maxX) / 2, z, 0, false);
  for (let x = r.minX + 5; x < r.maxX - 2; x += 7) {
    b(0.35, 0.35, CORRIDOR.maxZ - CORRIDOR.minZ + 0.6, M.concrete, x, (CORRIDOR.minZ + CORRIDOR.maxZ) / 2, WALL, false);
    b(0.12, 0.05, 1.6, M.lamp, x, (CORRIDOR.minZ + CORRIDOR.maxZ) / 2, WALL - 0.06, false);
    const broken = Math.round(x) % 3 === 0;
    map.lights.add({ pos: new THREE.Vector3(x, WALL - 0.3, -52), color: '#d6f0ff', intensity: 16, distance: 8, power: true, flicker: broken ? 'broken' : 'tube' });
    map.pools.push({ pos: new THREE.Vector3(x, 0.02, -52), radius: 2.6, color: '#cfe8ff', power: true, broken });
  }
  // Camas de hospital.
  const bed = (x, z, ry = 0) => {
    const g = new THREE.Group();
    const add = (w, h, d, mat, px, py, pz) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(px, py, pz);
      g.add(m);
      return m;
    };
    const frame = add(0.95, 0.08, 2.0, M.metal, 0, 0.55, 0);
    add(0.88, 0.16, 1.9, M.sheet, 0, 0.67, 0);
    add(0.6, 0.12, 0.4, M.sheet, 0, 0.8, -0.72);
    for (const [px, pz] of [[-0.44, -0.95], [0.44, -0.95], [-0.44, 0.95], [0.44, 0.95]]) add(0.05, 0.55, 0.05, M.metal, px, 0.27, pz);
    add(0.95, 0.5, 0.05, M.metal, 0, 0.85, -1.0); // cabecera
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    map.flatten(g);
    map.solids.push(frame);
    map.colliders.push(new THREE.Box3().setFromObject(frame).expandByVector(new THREE.Vector3(0, 0.35, 0)));
  };
  // Sala noroeste: cuatro camas con cortinas (el medio queda libre: por ahí entra la horda).
  for (const x of [-54, -51.3, -45.4, -43]) bed(x, -60.5, 0);
  for (const x of [-52.65, -44.2]) {
    b(0.04, 0.04, 2.4, M.metal, x, -60.5, 2.5, false);
    b(0.05, 2.1, 1.9, M.curtain, x, -60.6, 0.35, false);
  }
  // Sala sur-centro: camas contra el muro sur.
  for (const x of [-40.2, -30.2]) bed(x, -41.4, Math.PI);
  // Quirófano (norte-centro): mesa, lámpara de techo y armarios. Aquí está la Forja.
  b(0.9, 0.9, 2.1, M.metal, -36.5, -60);
  b(1.4, 0.1, 1.4, M.metal, -36.5, -60, 3.2, false);
  b(1.0, 0.04, 1.0, M.lamp, -36.5, -60, 3.16, false);
  map.lights.add({ pos: new THREE.Vector3(-36.5, 2.8, -60), color: '#eaf6ff', intensity: 22, distance: 9, power: true });
  map.pools.push({ pos: new THREE.Vector3(-36.5, 0.02, -60), radius: 3.2, color: '#e0f0ff', power: true });
  for (const x of [-40.6, -39]) b(1.4, 2.0, 0.55, M.metal, x, -63.5);
  // Recepción (noreste): mostrador y estantes con archivos (el paso del medio, libre).
  b(3.6, 1.1, 0.7, M.wood, -25.6, -57.4);
  b(0.7, 1.1, 2.0, M.wood, -23.5, -58.8);
  for (const x of [-26.6, -25]) b(1.5, 2.2, 0.5, M.wood, x, -63.6);
  sign(map, 'RECEPCIÓN', '#e8e2c8', -24, 2.6, -63.95, 0, 1.8, 0.36);
  // Farmacia (sureste): estanterías.
  for (const z of [-46.5, -43.5]) b(4.2, 2.0, 0.5, M.metal, -21, z);
  sign(map, 'FARMACIA', '#7dffb0', -21, 2.7, -40.05, Math.PI, 1.6, 0.36);
  // Depósito (suroeste): cajas apiladas.
  for (const [x, z, s] of [[-54.6, -41.4, 1.1], [-53.4, -41.5, 0.9], [-43, -41.2, 0.9]]) map.crate(x, z, s);
  // Camilla abandonada en la sala sur-centro (en el pasillo cortaría el paso de la horda).
  b(1.9, 0.85, 0.7, M.metal, -31, -47.5);
  // Sangre en el piso del pasillo y de las salas (charcos y arrastres).
  for (const [x, z, s, ry] of [[-38, -52.4, 1.7, 0.4], [-24, -51.4, 1.3, 2.1], [-50, -51.8, 1.5, 1.2], [-33, -57.5, 1.4, 0.2], [-47, -45, 1.2, 2.6]]) map.decal('blood', x, z, s, ry);
  sign(map, 'HOSPITAL', '#e8e2c8', -46, 3.6, -38.95, 0, 2.2, 0.5);
}
