import * as THREE from 'three';
import { SKIES, createSky } from '../../gfx/sky.js';
import { glow, glowScale, paint, surface } from '../../gfx/surfaces.js';
import { signTexture } from '../../gfx/canvasTextures.js';
import { World } from '../../scenes/World.js';
import { Props } from '../../physics/Props.js';
import { placeWeapons } from '../../scenes/props.js';
import { WEAPONS } from '../../combat/weapons.js';
import { BARRICADE, DOORS, PERKS } from './zombieData.js';

const plankGeo = new THREE.BoxGeometry(1, 1, 1);

/*
  "Barrio en ruinas": una plaza nocturna rodeada de edificios y, detrás de puertas tapiadas que se
  compran con puntos, tres secciones más: el Mercado (norte), la Estación (este) y la Iglesia (sur).
  Al estilo de los modos de supervivencia clásicos: el mapa se abre a medida que se gana.

  - entries: [{ id, section, spawn, entry, center }] — por dónde entra la horda. Cada sección tiene las
    suyas (callejones de la plaza, nichos en los muros de las secciones); solo se usan las de las
    secciones abiertas.
  - doors: { [sección]: { open, collider, solid, group } } · isOpen(sección) · openDoor(id) · resetDoors()
  - interactables: [{ kind: 'door' | 'wallbuy' | 'perk', id, pos, radius, label }] — lo que se compra
    con la tecla de usar (E): puertas, armas de la pared y máquinas de bebidas.
  - nav: límites para la cuadrícula de navegación (todo el mapa).
  - update(dt): fuego de los barriles y caída de las puertas al abrirlas.
*/

export const PLAZA = 22; // m: la plaza va de -PLAZA a +PLAZA en x y z
const WALL_H = 9;
const ALLEY_W = 4.2;
const OUTSIDE = 9; // m que se extiende cada callejón hacia fuera
const NICHE_W = 2.6; // ancho de las entradas de zombis en los muros de las secciones
const DOOR_H = 3.6;

// Callejones: lado (n/s/e/o) y posición a lo largo de ese lado. `door`: lleva a esa sección (no es
// una entrada de zombis: la tapia una puerta que se compra).
const ALLEYS = [
  { side: 'n', at: -10 },
  { side: 'n', at: 11, door: 'mercado' },
  { side: 's', at: 2, door: 'iglesia' },
  { side: 'o', at: -6 },
  { side: 'e', at: -12 },
  { side: 'e', at: 9, door: 'estacion' },
];

// Secciones: rectángulo, lado y posición por donde llega el callejón y entradas de zombis.
// Lados del rectángulo: n = minZ, s = maxZ, o = minX, e = maxX.
const SECTIONS = {
  mercado: { rect: { minX: 0, maxX: 26, minZ: -54, maxZ: -34 }, opening: { side: 's', at: 11 }, entries: [['n', 6], ['n', 20], ['e', -44]], floor: ['tiles', '#3a3d42'] },
  estacion: { rect: { minX: 34, maxX: 58, minZ: -4, maxZ: 22 }, opening: { side: 'o', at: 9 }, entries: [['e', 2], ['e', 16], ['n', 46]], floor: ['concrete', '#4b4f55'] },
  iglesia: { rect: { minX: -14, maxX: 18, minZ: 34, maxZ: 56 }, opening: { side: 'n', at: 2 }, entries: [['s', -6], ['s', 10], ['o', 46]], floor: ['gravel', '#34363a'] },
};

// Vestíbulo: cuarto de inicio cerrado (al estilo de los mapas clásicos), en el sur de la plaza. Ventanas
// tapiadas por donde entra la horda y dos puertas: a la plaza (norte) y a la iglesia (el callejón sur).
const LOBBY = { minX: -10, maxX: 10, minZ: 10, maxZ: 22, wallH: 5 };
const WINDOW_W = 2.4;
// Ventanas: [lado del cuarto, posición]. n = pared norte (z = minZ), o = oeste, e = este.
const LOBBY_WINDOWS = [['n', -6], ['n', 6], ['o', 16], ['e', 16]];
const LOBBY_DOOR = { at: 0, width: 3.2 }; // puerta a la plaza, en la pared norte

// Máquinas de bebidas: [bebida, x, z, ry] (ry: hacia dónde mira el frente).
const PERK_SPOTS = [
  ['aire', 9.5, 20, -Math.PI / 2],
  ['pies', 21.5, -4, -Math.PI / 2],
  ['coraza', 25.5, -48, -Math.PI / 2],
  ['plomo', 40, -3.5, 0],
  ['mano', 17.5, 48, -Math.PI / 2],
];
// Armas de la pared: [arma, x, z, normal de la pared (hacia dentro): 'n' = +z, 's' = -z, 'o' = +x, 'e' = -x].
const WALL_SPOTS = [
  ['smg', 0, -PLAZA, 'n'],
  ['rifle', -12, PLAZA, 's'],
  ['shotgun', 13, -54, 'n'],
  ['lmg', 0, -44, 'o'],
  ['dmr', 46, 22, 's'],
  ['sniper', 58, 9, 'e'],
  ['burst', 2, 56, 's'],
  ['magnum', -6, PLAZA, 's'], // en el vestíbulo
];
const BOX_SPOT = { x: -8, z: -3, ry: Math.PI / 2 }; // caja misteriosa (plaza)
const NORMALS = { n: new THREE.Vector3(0, 0, 1), s: new THREE.Vector3(0, 0, -1), o: new THREE.Vector3(1, 0, 0), e: new THREE.Vector3(-1, 0, 0) };

export class ZombieMap extends World {
  constructor() {
    super({
      name: 'Barrio en ruinas',
      background: '#0a0f15',
      fogNear: 9,
      fogFar: 58,
      spawn: new THREE.Vector3(0, 0, 16), // en el vestíbulo
      // El jugador puede ir a todo el mapa: lo limitan los muros y las puertas cerradas.
      playerZone: { minX: -60, maxX: 60, minZ: -60, maxZ: 60 },
    });
    const scene = this.scene;
    // Luna fría y relleno muy bajo: la noche se lee por las farolas y el fuego.
    scene.add(new THREE.HemisphereLight('#9fb4d6', '#1d1a17', 0.95));
    // Cielo procedural (degradado, resplandor en el horizonte, estrellas y luna) que se funde con la niebla.
    scene.add(createSky({ ...SKIES.fire, horizon: '#0a0f15' }));
    const moon = new THREE.DirectionalLight('#c9d8ff', 1.05);
    moon.position.set(-18, 30, 12);
    scene.add(moon);
    this.envIntensity = 0.22;
    this.groundY = 0.02; // el asfalto es una losa de 2 cm

    const M = {
      asphalt: surface('asphalt', '#23272e'),
      sidewalk: surface('tiles', '#3b3f46'),
      gravel: surface('gravel', '#2e3238'),
      brick: surface('brick', '#5a3e35'),
      brickDark: surface('brick', '#3f2c27'),
      plaster: surface('plaster', '#4c4f55'),
      plasterWarm: surface('plaster', '#5e5446'),
      concrete: surface('concrete', '#5b5f66'),
      metal: surface('metal', '#3c424b'),
      dumpster: surface('metal_panel', '#2f4636'),
      wood: surface('wood', '#5d4632'),
      sandbag: surface('plaster', '#6b604a'),
      carA: paint('#5a2626'),
      carB: paint('#26364a'),
      carC: paint('#545048'),
      train: paint('#3d4a3a', { roughness: 0.55, metalness: 0.5 }),
      clothA: paint('#7a2f2a', { roughness: 0.9, metalness: 0 }),
      clothB: paint('#2f4a6a', { roughness: 0.9, metalness: 0 }),
      clothC: paint('#7a6a2a', { roughness: 0.9, metalness: 0 }),
      machine: paint('#1d2127', { roughness: 0.45, metalness: 0.6 }),
      tire: new THREE.MeshStandardMaterial({ color: '#111214', roughness: 0.9 }),
      glass: new THREE.MeshStandardMaterial({ color: '#0d1218', roughness: 0.15, metalness: 0.6 }),
      lamp: glow('#ffe1a8'),
      window: glow('#ffb86b'),
      fire: glow('#ff8a3d'),
      line: new THREE.MeshStandardMaterial({ color: '#9a978c', roughness: 0.8 }),
    };
    this.materials = M;
    const block = this.block.bind(this);
    this.fireMat = M.fire;
    this.flames = [];
    this.entries = [];
    this.doors = {};
    this.interactables = [];
    this.barricades = [];

    // --- Suelo ---------------------------------------------------------------------------------
    this.ground(130, 130, 0, M.gravel);
    block(PLAZA * 2, 0.02, PLAZA * 2, M.asphalt, 0, 0, 0, false);
    for (const [x, z, w, d] of [[0, -PLAZA + 1.5, PLAZA * 2, 3], [0, PLAZA - 1.5, PLAZA * 2, 3], [-PLAZA + 1.5, 0, 3, PLAZA * 2 - 6], [PLAZA - 1.5, 0, 3, PLAZA * 2 - 6]]) {
      block(w, 0.12, d, M.sidewalk, x, z, 0, false);
    }
    for (let x = -16; x <= 16; x += 8) block(3, 0.025, 0.25, M.line, x, -4, 0.02, false); // marcas viales

    // --- Edificios del perímetro, con los huecos de los callejones -----------------------------------
    const sides = {
      n: { axis: 'x', fixed: -PLAZA - 3, inward: new THREE.Vector3(0, 0, 1) },
      s: { axis: 'x', fixed: PLAZA + 3, inward: new THREE.Vector3(0, 0, -1) },
      o: { axis: 'z', fixed: -PLAZA - 3, inward: new THREE.Vector3(1, 0, 0) },
      e: { axis: 'z', fixed: PLAZA + 3, inward: new THREE.Vector3(-1, 0, 0) },
    };
    const mats = [M.brick, M.plaster, M.brickDark, M.plasterWarm];
    let k = 0;
    for (const [id, side] of Object.entries(sides)) {
      const gaps = ALLEYS.filter((a) => a.side === id)
        .map((a) => a.at)
        .sort((a, b) => a - b);
      let from = -PLAZA - 6;
      for (const g of [...gaps, PLAZA + 6 + ALLEY_W / 2]) {
        const to = g - ALLEY_W / 2;
        // Fachada dividida en edificios de 7-11 m de ancho y alturas distintas.
        let a = from;
        while (a < to - 0.5) {
          const w = Math.min(to - a, 7 + ((k * 37) % 5));
          const h = WALL_H + ((k * 53) % 5);
          this.building(side, a, a + w, h, mats[k % mats.length], M);
          a += w;
          k++;
        }
        from = g + ALLEY_W / 2;
      }
      for (const a of ALLEYS.filter((x) => x.side === id)) this.alley(side, a.at, M, id, a.door ?? null);
    }

    // --- Coberturas de la plaza ----------------------------------------------------------------------
    // Fuente central (anillo de concreto) y bancos.
    for (const [x, z, w, d] of [[0, -6, 6, 0.6], [0, 0, 6, 0.6], [-2.7, -3, 0.6, 5.4], [2.7, -3, 0.6, 5.4]]) block(w, 0.75, d, M.concrete, x, z);
    block(1.2, 1.6, 1.2, M.concrete, 0, -3);
    // Autos abandonados.
    this.car(-11, 4, 0.35, M.carA, M);
    this.car(12, -7, -0.6, M.carB, M);
    this.car(15.5, 8, 1.35, M.carC, M);
    // Barreras de concreto y sacos terreros.
    for (const [x, z, ry] of [[-4, -10, 0], [-14, -12, 0.5], [15, 3, 1.57], [5, -15, 0.2]]) {
      const b = block(3.2, 0.95, 0.6, M.concrete, x, z);
      b.rotation.y = ry;
      this.fixCollider(b);
    }
    for (const [x, z] of [[-17, 6], [17, -16], [-8, -17]]) {
      for (let i = 0; i < 3; i++) block(1.1, 0.45, 0.7, M.sandbag, x + (i - 1) * 1.05, z, 0);
      for (let i = 0; i < 2; i++) block(1.1, 0.45, 0.7, M.sandbag, x + (i - 0.5) * 1.05, z, 0.45);
    }
    // Contenedores de basura y cajas.
    for (const [x, z] of [[-18, -18], [18.5, 17.5], [-19, 15]]) block(2.2, 1.4, 1.4, M.dumpster, x, z);
    for (const [x, z, s] of [[19, -5, 1], [18, -4, 0.8], [-12, 17, 1.1], [-11, 18.2, 0.8]]) block(s, s, s, M.wood, x, z, 0);
    // Vallas rotas.
    for (const [x, z, w] of [[-4, 18.5, 6], [10, -19.5, 5]]) {
      block(w, 1.3, 0.12, M.metal, x, z, 0);
      for (let i = 0; i <= 2; i++) block(0.12, 1.5, 0.12, M.metal, x - w / 2 + (i * w) / 2, z, 0);
    }

    // --- Luces de la plaza: farolas y barriles con fuego ------------------------------------------------
    for (const [x, z] of [[-15, -15], [15, -15], [-15, 15], [15, 15], [0, 15], [-19, 0], [19, 0]]) this.lamp(x, z, M);
    for (const [x, z] of [[-7, -12], [9, 6], [-15, 1], [4, 17]]) this.fireBarrel(x, z, M);
    this.fireT = 0;

    // --- Vestíbulo (inicio) y secciones que se abren con puertas -----------------------------------------
    this.lobby(M);
    for (const [id, def] of Object.entries(SECTIONS)) this.section(id, def, M);
    this.mercado(M);
    this.estacion(M);
    this.iglesia(M);

    // --- Máquinas de bebidas y armas de la pared ---------------------------------------------------------
    for (const [perk, x, z, ry] of PERK_SPOTS) this.perkMachine(perk, x, z, ry, M);
    const placements = [];
    for (const [weapon, x, z, side] of WALL_SPOTS) placements.push(this.wallBuy(weapon, x, z, side));
    this.wallWeapons = placeWeapons(this.scene, placements).catch(() => null); // modelos 3D (llegan después)
    this.mysteryBox(BOX_SPOT, M);

    // Navegación: todo el mapa (plaza, callejones, secciones y sus entradas).
    this.nav = { minX: -62, maxX: 62, minZ: -62, maxZ: 62 };
    this.openArea = { minX: -PLAZA + 2, maxX: PLAZA - 2, minZ: -PLAZA + 2, maxZ: PLAZA - 2 };

    // Utilería con física: latas sobre barreras y sacos (para tirarlas a balazos), conos, botes de
    // basura en las veredas, cajas y barriles. Los zombis los empujan al pasar.
    const along = (x, z, ry, d) => [x + Math.cos(ry) * d, z - Math.sin(ry) * d];
    const cans = [];
    for (const [x, z, ry, ds] of [[-4, -10, 0, [-0.9, 0, 0.9]], [-14, -12, 0.5, [-0.8, 0, 0.8]], [15, 3, 1.57, [-0.6, 0.6]], [5, -15, 0.2, [-0.7, 0.7]]]) {
      ds.forEach((d, i) => {
        const [cx, cz] = along(x, z, ry, d);
        cans.push({ type: i % 2 ? 'canGreen' : 'can', x: cx, z: cz, y: 0.95, ry: d });
      });
    }
    this.props = new Props(this, [
      ...cans,
      { type: 'can', x: -17.4, z: 6.05, y: 0.9 },
      { type: 'canGreen', x: -16.6, z: 5.95, y: 0.9 },
      { type: 'ammo', x: 16.6, z: -16, y: 0.9, ry: 0.3 },
      { type: 'can', x: 17.5, z: -15.95, y: 0.9 },
      { type: 'can', x: -8.3, z: -17, y: 0.9 },
      { type: 'canGreen', x: -7.6, z: -16.9, y: 0.9 },
      { type: 'ammo', x: -18, z: -18, y: 1.4, ry: -0.4 },
      ...[[-8.6, 12.9], [-3.4, 12.8], [13.8, 5.6], [16.2, 0.5], [3.0, -13.6], [7.6, -16.4], [-16.2, -10.2]].map(([x, z], i) => ({ type: 'cone', x, z, ry: i })),
      ...[[-20.4, -8.5], [20.3, 6.8], [-6.5, -20.4], [13.2, 20.3], [20.4, -10.5]].map(([x, z]) => ({ type: 'trash', x, z })),
      { type: 'crate', x: 16.6, z: -11.8, ry: 0.3 },
      { type: 'crate', x: -3.2, z: -19.6, ry: -0.2 },
      { type: 'crate', x: -19.4, z: -3.6, ry: 0.6 },
      { type: 'crateSmall', x: -18.3, z: -2.4, ry: 0.2 },
      { type: 'crateSmall', x: 6, z: 19.6, ry: -0.5 },
      { type: 'barrel', x: -9.6, z: -14.4 },
      { type: 'barrelRed', x: 11.2, z: 9.6 },
      { type: 'barrel', x: -16.4, z: 12.6 },
      { type: 'barrelRed', x: 19.6, z: 12.0 },
      // En las secciones (se ven al abrirlas).
      { type: 'crate', x: 4.5, z: -38, ry: 0.4 },
      { type: 'crateSmall', x: 23, z: -36.5, ry: -0.3 },
      { type: 'trash', x: 36, z: 1 },
      { type: 'barrel', x: 56, z: 20.5 },
      { type: 'cone', x: 44, z: 3, ry: 1 },
      { type: 'crate', x: -11.5, z: 54, ry: 0.2 },
    ]);
    scene.updateMatrixWorld(true);
  }

  // --- Piezas de la plaza --------------------------------------------------------------------------

  // Edificio de fachada a lo largo de un lado, entre a y b, con ventanas encendidas al azar.
  building(side, a, b, h, mat, M) {
    const depth = 6; // centrado en la línea del lado: la fachada interior queda en el borde de la plaza
    if (side.axis === 'x') this.block(b - a, h, depth, mat, (a + b) / 2, side.fixed);
    else this.block(depth, h, b - a, mat, side.fixed, (a + b) / 2);
    // Ventanas: algunas encendidas (cálidas), el resto oscuras.
    const face = side.fixed + (side.axis === 'x' ? side.inward.z : side.inward.x) * (depth / 2 + 0.03);
    for (let y = 3; y < h - 1.5; y += 3) {
      for (let c = a + 1.5; c < b - 1; c += 2.6) {
        const lit = ((Math.round(c * 7 + y * 13) % 5) + 5) % 5 === 0;
        const m = lit ? M.window : M.glass;
        if (side.axis === 'x') this.block(1.1, 1.4, 0.06, m, c, face, y, false);
        else this.block(0.06, 1.4, 1.1, m, face, c, y, false);
      }
    }
  }

  // Callejón: muros laterales hacia fuera. Si es una entrada de zombis, tiene fondo y registra la
  // entrada; si lleva a una sección (`door`), sigue abierto hasta ella y lo tapia una puerta.
  alley(side, at, M, id, door) {
    const depth = OUTSIDE + 3;
    const w = ALLEY_W;
    const dir = side.inward.clone().negate(); // hacia fuera
    const base = side.axis === 'x' ? new THREE.Vector3(at, 0, side.fixed) : new THREE.Vector3(side.fixed, 0, at);
    const mid = base.clone().addScaledVector(dir, depth / 2 - 3);
    for (const s of [-1, 1]) {
      const p = mid.clone();
      if (side.axis === 'x') p.x += s * (w / 2 + 0.3);
      else p.z += s * (w / 2 + 0.3);
      if (side.axis === 'x') this.block(0.6, WALL_H - 2, depth, M.brickDark, p.x, p.z);
      else this.block(depth, WALL_H - 2, 0.6, M.brickDark, p.x, p.z);
    }
    if (door) {
      this.door(door, base.clone().addScaledVector(dir, -2.4), { across: side.axis, inward: side.inward, width: ALLEY_W }, M);
      return;
    }
    const end = base.clone().addScaledVector(dir, depth - 3 + 0.3);
    if (side.axis === 'x') this.block(w + 1.2, WALL_H - 2, 0.6, M.brickDark, end.x, end.z);
    else this.block(0.6, WALL_H - 2, w + 1.2, M.brickDark, end.x, end.z);
    const entry = {
      id: this.entries.length,
      section: 'plaza',
      side: id,
      spawn: base.clone().addScaledVector(dir, 4.5), // dentro del callejón, fuera de la vista de la plaza
      entry: base.clone().addScaledVector(side.inward, 2.5),
      center: base.clone(),
    };
    this.entries.push(entry);
    // Barricada en la boca del callejón (borde de la plaza).
    this.barricade(entry, base.clone().addScaledVector(side.inward, 3), side.axis, w, side.inward, M);
  }

  // Tablones en una entrada de zombis: los arrancan para entrar y el jugador los repara desde dentro.
  // mouth: centro del hueco · along: eje a lo largo del hueco · inward: hacia dentro.
  barricade(entry, mouth, along, width, inward, M) {
    const group = new THREE.Group();
    group.userData.dynamic = true;
    const planks = [];
    for (let i = 0; i < BARRICADE.boards; i++) {
      const m = new THREE.Mesh(plankGeo, M.wood);
      const len = width + 0.35;
      if (along === 'x') m.scale.set(len, 0.2, 0.06);
      else m.scale.set(0.06, 0.2, len);
      const home = new THREE.Vector3(mouth.x, 0.45 + i * 0.3, mouth.z).addScaledVector(inward, 0.1 + (i % 2) * 0.05);
      // Se cruzan en diagonal, cada uno con su inclinación.
      const tilt = ((i % 3) - 1) * 0.16 + (i % 2 ? 0.05 : -0.05);
      const rot = along === 'x' ? new THREE.Euler(0, 0, tilt) : new THREE.Euler(tilt, 0, 0);
      m.position.copy(home);
      m.rotation.copy(rot);
      m.castShadow = true;
      group.add(m);
      planks.push({ mesh: m, home, rot, t: -1, dir: 0 });
    }
    this.scene.add(group);
    entry.barricade = { boards: BARRICADE.boards, max: BARRICADE.boards, planks, group, mouth: mouth.clone(), inward: inward.clone(), along, width, entry };
    this.barricades.push(entry.barricade);
  }

  /** Un zombi arranca un tablón. Devuelve false si ya no quedaban. */
  removeBoard(b) {
    if (b.boards <= 0) return false;
    b.boards--;
    const p = b.planks[b.boards];
    p.t = 0;
    p.dir = -1;
    return true;
  }

  /** El jugador vuelve a clavar un tablón. Devuelve false si ya estaba completa. */
  addBoard(b) {
    if (b.boards >= b.max) return false;
    const p = b.planks[b.boards];
    b.boards++;
    p.t = 0;
    p.dir = 1;
    p.mesh.visible = true;
    return true;
  }

  /** Todas las barricadas completas otra vez (al empezar una partida). */
  resetBarricades() {
    for (const b of this.barricades) {
      b.boards = b.max;
      for (const p of b.planks) {
        p.t = -1;
        p.dir = 0;
        p.mesh.visible = true;
        p.mesh.position.copy(p.home);
        p.mesh.rotation.copy(p.rot);
      }
    }
  }

  // Puerta tapiada (tablones y escombros) que se compra para abrir una sección. No entra en la
  // geometría unida (userData.dynamic): al abrirla se cae y deja de bloquear.
  // opts.across: eje a lo largo del hueco · opts.inward: lado desde el que se compra · opts.width.
  door(id, center, { across, inward, width }, M) {
    const side = { inward };
    const group = new THREE.Group();
    group.userData.dynamic = true;
    const plank = new THREE.BoxGeometry(1, 1, 1);
    const add = (mat, sx, sy, sz, x, y, z, rot = 0) => {
      const m = new THREE.Mesh(plank, mat);
      m.scale.set(sx, sy, sz);
      m.position.set(x, y, z);
      if (across === 'x') m.rotation.z = rot;
      else m.rotation.x = rot;
      group.add(m);
      return m;
    };
    const W = width;
    // Postes a los lados y tablones cruzados a distintas alturas.
    for (const s of [-0.5, 0.5]) {
      if (across === 'x') add(M.wood, 0.16, DOOR_H, 0.16, s * (W - 0.3), DOOR_H / 2, 0);
      else add(M.wood, 0.16, DOOR_H, 0.16, 0, DOOR_H / 2, s * (W - 0.3));
    }
    [0.5, 1.05, 1.6, 2.2, 2.8, 3.3].forEach((y, i) => {
      const tilt = (i % 2 ? 1 : -1) * (0.05 + (i % 3) * 0.04);
      if (across === 'x') add(M.wood, W, 0.24, 0.08, 0, y, (i % 2) * 0.06, tilt);
      else add(M.wood, 0.08, 0.24, W, (i % 2) * 0.06, y, 0, tilt);
    });
    // Escombros al pie.
    const rubble = new THREE.DodecahedronGeometry(0.35, 0);
    for (let i = 0; i < 5; i++) {
      const m = new THREE.Mesh(rubble, M.concrete);
      const t = (i / 4 - 0.5) * (W - 0.6);
      m.position.set(across === 'x' ? t : 0.25, 0.2, across === 'x' ? 0.25 : t);
      m.rotation.set(i, i * 2, 0);
      m.scale.setScalar(0.7 + (i % 3) * 0.25);
      group.add(m);
    }
    // Letrero con el nombre de la sección.
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.4), new THREE.MeshBasicMaterial({ map: signTexture(DOORS[id].name, '#ffd166'), transparent: true, toneMapped: false }));
    sign.position.set(0, DOOR_H + 0.4, 0);
    sign.lookAt(side.inward.clone().multiplyScalar(10));
    group.add(sign);
    group.position.copy(center);
    this.scene.add(group);
    group.updateMatrixWorld(true);
    // Bloqueo: sólido invisible para balas y vista, y colisionador para el paso.
    const size = across === 'x' ? new THREE.Vector3(W, DOOR_H, 0.5) : new THREE.Vector3(0.5, DOOR_H, W);
    const solid = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), new THREE.MeshBasicMaterial({ visible: false }));
    solid.position.copy(center).setY(DOOR_H / 2);
    solid.userData.dynamic = true;
    solid.updateMatrixWorld(true);
    const collider = new THREE.Box3().setFromCenterAndSize(solid.position, size);
    this.solids.push(solid);
    this.colliders.push(collider);
    this.doors[id] = { id, open: false, group, solid, collider, t: 0, home: center.clone() };
    this.interactables.push({ kind: 'door', id, pos: center.clone().addScaledVector(side.inward, 1.2), radius: 2.8 });
  }

  // Auto: carrocería, cabina con vidrios y ruedas. Bloquea balas y paso.
  car(x, z, ry, paintMat, M) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.9, 1.9), paintMat);
    body.position.y = 0.75;
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.75, 1.75), M.glass);
    cabin.position.set(-0.2, 1.55, 0);
    g.add(body, cabin);
    for (const [wx, wz] of [[-1.35, 0.95], [1.35, 0.95], [-1.35, -0.95], [1.35, -0.95]]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.28, 12), M.tire);
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(wx, 0.36, wz);
      g.add(wheel);
    }
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    this.scene.add(g);
    g.updateMatrixWorld(true);
    for (const m of [body, cabin]) this.solids.push(m);
    // Colisionador alineado a los ejes que envuelve el auto girado.
    this.colliders.push(new THREE.Box3().setFromObject(body).union(new THREE.Box3().setFromObject(cabin)));
  }

  // Colisionador de una caja recién creada y girada: la caja alineada que la envuelve.
  fixCollider(mesh) {
    mesh.updateMatrixWorld(true);
    this.colliders[this.colliders.length - 1] = new THREE.Box3().setFromObject(mesh);
  }

  lamp(x, z, M) {
    this.block(0.18, 5, 0.18, M.metal, x, z, 0, false);
    this.block(1.2, 0.12, 0.3, M.metal, x, z, 5, false);
    this.block(0.9, 0.06, 0.24, M.lamp, x, z, 4.95, false);
  }

  fireBarrel(x, z, M) {
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.3, 0.9, 12), M.metal);
    barrel.position.set(x, 0.45, z);
    this.scene.add(barrel);
    this.solids.push(barrel);
    this.colliders.push(new THREE.Box3().setFromCenterAndSize(barrel.position, new THREE.Vector3(0.64, 0.9, 0.64)));
    // Fuego: dos lenguas que cambian de tamaño (se animan en update).
    for (const [r, h, dx] of [[0.24, 0.6, 0], [0.15, 0.42, 0.08]]) {
      const flame = new THREE.Mesh(new THREE.ConeGeometry(r, h, 6), M.fire);
      flame.position.set(x + dx, 0.9 + h / 2, z - dx);
      flame.userData.dynamic = true; // se escala cada cuadro: no entra en la geometría unida
      flame.userData.base = h;
      this.scene.add(flame);
      this.flames.push(flame);
    }
  }

  // --- Secciones ------------------------------------------------------------------------------------

  // Muros perimetrales del rectángulo (con huecos para el callejón y las entradas), piso y entradas.
  section(id, def, M) {
    const r = def.rect;
    const [floorKey, floorColor] = def.floor;
    this.block(r.maxX - r.minX, 0.02, r.maxZ - r.minZ, surface(floorKey, floorColor), (r.minX + r.maxX) / 2, (r.minZ + r.maxZ) / 2, 0, false);
    const gapsBy = { n: [], s: [], o: [], e: [] };
    gapsBy[def.opening.side].push([def.opening.at, ALLEY_W]);
    for (const [side, at] of def.entries) gapsBy[side].push([at, NICHE_W]);
    const mats = [M.brick, M.plasterWarm, M.brickDark, M.plaster];
    let k = id.length;
    for (const side of ['n', 's', 'o', 'e']) {
      const alongX = side === 'n' || side === 's';
      const from = (alongX ? r.minX : r.minZ) - 1;
      const to = (alongX ? r.maxX : r.maxZ) + 1;
      const fixed = side === 'n' ? r.minZ - 0.5 : side === 's' ? r.maxZ + 0.5 : side === 'o' ? r.minX - 0.5 : r.maxX + 0.5;
      const gaps = gapsBy[side].sort((a, b) => a[0] - b[0]);
      let a = from;
      for (const [at, w] of [...gaps, [to + 10, 0]]) {
        const b = Math.min(at - w / 2, to);
        if (b - a > 0.05) {
          const h = WALL_H - 1 + ((k * 31) % 4);
          const mat = mats[k++ % mats.length];
          if (alongX) this.block(b - a, h, 1, mat, (a + b) / 2, fixed);
          else this.block(1, h, b - a, mat, fixed, (a + b) / 2);
          // Ventanas encendidas hacia dentro (para que la sección se lea de noche).
          const face = fixed + (side === 'n' || side === 'o' ? 0.53 : -0.53);
          for (let c = a + 2; c < b - 1.5; c += 4.5) {
            const m = (Math.round(c * 3) + k) % 3 === 0 ? M.window : M.glass;
            if (alongX) this.block(1.1, 1.4, 0.06, m, c, face, 3.5, false);
            else this.block(0.06, 1.4, 1.1, m, face, c, 3.5, false);
          }
        }
        a = at + w / 2;
      }
    }
    for (const [side, at] of def.entries) this.niche(id, r, side, at, M);
  }

  // Entrada de zombis en el muro de una sección: hueco con un nicho detrás (fuera de la vista) y
  // tablones rotos en la boca.
  niche(section, r, side, at, M) {
    const n = NORMALS[side]; // hacia dentro
    const out = n.clone().negate();
    const edge = side === 'n' ? new THREE.Vector3(at, 0, r.minZ) : side === 's' ? new THREE.Vector3(at, 0, r.maxZ) : side === 'o' ? new THREE.Vector3(r.minX, 0, at) : new THREE.Vector3(r.maxX, 0, at);
    const depth = 3;
    const back = edge.clone().addScaledVector(out, 1 + depth + 0.3);
    const alongX = side === 'n' || side === 's';
    if (alongX) this.block(NICHE_W + 1.2, 4.5, 0.6, M.brickDark, back.x, back.z);
    else this.block(0.6, 4.5, NICHE_W + 1.2, M.brickDark, back.x, back.z);
    const mid = edge.clone().addScaledVector(out, 1 + depth / 2);
    for (const s of [-1, 1]) {
      if (alongX) this.block(0.6, 4.5, depth + 1, M.brickDark, mid.x + s * (NICHE_W / 2 + 0.3), mid.z);
      else this.block(depth + 1, 4.5, 0.6, M.brickDark, mid.x, mid.z + s * (NICHE_W / 2 + 0.3));
    }
    const entry = {
      id: this.entries.length,
      section,
      side,
      spawn: edge.clone().addScaledVector(out, 1 + depth * 0.55),
      entry: edge.clone().addScaledVector(n, 2),
      center: edge.clone(),
    };
    this.entries.push(entry);
    this.barricade(entry, edge.clone(), alongX ? 'x' : 'z', NICHE_W, n, M);
  }

  // Vestíbulo: cuarto de inicio con cuatro ventanas tapiadas (la horda sale de la tierra al otro lado)
  // y la puerta a la plaza. El callejón sur, con la puerta de la Iglesia, da a este cuarto.
  lobby(M) {
    const r = LOBBY;
    const T = 0.8; // grosor de los muros
    const mat = M.plasterWarm;
    const gapsBy = { n: [[LOBBY_DOOR.at, LOBBY_DOOR.width]], o: [], e: [] };
    for (const [side, at] of LOBBY_WINDOWS) gapsBy[side].push([at, WINDOW_W]);
    const lines = { n: { alongX: true, fixed: r.minZ, from: r.minX - T / 2, to: r.maxX + T / 2 }, o: { alongX: false, fixed: r.minX, from: r.minZ, to: r.maxZ }, e: { alongX: false, fixed: r.maxX, from: r.minZ, to: r.maxZ } };
    for (const [side, L] of Object.entries(lines)) {
      const gaps = gapsBy[side].sort((a, b) => a[0] - b[0]);
      let a = L.from;
      for (const [at, w] of [...gaps, [L.to + 10, 0]]) {
        const b = Math.min(at - w / 2, L.to);
        if (b - a > 0.05) {
          if (L.alongX) this.block(b - a, r.wallH, T, mat, (a + b) / 2, L.fixed);
          else this.block(T, r.wallH, b - a, mat, L.fixed, (a + b) / 2);
        }
        if (at < L.to) {
          // Dintel sobre el hueco (ventana o puerta).
          const y0 = w === WINDOW_W ? 2.6 : DOOR_H;
          if (L.alongX) this.block(w, r.wallH - y0, T, mat, at, L.fixed, y0);
          else this.block(T, r.wallH - y0, w, mat, L.fixed, at, y0);
        }
        a = at + w / 2;
      }
    }
    // Ventanas: el jugador no puede salir por ellas; la horda entra arrancando los tablones.
    for (const [side, at] of LOBBY_WINDOWS) {
      const inward = side === 'n' ? new THREE.Vector3(0, 0, 1) : side === 'o' ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(-1, 0, 0);
      const mouth = side === 'n' ? new THREE.Vector3(at, 0, r.minZ) : side === 'o' ? new THREE.Vector3(r.minX, 0, at) : new THREE.Vector3(r.maxX, 0, at);
      const alongX = side === 'n';
      if (alongX) this.playerBlocker(at - WINDOW_W / 2, at + WINDOW_W / 2, mouth.z - 0.5, mouth.z + 0.5);
      else this.playerBlocker(mouth.x - 0.5, mouth.x + 0.5, at - WINDOW_W / 2, at + WINDOW_W / 2);
      const entry = {
        id: this.entries.length,
        section: 'lobby',
        side,
        rise: true, // salen de la tierra al otro lado de la ventana
        spawn: mouth.clone().addScaledVector(inward, -5),
        entry: mouth.clone().addScaledVector(inward, 2),
        center: mouth.clone(),
      };
      this.entries.push(entry);
      this.barricade(entry, mouth, alongX ? 'x' : 'z', WINDOW_W, inward, M);
    }
    this.door('plaza', new THREE.Vector3(LOBBY_DOOR.at, 0, r.minZ), { across: 'x', inward: new THREE.Vector3(0, 0, 1), width: LOBBY_DOOR.width }, M);
    // Luz del cuarto (cálida, colgada del muro).
    this.block(1.4, 0.08, 0.2, M.lamp, 0, r.maxZ - 0.15, 3.6, false);
  }

  // Caja misteriosa: un arma al azar por puntos, con su haz de luz que se ve desde lejos.
  mysteryBox({ x, z, ry }, M) {
    const g = new THREE.Group();
    g.userData.dynamic = true;
    const box = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.85, 0.85), M.wood);
    box.position.y = 0.425;
    g.add(box);
    const band = new THREE.Mesh(new THREE.BoxGeometry(1.74, 0.07, 0.89), glow('#7fd4ff'));
    band.position.y = 0.78;
    g.add(band);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.2), new THREE.MeshBasicMaterial({ map: signTexture('?', '#7fd4ff'), transparent: true, toneMapped: false }));
    sign.position.set(0, 0.45, 0.43);
    g.add(sign);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 40, 12, 1, true), new THREE.MeshBasicMaterial({ color: '#7fd4ff', transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    beam.position.y = 20;
    beam.userData.noShadow = true;
    g.add(beam);
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    this.scene.add(g);
    g.updateMatrixWorld(true);
    this.solids.push(box);
    this.colliders.push(new THREE.Box3().setFromObject(box));
    const front = new THREE.Vector3(Math.sin(ry), 0, Math.cos(ry));
    this.interactables.push({ kind: 'box', id: 'box', pos: new THREE.Vector3(x, 0, z).addScaledVector(front, 1.1), radius: 1.7 });
  }

  mercado(M) {
    const b = this.block.bind(this);
    // Puestos: mostrador, postes y toldo de tela.
    for (const [x, z, cloth] of [[6, -44, M.clothA], [13, -40, M.clothB], [20, -46, M.clothC]]) {
      b(2.6, 0.9, 1.2, M.wood, x, z);
      for (const [dx, dz] of [[-1.3, -0.7], [1.3, -0.7], [-1.3, 0.7], [1.3, 0.7]]) b(0.08, 2.4, 0.08, M.metal, x + dx, z + dz, 0, false);
      b(3, 0.06, 1.8, cloth, x, z, 2.4, false);
      for (let i = 0; i < 3; i++) b(0.5, 0.35, 0.4, M.wood, x - 0.8 + i * 0.8, z, 0.9, false); // cajas de fruta
    }
    for (const [x, z, s] of [[3.5, -50, 1.1], [4.4, -50.8, 0.8], [22.5, -38.5, 1]]) b(s, s, s, M.wood, x, z);
    this.car(18, -51.2, 0.15, M.carB, M);
    for (const [x, z] of [[3, -36.5], [23, -36.5], [8, -52.5]]) this.lamp(x, z, M);
    this.fireBarrel(10, -48.5, M);
  }

  estacion(M) {
    const b = this.block.bind(this);
    // Vagón de tren abandonado en medio del andén (cobertura grande).
    b(14, 3.1, 3, M.train, 46, 9);
    for (let x = 40.5; x <= 51.5; x += 2.75) b(1.6, 0.9, 0.06, M.window, x, 7.47, 1.6, false);
    for (const x of [41, 51]) b(0.9, 0.3, 3.2, M.metal, x, 9, 0, false); // bogies
    // Columnas y marquesina del andén.
    for (const [x, z] of [[38, 2], [54, 2], [38, 17], [54, 17]]) b(0.6, 4.5, 0.6, M.concrete, x, z);
    b(18, 0.18, 17, M.metal, 46, 9.5, 4.5, false);
    for (const [x, z] of [[41, 18.5], [51, 18.5], [41, 0.5], [51, 0.5]]) b(2.2, 0.5, 0.6, M.wood, x, z);
    for (const [x, z] of [[38, 2.6], [54, 2.6], [38, 16.4], [54, 16.4]]) b(0.6, 0.08, 0.2, M.lamp, x, z, 4.2, false);
    this.fireBarrel(36.5, 19.5, M);
  }

  iglesia(M) {
    const b = this.block.bind(this);
    // Ruinas de la capilla: muro del fondo, laterales rotos y restos de la fachada.
    b(10, 5, 0.7, M.plaster, 2, 52);
    for (const x of [-3, 7]) b(0.7, 3.5, 6, M.plaster, x, 48.6);
    b(2, 2, 0.7, M.plaster, -1.5, 44.6);
    b(2, 1.2, 0.7, M.plaster, 5.5, 44.6);
    b(0.22, 2.4, 0.22, M.wood, 2, 51.4, 0, false); // cruz
    b(1.1, 0.2, 0.22, M.wood, 2, 51.4, 1.65, false);
    // Lápidas.
    for (const x of [-11, -8, -5, 9, 12, 15]) for (const z of [38, 41]) b(0.6, 0.9, 0.18, M.concrete, x, z);
    for (const [x, z] of [[-12, 36], [16, 36], [-6, 54]]) this.lamp(x, z, M);
    for (const [x, z] of [[-10, 52], [14, 52.5]]) this.fireBarrel(x, z, M);
  }

  // Máquina de bebidas: cuerpo, letrero luminoso con el nombre y una franja del color de la bebida.
  perkMachine(id, x, z, ry, M) {
    const perk = PERKS[id];
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.1, 0.8), M.machine);
    body.position.y = 1.05;
    g.add(body);
    const light = glow(perk.color);
    for (const [w, h, y] of [[1.02, 0.06, 1.95], [1.02, 0.06, 0.25], [0.07, 1.6, 1.1]]) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.02), light);
      strip.position.set(w < 0.1 ? 0.45 : 0, y, 0.41);
      g.add(strip);
    }
    // Ventana con la botella.
    const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.42, 10), light);
    bottle.position.set(0, 1.15, 0.36);
    g.add(bottle);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.06, 0.17), new THREE.MeshBasicMaterial({ map: signTexture(perk.name, perk.color), transparent: true, toneMapped: false }));
    sign.position.set(0, 1.68, 0.405);
    g.add(sign);
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    this.scene.add(g);
    g.updateMatrixWorld(true);
    this.solids.push(body);
    this.colliders.push(new THREE.Box3().setFromObject(body));
    const front = new THREE.Vector3(Math.sin(ry), 0, Math.cos(ry));
    this.interactables.push({ kind: 'perk', id, pos: new THREE.Vector3(x, 0, z).addScaledVector(front, 1.1), radius: 1.6 });
  }

  // Arma de la pared: silueta pintada con el nombre y el arma real colgada (llega async).
  wallBuy(id, x, z, side) {
    const n = NORMALS[side];
    const at = new THREE.Vector3(x, 1.45, z).addScaledVector(n, 0.04);
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.25), new THREE.MeshBasicMaterial({ map: signTexture(WEAPONS[id].name, '#e8e2c8'), transparent: true, toneMapped: false }));
    panel.position.copy(at).setY(1.05);
    panel.lookAt(at.clone().setY(1.05).add(n));
    panel.userData.dynamic = true;
    this.scene.add(panel);
    const frame = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.55), new THREE.MeshBasicMaterial({ color: '#d8d0b0', transparent: true, opacity: 0.12, depthWrite: false }));
    frame.position.copy(at);
    frame.lookAt(at.clone().add(n));
    frame.userData.dynamic = true;
    this.scene.add(frame);
    this.interactables.push({ kind: 'wallbuy', id, pos: new THREE.Vector3(x, 0, z).addScaledVector(n, 0.9), radius: 1.7 });
    // El arma: cañón a lo largo de la pared, centrada en el panel.
    const along = new THREE.Vector3(n.z, 0, -n.x); // dirección del cañón
    const yaw = Math.atan2(-along.x, -along.z); // el modelo apunta a -Z
    const length = { pistol: 0.25, magnum: 0.3, smg: 0.6, rifle: 0.9, burst: 0.85, shotgun: 1.0, lmg: 1.1, dmr: 1.0, sniper: 1.2 }[id] ?? 0.9;
    const origin = at.clone().addScaledVector(n, 0.06).addScaledVector(along, -length / 2).setY(1.6);
    return { id, position: origin, rotation: new THREE.Euler(0, yaw, 0) };
  }

  // --- Puertas -------------------------------------------------------------------------------------

  isOpen(section) {
    return section === 'lobby' || !!this.doors[section]?.open;
  }

  /** Abre una puerta: deja de bloquear (balas, vista y paso) y se cae. Devuelve false si ya estaba. */
  openDoor(id) {
    const d = this.doors[id];
    if (!d || d.open) return false;
    d.open = true;
    d.t = 0;
    const i = this.colliders.indexOf(d.collider);
    if (i >= 0) this.colliders.splice(i, 1);
    const j = this.solids.indexOf(d.solid);
    if (j >= 0) this.solids.splice(j, 1);
    return true;
  }

  /** Todas las puertas cerradas otra vez (al empezar una partida). */
  resetDoors() {
    for (const d of Object.values(this.doors)) {
      if (!d.open) continue;
      d.open = false;
      d.group.visible = true;
      d.group.position.copy(d.home);
      d.group.rotation.set(0, 0, 0);
      this.colliders.push(d.collider);
      this.solids.push(d.solid);
    }
  }

  update(dt) {
    // Parpadeo del fuego (brillo variable, no aleatorio cuadro a cuadro: suave).
    this.fireT += dt;
    const k = 0.82 + 0.12 * Math.sin(this.fireT * 9.3) + 0.06 * Math.sin(this.fireT * 23.7);
    const base = this.fireMat.userData.glow;
    if (base) this.fireMat.color.copy(base).multiplyScalar(k * glowScale());
    this.flames.forEach((f, i) => {
      const s = 0.8 + 0.25 * Math.sin(this.fireT * (11 + i * 3.7) + i) + 0.1 * Math.sin(this.fireT * 29 + i * 2);
      f.scale.set(1, s, 1);
      f.position.y = 0.9 + (f.userData.base * s) / 2;
      f.rotation.y += 0.03;
    });
    // Tablones de las barricadas: los arrancados salen volando hacia fuera; los reparados entran.
    for (const b of this.barricades) {
      for (const p of b.planks) {
        if (p.t < 0) continue;
        p.t += dt;
        if (p.dir < 0) {
          const k = p.t;
          p.mesh.position.copy(p.home).addScaledVector(b.inward, -k * 3.2);
          p.mesh.position.y = p.home.y + k * 2 - k * k * 9;
          p.mesh.rotation.set(p.rot.x + k * 6, p.rot.y + k * 3, p.rot.z + k * 5);
          if (k > 0.55) {
            p.mesh.visible = false;
            p.t = -1;
          }
        } else {
          const k = Math.min(1, p.t / 0.2);
          p.mesh.position.copy(p.home).addScaledVector(b.inward, (1 - k) * 0.7);
          p.mesh.rotation.copy(p.rot);
          if (k >= 1) p.t = -1;
        }
      }
    }
    // Puertas recién abiertas: los tablones se hunden y desaparecen.
    for (const d of Object.values(this.doors)) {
      if (!d.open || !d.group.visible) continue;
      d.t += dt;
      d.group.position.y = d.home.y - d.t * d.t * 6;
      d.group.rotation.x = Math.min(0.6, d.t * 1.2);
      if (d.t > 0.9) d.group.visible = false;
    }
  }
}
