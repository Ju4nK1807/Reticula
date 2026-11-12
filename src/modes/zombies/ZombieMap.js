import * as THREE from 'three';
import { SKIES, createSky } from '../../gfx/sky.js';
import { glow, glowScale, paint, surface } from '../../gfx/surfaces.js';
import { signTexture } from '../../gfx/canvasTextures.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { World } from '../../scenes/World.js';
import { Props } from '../../physics/Props.js';
import { withObb } from '../../physics/obb.js';
import { placeWeapons } from '../../scenes/props.js';
import { WEAPONS } from '../../combat/weapons.js';
import { BARRICADE, DOORS, PERKS, doorSection } from './zombieData.js';
import { setZombieDetail } from './zombieLook.js';
import { HEIGHT_FOG, LIGHTS_FOR, LightPool, applyHeightFog, fireField, fogBanks, lightShapes } from './atmosphere.js';
import { darkWindow, decalTexture, litWindow } from './facadeTextures.js';
import { HOSPITAL, SUBESTACION, buildHospital, buildSubestacion, sign } from './sections.js';
import { buildCircus, circusMaterials } from './circo.js';
import { DECK_H, FERIA, buildFeria, feriaFloors } from './feria.js';

const plankGeo = new THREE.BoxGeometry(1, 1, 1);
// Bancos de niebla según el detalle: son cuadros transparentes grandes (cuestan relleno de píxeles), así
// que en GPUs modestas van menos y algo más densos.
const BANKS = { alta: 60, media: 22, baja: 12 };
const BANK_OPACITY = { alta: 0.46, media: 0.58, baja: 0.62 };
// Ambiente del mapa: la noche normal (historia) y la de terror del modo zombi (setDread), casi a oscuras
// y con más niebla: sin la linterna se ve muy poco.
const CALM = {
  hemi: 1.05, moon: 1.45, env: 0.3, background: '#1e2734', fogNear: 2, fogFar: 34,
  hfog: [0.13, 0.32, 0, 1], hfogColor: '#4b586c', banks: '#76839a', bankMul: 1,
  sky: { horizon: '#1e2734', glowAmount: SKIES.fire.glowAmount, stars: SKIES.fire.stars, moon: 1 },
};
const DREAD = {
  hemi: 0.1, moon: 0.1, env: 0.06, background: '#07090c', fogNear: 0.5, fogFar: 20,
  hfog: [0.27, 0.28, 0, 1], hfogColor: '#11151b', banks: '#232a33', bankMul: 1.35,
  sky: { horizon: '#07090c', glowAmount: 0.22, stars: 0.12, moon: 0.25 },
};

// Franjas rojas y blancas en diagonal (vallas de obra).
function stripeTexture() {
  if (typeof document === 'undefined') return new THREE.Texture();
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 16;
  const g = c.getContext('2d');
  g.fillStyle = '#d8d2c4';
  g.fillRect(0, 0, 128, 16);
  g.fillStyle = '#a3241c';
  for (let x = -16; x < 128; x += 32) {
    g.beginPath();
    g.moveTo(x, 16);
    g.lineTo(x + 16, 0);
    g.lineTo(x + 32, 0);
    g.lineTo(x + 16, 16);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
const _plank = new THREE.Object3D();
const _scale = new THREE.Vector3();
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);

// Une los hijos de un grupo por material (con su transformación local): una malla por material.
function mergeChildren(group) {
  const byMat = new Map();
  for (const m of group.children) {
    if (!m.isMesh) continue;
    m.updateMatrix();
    if (!byMat.has(m.material)) byMat.set(m.material, []);
    byMat.get(m.material).push(m.geometry.clone().applyMatrix4(m.matrix));
  }
  group.clear();
  for (const [mat, geos] of byMat) {
    const geo = mergeGeometries(geos.map((g) => (g.index ? g.toNonIndexed() : g)), false);
    for (const g of geos) g.dispose();
    group.add(new THREE.Mesh(geo, mat));
  }
}

/*
  "Barrio en ruinas": se empieza encerrado en el Circo (una carpa abandonada, circo.js) junto a una
  plaza nocturna rodeada de edificios y, detrás de puertas tapiadas que se compran con puntos (más caras
  cuanto más lejos), seis secciones más: el Mercado (norte), la Estación (este), la Iglesia (sur), la
  Subestación (oeste, con el generador que da la luz), el Hospital (noroeste, con la Forja; se llega
  desde la Subestación o desde el Mercado) y la Feria (sureste, con un segundo piso: feria.js; se llega
  desde la Estación o desde la Iglesia). Al estilo de los modos de supervivencia clásicos: el mapa se
  abre a medida que se gana y sin electricidad las farolas, las bebidas y la Forja no funcionan.

  - entries: [{ id, section, spawn, entry, center }] — por dónde entra la horda. Cada sección tiene las
    suyas (callejones de la plaza, nichos en los muros de las secciones); solo se usan las de las
    secciones abiertas.
  - doors: { [puerta]: { section, open, collider, solid, group } } · isOpen(sección) · openDoor(id) ·
    resetDoors(). Las puertas se compran desde cualquiera de sus dos lados.
  - interactables: [{ kind: 'door' | 'wallbuy' | 'perk' | 'box' | 'power' | 'forge', id, pos, radius }]
    — lo que se usa con la tecla de usar (E): puertas, armas de la pared, bebidas, la caja misteriosa,
    la palanca del generador y la Forja.
  - setPower(on): la electricidad (luces, máquinas y la Forja).
  - nav: límites para la cuadrícula de navegación (todo el mapa).
  - floorAt(x, z, y): altura del piso (0, o la terraza y las escaleras de la Feria) para el jugador,
    los zombis, la sangre y lo que se usa con E.
  - update(dt): luces, fuego de los barriles, palanca, baliza, tablones y caída de las puertas.
*/

export const PLAZA = 22; // m: la plaza va de -PLAZA a +PLAZA en x y z
const WALL_H = 9;
const ALLEY_W = 4.2;
const OUTSIDE = 9; // m que se extiende cada callejón hacia fuera
const NICHE_W = 2.6; // ancho de las entradas de zombis en los muros de las secciones
const DOOR_H = 3.6;
// Veredas de la plaza: [x, z, ancho, largo] (losas: se pisan por encima con floorAt).
const SIDEWALKS = [[0, -PLAZA + 1.5, PLAZA * 2, 3], [0, PLAZA - 1.5, PLAZA * 2, 3], [-PLAZA + 1.5, 0, 3, PLAZA * 2 - 6], [PLAZA - 1.5, 0, 3, PLAZA * 2 - 6]];
const SIDEWALK_H = 0.12;
const STEP = 0.6; // m: escalón más alto que se sube caminando (escaleras de la Feria)

// Callejones: lado (n/s/e/o) y posición a lo largo de ese lado. `door`: lleva a esa sección (no es
// una entrada de zombis: la tapia una puerta que se compra).
const ALLEYS = [
  { side: 'n', at: -10 },
  { side: 'n', at: 11, door: 'mercado' },
  { side: 's', at: 2, door: 'iglesia' },
  { side: 'o', at: -6 },
  { side: 'o', at: -16, door: 'subestacion' },
  { side: 'e', at: -12 },
  { side: 'e', at: 9, door: 'estacion' },
];

// Secciones: rectángulo, huecos por donde llegan los callejones o pasillos y entradas de zombis.
// Lados del rectángulo: n = minZ, s = maxZ, o = minX, e = maxX.
const SECTIONS = {
  mercado: { rect: { minX: 0, maxX: 26, minZ: -54, maxZ: -34 }, openings: [['s', 11], ['o', -52]], entries: [['n', 6], ['n', 20], ['e', -44]], floor: ['cobble', '#3d3a38'], walls: ['brick', 'plasterDamaged', 'peeling', 'brickDark'] },
  estacion: { rect: { minX: 34, maxX: 58, minZ: -4, maxZ: 22 }, openings: [['o', 9], ['s', 55]], entries: [['e', 2], ['e', 16], ['n', 46]], floor: ['concrete', '#4b4f55'], walls: ['shutter', 'concrete', 'peelingBlue', 'brickDark'] },
  iglesia: { rect: { minX: -14, maxX: 18, minZ: 34, maxZ: 56 }, openings: [['n', 2], ['e', 40]], entries: [['s', -6], ['s', 10], ['o', 46]], floor: ['mud', '#3a3226'], walls: ['stoneWall', 'stoneWall', 'plasterDamaged'] },
  subestacion: { rect: SUBESTACION, openings: [['e', -16], ['n', -46]], entries: [['o', -29], ['s', -54], ['s', -40]], floor: ['concrete_floor', '#44474c'], walls: ['shutter', 'concrete', 'brickDark'] },
  hospital: { rect: HOSPITAL, openings: [['s', -46], ['e', -52]], entries: [['n', -49], ['n', -21], ['o', -52]], floor: ['tiles_dirty', '#5d635e'], walls: ['peeling', 'plasterDamaged', 'peeling', 'concrete'] },
  feria: { rect: FERIA, openings: [['n', 55], ['o', 40]], entries: [['n', 38], ['s', 42], ['o', 49], ['e', 36]], floor: ['mud', '#3b3128'], walls: ['plasterDamaged', 'brickDark', 'shutter', 'brick'] },
};
// Pasillos entre secciones con su puerta (se compra desde los dos lados): eje del pasillo, posición
// fija en el otro eje, de dónde a dónde va.
const PASSAGES = [
  { door: 'hospital', axis: 'z', at: -46, from: -39, to: -33 },
  { door: 'hospital-mercado', axis: 'x', at: -52, from: -13, to: -1 },
  { door: 'feria', axis: 'z', at: 55, from: 23, to: 29 },
  { door: 'feria-iglesia', axis: 'x', at: 40, from: 19, to: 27 },
];

// Circo: cuarto de inicio cerrado (al estilo de los mapas clásicos), en el sur de la plaza: una carpa
// abandonada (circo.js). Ventanas tapiadas por donde entra la horda y dos puertas: a la plaza (norte) y
// a la iglesia (el callejón sur).
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
  ['aliento', -55.5, -45, Math.PI / 2], // en el depósito del hospital
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
  ['shotgun', -54.5, -13, 'n'], // en la caseta del generador (Subestación)
  ['rifle', -14, -48, 'e'], // en la farmacia del hospital
  ['ray', 60, 50.5, 'e', DECK_H], // arma especial: arriba, en la terraza de la Casa de la Risa (Feria)
];
// Lugares de la caja misteriosa: empieza en la plaza y, cada tantos usos, se muda a otro.
export const BOX_SPOTS = [
  { x: -8, z: -3, ry: Math.PI / 2, where: 'la Plaza' },
  { x: 12, z: -36.2, ry: Math.PI, where: 'el Mercado' },
  { x: 56.8, z: 19, ry: -Math.PI / 2, where: 'la Estación' },
  { x: -8, z: 50, ry: Math.PI / 2, where: 'la Iglesia' },
  { x: -38.7, z: -25.6, ry: 0, where: 'la Subestación' },
  { x: -35, z: -41, ry: Math.PI, where: 'el Hospital' },
];
const FORGE_SPOT = { x: -30.5, z: -62.9, ry: 0 }; // Forja: en el quirófano del hospital
const NORMALS = { n: new THREE.Vector3(0, 0, 1), s: new THREE.Vector3(0, 0, -1), o: new THREE.Vector3(1, 0, 0), e: new THREE.Vector3(-1, 0, 0) };
// Manchas del suelo: sangre seca, aceite, charcos (casi espejos: reflejan las luces) y basura.
const decalMat = (opts) => new THREE.MeshStandardMaterial({ transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, metalness: 0, ...opts });
const DECAL_MATERIALS = {
  blood: () => decalMat({ color: '#2a0504', roughness: 0.3, alphaMap: decalTexture('splat') }),
  oil: () => decalMat({ color: '#050505', roughness: 0.12, alphaMap: decalTexture('blob') }),
  puddle: () => decalMat({ color: '#07090c', roughness: 0.03, alphaMap: decalTexture('blob'), envMapIntensity: 2.2 }),
  litter: () => decalMat({ map: decalTexture('litter'), roughness: 0.9, alphaTest: 0.4, transparent: false, depthWrite: true }),
};

export class ZombieMap extends World {
  constructor() {
    super({
      name: 'Barrio en ruinas',
      // Noche con niebla espesa (al estilo de los mapas de zombis clásicos): a unos 30 m ya casi no se ve.
      background: '#1e2734',
      fogNear: 2,
      fogFar: 34,
      spawn: new THREE.Vector3(0, 0, 16), // en el circo, en medio de la pista
      // El jugador puede ir a todo el mapa: lo limitan los muros y las puertas cerradas.
      playerZone: { minX: -70, maxX: 70, minZ: -72, maxZ: 70 },
    });
    const scene = this.scene;
    // Luna fría y relleno muy bajo: la noche se lee por las farolas y el fuego (luces de verdad).
    this.hemi = new THREE.HemisphereLight('#8ea6cc', '#262019', 1.05);
    scene.add(this.hemi);
    // Cielo procedural (degradado, resplandor en el horizonte, estrellas y luna) que se funde con la niebla.
    this.sky = createSky({ ...SKIES.fire, horizon: '#1e2734' });
    scene.add(this.sky);
    const moon = new THREE.DirectionalLight('#b9cdf5', 1.45);
    moon.position.set(-18, 30, 12);
    scene.add(moon);
    this.moon = moon;
    this.dread = false;
    this.envIntensity = 0.3;
    this.groundY = 0.02; // el asfalto es una losa de 2 cm
    // Luces del mapa: fuentes que se reparten un puñado de luces reales (atmosphere.js), conos bajo las
    // farolas y charcos de luz en el suelo. Las farolas y las máquinas necesitan la electricidad.
    this.lights = new LightPool(scene);
    this.cones = [];
    this.pools = [];
    this.powerGlows = []; // materiales que se apagan sin electricidad
    this.powerSigns = []; // carteles (texturas) que se oscurecen sin electricidad
    this.powered = false;
    this.camera = null; // la pone el modo: las luces se reparten según lo que mira el jugador

    const M = {
      asphalt: surface('road', '#24272c'),
      cobble: surface('cobble', '#3b3b3d'),
      sidewalk: surface('tiles', '#3b3f46'),
      gravel: surface('gravel', '#2e3238'),
      mud: surface('mud', '#3a3226'),
      brick: surface('brick', '#5a3e35'),
      brickDark: surface('brick', '#3f2c27'),
      plaster: surface('plaster', '#4c4f55'),
      plasterWarm: surface('plaster', '#5e5446'),
      plasterDamaged: surface('plaster_damaged', '#6a6258'),
      peeling: surface('wall_peeling', '#56605a'),
      peelingBlue: surface('wall_peeling', '#46525e'),
      stoneWall: surface('stone_wall', '#4e4a44'),
      concrete: surface('concrete', '#5b5f66'),
      metal: surface('metal', '#3c424b'),
      rust: surface('rust', '#5a4434'),
      shutter: surface('rust_corrugated', '#4c3c30'),
      dumpster: surface('metal_panel', '#2f4636'),
      wood: surface('wood', '#5d4632'),
      sandbag: surface('plaster', '#6b604a'),
      sheet: paint('#9c9a90', { roughness: 0.95, metalness: 0 }),
      curtain: paint('#4f6a64', { roughness: 0.95, metalness: 0 }),
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
      lamp: this.powerGlow('#ffd9a0'),
      lampWall: glow('#ffe1a8'),
      window: Object.assign(glow('#ffe0c0'), { map: litWindow() }),
      darkWindow: new THREE.MeshStandardMaterial({ map: darkWindow(), roughness: 0.22, metalness: 0.35 }),
      fire: glow('#ff8a3d'),
      line: new THREE.MeshStandardMaterial({ color: '#9a978c', roughness: 0.8 }),
    };
    this.materials = M;
    const block = this.block.bind(this);
    this.fires = []; // fuegos del mapa (llamas y humo: atmosphere.fireField)
    this.entries = [];
    this.doors = {};
    this.interactables = [];
    this.barricades = [];
    this.planks = []; // tablones de todas las barricadas (instancias de una malla)
    this.boxSpots = BOX_SPOTS;

    // Pisos con altura (floorAt): las veredas de la plaza (losas de 12 cm), la terraza y las escaleras de
    // la Feria (segundo piso).
    this.floors = [...SIDEWALKS.map(([x, z, w, d]) => ({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, h: SIDEWALK_H })), ...feriaFloors()];
    // --- Suelo ---------------------------------------------------------------------------------
    // Afueras de barro y grava; la plaza empedrada con veredas de baldosa y una calle que la cruza.
    this.ground(150, 150, -4, M.mud);
    block(PLAZA * 2, 0.02, PLAZA * 2, M.cobble, 0, 0, 0, false);
    block(PLAZA * 2 - 6, 0.025, 7, M.asphalt, 0, -4, 0, false);
    for (const [x, z, w, d] of SIDEWALKS) block(w, SIDEWALK_H, d, M.sidewalk, x, z, 0, false);
    for (let x = -16; x <= 16; x += 8) block(3, 0.03, 0.25, M.line, x, -4, 0.02, false); // marcas viales

    // --- Edificios del perímetro, con los huecos de los callejones -----------------------------------
    const sides = {
      n: { axis: 'x', fixed: -PLAZA - 3, inward: new THREE.Vector3(0, 0, 1) },
      s: { axis: 'x', fixed: PLAZA + 3, inward: new THREE.Vector3(0, 0, -1) },
      o: { axis: 'z', fixed: -PLAZA - 3, inward: new THREE.Vector3(1, 0, 0) },
      e: { axis: 'z', fixed: PLAZA + 3, inward: new THREE.Vector3(-1, 0, 0) },
    };
    const mats = [M.brick, M.plasterDamaged, M.brickDark, M.peeling, M.plasterWarm, M.brick, M.peelingBlue, M.plaster];
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
          this.building(side, a, a + w, h, mats[k % mats.length], M, k);
          a += w;
          k++;
        }
        from = g + ALLEY_W / 2;
      }
      for (const a of ALLEYS.filter((x) => x.side === id)) this.alley(side, a.at, M, id, a.door ?? null);
    }

    // --- Barreras, escombros y chatarra por todo el mapa (clutter, más abajo) ----------------------------
    this.clutter(M);

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
      withObb(this.colliders.at(-1), x, z, 1.6, 0.3, ry); // forma real para jugador, zombis y navegación
    }
    for (const [x, z] of [[-17, 6], [17, -16], [-8, -17]]) {
      for (let i = 0; i < 3; i++) block(1.1, 0.45, 0.7, M.sandbag, x + (i - 1) * 1.05, z, 0);
      for (let i = 0; i < 2; i++) block(1.1, 0.45, 0.7, M.sandbag, x + (i - 0.5) * 1.05, z, 0.45);
    }
    // Contenedores de basura y cajas.
    for (const [x, z] of [[-18, -18], [18.5, 17.5], [-19, 15]]) block(2.2, 1.4, 1.4, M.dumpster, x, z);
    // Cajas: dos en la vereda este (cobertura junto a los sacos terreros) y dos en la esquina del circo.
    for (const [x, z, s] of [[19.8, -17.6, 1], [20.9, -16.6, 0.8], [-12, 17, 1.1], [-11, 18.2, 0.8]]) this.crate(x, z, s);
    // Vallas rotas.
    for (const [x, z, w] of [[-4, 18.5, 6], [10, -19.5, 5]]) {
      block(w, 1.3, 0.12, M.metal, x, z, 0);
      for (let i = 0; i <= 2; i++) block(0.12, 1.5, 0.12, M.metal, x - w / 2 + (i * w) / 2, z, 0);
    }

    // --- Luces de la plaza: farolas y barriles con fuego ------------------------------------------------
    // Farolas con el brazo hacia el centro de la plaza; dos están rotas y titilan.
    for (const [x, z, broken] of [[-15, -15], [15, -15, true], [-15.5, 13], [15.5, 13], [-19, 0, true], [19, 0], [0, -19], [-6.5, -9.5], [7, 3.5]]) this.lamp(x, z, M, { ry: Math.atan2(-x, -z), broken });
    for (const [x, z] of [[-7, -12], [9, 6], [-15, 1], [4, 17]]) this.fireBarrel(x, z, M);
    this.fireT = 0;

    // --- Vestíbulo (inicio) y secciones que se abren con puertas -----------------------------------------
    this.lobby(M);
    buildCircus(this, LOBBY, this.spawn);
    for (const [id, def] of Object.entries(SECTIONS)) this.section(id, def, M);
    this.mercado(M);
    this.estacion(M);
    this.iglesia(M);
    buildSubestacion(this, M);
    buildHospital(this, M);
    buildFeria(this, M);
    for (const p of PASSAGES) this.passage(p, M);

    // --- Máquinas de bebidas y armas de la pared ---------------------------------------------------------
    for (const [perk, x, z, ry] of PERK_SPOTS) this.perkMachine(perk, x, z, ry, M);
    const placements = [];
    for (const [weapon, x, z, side, y0] of WALL_SPOTS) placements.push(this.wallBuy(weapon, x, z, side, y0));
    this.wallWeapons = placeWeapons(this.scene, placements).catch(() => null); // modelos 3D (llegan después)
    this.mysteryBox(BOX_SPOTS[0], M);
    this.forge(FORGE_SPOT, M);
    // Charcos (mojados: reflejan las luces) y manchas en la plaza y las calles.
    for (const [x, z, s, ry] of [[-6, 7, 2.6, 0.3], [10.5, -11, 3.2, 1.2], [-12.5, -7, 2.2, 2.2], [3, -17.5, 2.4, 0.7], [16.5, 5, 1.9, 1.9], [-4, -3.5, 2.8, 2.6], [6, 2, 1.6, 0.9], [44, 12, 3, 0.4], [10, -44, 2.5, 1.7]]) this.decal('puddle', x, z, s, ry);
    for (const [x, z, s, ry] of [[-9, 4.6, 1.4, 0.2], [13, -6, 1.1, 1.9], [-17, -14, 1.3, 2.8], [6.5, 12.2, 1.2, 0.6], [2, -3, 2.2, 1.1], [-4, -9, 1.6, 2.2], [10, 3, 1.8, 0.4], [-13, 8, 1.5, 1.6], [17, -14, 1.7, 2.9], [-6, 11, 1.2, 0.9], [4, -17, 1.9, 0.2], [-20, -4, 1.4, 2.5]]) this.decal('blood', x, z, s, ry);
    for (const [x, z, s, ry] of [[-3, 12, 1.8, 0.2], [18, -17, 2.2, 1.0], [-19, 9, 2, 2.3], [11, 17.5, 1.6, 0.4], [2, -36, 2.4, 1.6], [40, 4, 2, 2.2], [-8, 40, 2.6, 0.9]]) this.decal('litter', x, z, s, ry);

    // Navegación: todo el mapa (plaza, callejones, secciones y sus entradas).
    this.nav = { minX: -64, maxX: 68, minZ: -68, maxZ: 68 };
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
      ...[[-20.4, -9.6], [20.3, 5.6], [-6.5, -20.4], [14.8, 20.6], [20.4, -8.4]].map(([x, z]) => ({ type: 'trash', x, z })),
      { type: 'crate', x: 16.6, z: -11.8, ry: 0.3 },
      { type: 'crate', x: -3.2, z: -19.6, ry: -0.2 },
      { type: 'crate', x: -19.4, z: -2.9, ry: 0.6 },
      { type: 'crateSmall', x: -18.3, z: -2.4, ry: 0.2 },
      { type: 'crateSmall', x: 6, z: 19.6, ry: -0.5 },
      { type: 'barrel', x: -9.6, z: -14.4 },
      { type: 'barrelRed', x: 11.2, z: 9.6 },
      { type: 'barrel', x: -16.4, z: 12.6 },
      { type: 'barrelRed', x: 19.6, z: 12.0 },
      // En las secciones (se ven al abrirlas).
      { type: 'crate', x: 4.5, z: -38.5, ry: 0.4 },
      { type: 'barrel', x: -48.5, z: -26 },
      { type: 'barrelRed', x: -57.6, z: -11.4 },
      { type: 'cone', x: -44.5, z: -13, ry: 0.6 },
      { type: 'crateSmall', x: -26, z: -45, ry: 0.3 },
      { type: 'trash', x: -16.2, z: -52.6 },
      { type: 'can', x: -36.3, z: -59.6, y: 0.9 },
      { type: 'crateSmall', x: 23, z: -36.5, ry: -0.3 },
      { type: 'trash', x: 36, z: 1 },
      { type: 'barrel', x: 57, z: 13 },
      { type: 'cone', x: 44, z: 3, ry: 1 },
      { type: 'crate', x: -11.5, z: 54, ry: 0.2 },
    ]);
    // Tablones de las barricadas: una sola malla instanciada (una llamada de dibujo para todos).
    this.plankMesh = new THREE.InstancedMesh(plankGeo, M.wood, this.planks.length);
    this.plankMesh.userData.dynamic = true;
    this.plankMesh.frustumCulled = false;
    scene.add(this.plankMesh);
    for (const p of this.planks) this.writePlank(p);
    // Atmósfera: conos y charcos de luz (unidos en dos mallas), niebla baja en todo el mapa y la
    // utilería, y las luces reales repartidas (su número lo fija el detalle: setDetail).
    this.shapes = lightShapes(this.cones, this.pools);
    scene.add(this.shapes.group);
    this.fireFx = fireField(this.fires);
    scene.add(this.fireFx.group);
    // Niebla: bruma baja más espesa y clara (se ve "flotar" a la luz de las farolas) y bancos de niebla
    // que se mueven alrededor del jugador.
    HEIGHT_FOG.uHFog.value.set(0.13, 0.32, 0, 1);
    HEIGHT_FOG.uHFogColor.value.set('#4b586c');
    this.fog = fogBanks({ count: BANKS.alta, radius: 26, color: '#76839a', opacity: 0.46 });
    scene.add(this.fog.mesh);
    applyHeightFog(scene);
    this.lights.setCount(LIGHTS_FOR.alta);
    scene.updateMatrixWorld(true);
  }

  // --- Piezas de la plaza --------------------------------------------------------------------------

  // Edificio de fachada a lo largo de un lado, entre a y b: planta baja con persiana metálica de tienda
  // o puerta, pisos con ventanas (algunas encendidas, otras rotas), alféizares y dinteles, faja entre
  // pisos, cornisa, balcones, aparatos de aire y bajante. Todo estático: se une con el resto del mapa.
  building(side, a, b, h, mat, M, k = 0) {
    const depth = 6; // centrado en la línea del lado: la fachada interior queda en el borde de la plaza
    if (side.axis === 'x') this.block(b - a, h, depth, mat, (a + b) / 2, side.fixed);
    else this.block(depth, h, b - a, mat, side.fixed, (a + b) / 2);
    const n = side.axis === 'x' ? side.inward.z : side.inward.x;
    const face = side.fixed + n * (depth / 2);
    // Caja apoyada en la fachada: u a lo largo, y0 abajo, sale `out` metros hacia la plaza (empezando a
    // `off` metros de la pared).
    const at = (u, y0, w, hh, out, m, solid = false, off = 0) => {
      const c = face + n * (off + out / 2);
      if (side.axis === 'x') return this.block(w, hh, out, m, u, c, y0, solid);
      return this.block(out, hh, w, m, c, u, y0, solid);
    };
    const mid = (a + b) / 2;
    const w = b - a;
    at(mid, h - 0.42, w, 0.42, 0.32, M.concrete); // cornisa
    at(mid, 3.3, w, 0.2, 0.14, M.concrete); // faja entre la planta baja y el primer piso
    // Planta baja: tienda con persiana (dos de cada tres) o portal.
    if (k % 3 !== 1) {
      const sw = Math.min(4.2, w - 2);
      at(mid, 0, sw + 0.5, 2.95, 0.1, M.concrete); // marco
      at(mid, 0, sw, 2.7, 0.14, M.shutter);
      at(mid, 2.75, sw + 0.3, 0.38, 0.2, M.metal); // caja de la persiana
    } else {
      at(mid - 1, 0, 1.4, 2.6, 0.1, M.concrete);
      at(mid - 1, 0, 1.1, 2.4, 0.14, M.wood); // portal
      at(mid + 1.4, 1, 1.2, 1.3, 0.06, M.darkWindow);
    }
    // Pisos: ventanas con alféizar y dintel.
    let f = 0;
    for (let y = 4.1; y < h - 1.9; y += 3, f++) {
      for (let c = a + 1.6; c < b - 1.1; c += 2.6) {
        const r = ((Math.round(c * 7 + y * 13 + k * 3) % 7) + 7) % 7;
        at(c, y, 1.1, 1.55, 0.05, r === 0 || r === 4 ? M.window : M.darkWindow);
        at(c, y - 0.1, 1.36, 0.1, 0.2, M.concrete); // alféizar
        at(c, y + 1.55, 1.36, 0.14, 0.08, M.concrete); // dintel
        if (r === 2 && f === 0) at(c, y - 0.62, 0.7, 0.48, 0.42, M.metal); // aparato de aire
      }
      // Balcón corrido en el primer piso de algunos edificios.
      if (f === 0 && k % 4 === 2) {
        at(mid, y - 0.32, w - 1.4, 0.14, 1.0, M.concrete); // losa
        for (let c = a + 0.8; c <= b - 0.8; c += 0.45) at(c, y - 0.18, 0.035, 0.95, 0.035, M.metal, false, 0.94); // barrotes
        at(mid, y + 0.75, w - 1.4, 0.05, 0.06, M.metal, false, 0.92); // pasamanos
      }
    }
    // Bajante de agua en un extremo.
    const px = k % 2 ? a + 0.25 : b - 0.25;
    at(px, 0, 0.14, h - 0.3, 0.16, M.metal);
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
  // Los tablones de todas las barricadas son instancias de UNA malla (se crea al final del mapa).
  barricade(entry, mouth, along, width, inward) {
    const planks = [];
    for (let i = 0; i < BARRICADE.boards; i++) {
      const len = width + 0.35;
      const scale = along === 'x' ? new THREE.Vector3(len, 0.2, 0.06) : new THREE.Vector3(0.06, 0.2, len);
      const home = new THREE.Vector3(mouth.x, 0.45 + i * 0.3, mouth.z).addScaledVector(inward, 0.1 + (i % 2) * 0.05);
      // Se cruzan en diagonal, cada uno con su inclinación.
      const tilt = ((i % 3) - 1) * 0.16 + (i % 2 ? 0.05 : -0.05);
      const rot = along === 'x' ? new THREE.Euler(0, 0, tilt) : new THREE.Euler(tilt, 0, 0);
      const plank = { index: this.planks.length, home, rot, scale, t: -1, dir: 0, visible: true, pos: home.clone(), cur: rot.clone() };
      this.planks.push(plank);
      planks.push(plank);
    }
    entry.barricade = { boards: BARRICADE.boards, max: BARRICADE.boards, planks, mouth: mouth.clone(), inward: inward.clone(), along, width, entry };
    this.barricades.push(entry.barricade);
  }

  // Escribe la matriz de un tablón (posición y giro actuales; oculto = escala cero).
  writePlank(p) {
    if (!this.plankMesh) return;
    if (!p.visible) this.plankMesh.setMatrixAt(p.index, HIDDEN);
    else {
      _plank.position.copy(p.pos);
      _plank.rotation.copy(p.cur);
      _plank.scale.copy(p.scale);
      _plank.updateMatrix();
      this.plankMesh.setMatrixAt(p.index, _plank.matrix);
    }
    this.plankMesh.instanceMatrix.needsUpdate = true;
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
    p.visible = true;
    return true;
  }

  /** Todas las barricadas completas otra vez (al empezar una partida). */
  resetBarricades() {
    for (const b of this.barricades) {
      b.boards = b.max;
      for (const p of b.planks) {
        p.t = -1;
        p.dir = 0;
        p.visible = true;
        p.pos.copy(p.home);
        p.cur.copy(p.rot);
        this.writePlank(p);
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
    mergeChildren(group); // tablones y escombros: una malla por material (no 13 llamadas de dibujo)
    // Letrero con el nombre de la sección y el precio, uno de cada lado (un poco por delante: en el circo
    // la puerta tiene un dintel grueso encima). Se cae con la puerta al abrirla.
    const signMat = new THREE.MeshBasicMaterial({ map: signTexture(`${DOORS[id].name.toUpperCase()} · $${DOORS[id].price}`, '#ffd166'), transparent: true, toneMapped: false });
    const signGeo = new THREE.PlaneGeometry(3.2, 0.45);
    for (const k of [1, -1]) {
      const sign = new THREE.Mesh(signGeo, signMat);
      sign.position.set(0, DOOR_H + 0.4, 0).addScaledVector(side.inward, 0.5 * k);
      sign.lookAt(sign.position.clone().addScaledVector(side.inward, 10 * k)); // de frente, sin inclinarse
      group.add(sign);
    }
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
    this.doors[id] = { id, section: doorSection(id), open: false, group, solid, collider, t: 0, home: center.clone() };
    // Se compra desde los dos lados (en el circuito del hospital se puede llegar por detrás).
    for (const k of [1, -1]) this.interactables.push({ kind: 'door', id, pos: center.clone().addScaledVector(side.inward, 1.2 * k), radius: 2.8 });
  }

  // Pasillo entre dos secciones: dos muros paralelos y su puerta en el medio.
  passage({ door, axis, at, from, to }, M) {
    const len = to - from;
    const mid = (from + to) / 2;
    const off = ALLEY_W / 2 + 0.3;
    for (const s of [-1, 1]) {
      if (axis === 'z') this.block(0.6, WALL_H - 2, len, M.brickDark, at + s * off, mid);
      else this.block(len, WALL_H - 2, 0.6, M.brickDark, mid, at + s * off);
    }
    const center = axis === 'z' ? new THREE.Vector3(at, 0, mid) : new THREE.Vector3(mid, 0, at);
    const inward = axis === 'z' ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
    this.door(door, center, { across: axis === 'z' ? 'x' : 'z', inward, width: ALLEY_W }, M);
    // Luz de emergencia roja sobre la puerta (funciona sin electricidad).
    this.lights.add({ pos: center.clone().setY(DOOR_H + 0.8), color: '#ff4030', intensity: 10, distance: 7, power: false, flicker: 'broken' });
  }


  // Auto: carrocería, cabina con vidrios y ruedas. Bloquea balas y paso.
  // --- Barreras y chatarra --------------------------------------------------------------------------
  // Para que el barrio no se vea vacío: barreras de concreto, muros de sacos, autos quemados, pilas de
  // neumáticos, palés, montones de escombros y vallas de obra. Bloquean el paso y las balas con su forma
  // real (OBB); las posiciones dejan libres las entradas de zombis, las puertas y las compras (lo vigila
  // tests/zombieMap.test.js).
  clutter(M) {
    const burnt = paint('#1c1a18', { roughness: 0.85, metalness: 0.3 });
    const rustCar = paint('#4a2a1c', { roughness: 0.8, metalness: 0.35 });
    // Barreras de concreto tipo New Jersey: [x, z, giro].
    for (const [x, z, ry] of [[8.5, -12.5, 0.8], [-12.5, -1.5, 1.45], [13.5, 13.2, 0.3], [-4.5, 7.5, -0.2], [3.5, -41.5, 1.57], [52.5, -1.2, 0.15], [-46.5, -19.5, 0.35], [-24, -46, 0.2]]) this.jersey(x, z, ry, M);
    // Muros de sacos terreros: [x, z, giro, largo en sacos].
    for (const [x, z, ry, n] of [[-17.5, -15.5, 0.6, 3], [-13, 9, 0.1, 3], [38, 15.5, 0.3, 4], [-49.5, -26, 0.1, 3], [18.5, -38.5, 0.4, 3], [-48, -44, 1.57, 3]]) this.sandbagWall(x, z, ry, n, M);
    // Autos quemados u oxidados.
    this.car(-12.5, -8, 0.15, burnt, M);
    this.car(47.5, 4, 0, rustCar, M);
    this.car(-40.5, -8.5, 1.4, burnt, M);
    // Pilas de neumáticos, palés y escombros.
    for (const [x, z] of [[17.5, -1], [-19, -9.5], [24.5, -40], [55.5, 12], [-57.2, -21.5], [-18, -48]]) this.tires(x, z, M);
    for (const [x, z, ry] of [[-17.5, 10.5, 0.4], [7.5, -47.5, 1.1], [49.5, 19.8, 0.2], [-53, -49, 0.3]]) this.pallets(x, z, ry, M);
    for (const [x, z, sc] of [[-2.5, -14, 1], [11, 10.5, 0.8], [12.5, 49, 1.2], [-5.5, 43.5, 1], [-33, -45, 0.9], [-55, -56, 0.8]]) this.rubble(x, z, sc, M);
    // Vallas de obra con franjas rojas y blancas.
    for (const [x, z, ry] of [[12.5, 19.5, 0.25], [-14, -18.5, -0.5], [21, -50, 1.3], [10, 43.5, 0.2]]) this.roadBlock(x, z, ry, M);
  }

  // Une las cajas de unas piezas ya colocadas (para su colisionador).
  boundsOf(parts) {
    const box = new THREE.Box3();
    for (const m of parts) box.union(new THREE.Box3().setFromObject(m));
    return box;
  }

  // Barrera de concreto: base ancha y cuerpo angosto (2 m de largo).
  jersey(x, z, ry, M) {
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(2, 0.35, 0.62), M.concrete);
    base.position.y = 0.175;
    const top = new THREE.Mesh(new THREE.BoxGeometry(2, 0.5, 0.3), M.concrete);
    top.position.y = 0.6;
    g.add(base, top);
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    const parts = this.flatten(g);
    this.solids.push(...parts);
    this.colliders.push(withObb(this.boundsOf(parts), x, z, 1, 0.31, ry));
  }

  // Muro de sacos: tres hileras a lo largo de `n` sacos.
  sandbagWall(x, z, ry, n, M) {
    const g = new THREE.Group();
    for (let row = 0; row < 3; row++) {
      const k = n - (row === 2 ? 1 : 0);
      for (let i = 0; i < k; i++) {
        const bag = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.32, 0.6), M.sandbag);
        bag.position.set((i - (k - 1) / 2) * 0.98, 0.16 + row * 0.3, (row % 2) * 0.04);
        bag.rotation.y = (((i + row) % 3) - 1) * 0.06;
        g.add(bag);
      }
    }
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    const parts = this.flatten(g);
    this.solids.push(...parts);
    this.colliders.push(withObb(this.boundsOf(parts), x, z, (n * 0.98) / 2, 0.32, ry));
  }

  // Pila de neumáticos (bloquea como una caja de 1 m).
  tires(x, z, M) {
    const ring = new THREE.TorusGeometry(0.36, 0.14, 8, 16);
    const parts = [];
    for (let i = 0; i < 4; i++) {
      const t = new THREE.Mesh(ring, M.tire);
      t.rotation.set(Math.PI / 2, 0, i * 0.4);
      t.position.set(x + (i === 3 ? 0.25 : 0), 0.14 + i * 0.27, z + (i === 3 ? 0.1 : 0));
      this.scene.add(t);
      parts.push(t);
    }
    this.solids.push(...parts);
    this.colliders.push(new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(x, 0.55, z), new THREE.Vector3(1.05, 1.1, 1.05)));
  }

  // Palés de madera apilados.
  pallets(x, z, ry, M) {
    const g = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      for (const dz of [-0.45, 0, 0.45]) {
        const slat = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.05, 0.14), M.wood);
        slat.position.set((i % 2) * 0.06, 0.12 + i * 0.15, dz);
        g.add(slat);
      }
      const block = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.09, 1.0), M.wood);
      block.position.set((i % 2) * 0.06, 0.05 + i * 0.15, 0);
      g.add(block);
    }
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    const parts = this.flatten(g);
    this.solids.push(...parts);
    this.colliders.push(withObb(this.boundsOf(parts), x, z, 0.62, 0.55, ry));
  }

  // Montón de escombros (bloques de concreto y ladrillo caídos).
  rubble(x, z, sc, M) {
    const rock = new THREE.DodecahedronGeometry(0.45, 0);
    const mats = [M.concrete, M.brickDark, M.concrete, M.plaster];
    for (let i = 0; i < 7; i++) {
      const a = i * 2.4;
      const d = i ? 0.35 + (i % 3) * 0.25 : 0;
      const m = new THREE.Mesh(rock, mats[i % mats.length]);
      m.position.set(x + Math.cos(a) * d * sc, (i ? 0.18 : 0.32) * sc, z + Math.sin(a) * d * sc);
      m.scale.set((0.8 + (i % 3) * 0.3) * sc, (0.5 + (i % 2) * 0.3) * sc, (0.9 + (i % 4) * 0.2) * sc);
      m.rotation.set(i, i * 1.7, i * 0.5);
      this.scene.add(m);
      if (!i) this.solids.push(m);
    }
    this.colliders.push(new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(x, 0.35 * sc, z), new THREE.Vector3(1.6 * sc, 0.7 * sc, 1.6 * sc)));
  }

  // Valla de obra: dos caballetes y tablones con franjas rojas y blancas.
  roadBlock(x, z, ry, M) {
    M.stripes ??= new THREE.MeshStandardMaterial({ map: stripeTexture(), roughness: 0.7 });
    const g = new THREE.Group();
    for (const sx of [-0.9, 0.9]) {
      for (const sz of [-0.22, 0.22]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.05, 0.06), M.wood);
        leg.position.set(sx, 0.5, sz);
        leg.rotation.x = sz > 0 ? -0.22 : 0.22;
        g.add(leg);
      }
    }
    for (const y of [0.55, 0.9]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.18, 0.04), M.stripes);
      bar.position.y = y;
      g.add(bar);
    }
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    const parts = this.flatten(g);
    this.solids.push(...parts.slice(-2));
    this.colliders.push(withObb(this.boundsOf(parts), x, z, 1.1, 0.3, ry));
  }

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
    this.colliders.push(withObb(new THREE.Box3().setFromObject(body).union(new THREE.Box3().setFromObject(cabin)), x, z, 2.1, 0.95, ry));
  }

  // Colisionador de una caja recién creada y girada: la caja alineada que la envuelve.
  fixCollider(mesh) {
    mesh.updateMatrixWorld(true);
    this.colliders[this.colliders.length - 1] = new THREE.Box3().setFromObject(mesh);
  }

  // Farola: poste con base, brazo y luminaria (luz cálida de sodio). Necesita la electricidad; algunas
  // están rotas y titilan. ry: hacia dónde apunta el brazo.
  lamp(x, z, M, { ry = 0, broken = false, color = '#ffb466', height = 5 } = {}) {
    const g = new THREE.Group();
    const add = (geo, mat, px, py, pz) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(px, py, pz);
      g.add(m);
      return m;
    };
    add(new THREE.CylinderGeometry(0.2, 0.26, 0.5, 10), M.metal, 0, 0.25, 0);
    add(new THREE.CylinderGeometry(0.075, 0.11, height, 10), M.metal, 0, height / 2, 0);
    add(new THREE.BoxGeometry(0.09, 0.09, 1.3), M.metal, 0, height - 0.05, 0.6);
    add(new THREE.BoxGeometry(0.42, 0.16, 0.7), M.metal, 0, height - 0.12, 1.2);
    add(new THREE.BoxGeometry(0.34, 0.03, 0.56), M.lamp, 0, height - 0.215, 1.2);
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    const parts = this.flatten(g);
    this.solids.push(parts[0], parts[1]);
    const head = new THREE.Vector3(Math.sin(ry) * 1.2 + x, height - 0.25, Math.cos(ry) * 1.2 + z);
    this.lights.add({ pos: head.clone().setY(height - 0.6), color, intensity: 60, distance: 16, power: true, flicker: broken ? 'broken' : 0 });
    this.cones.push({ top: head, height: height - 0.25, radius: 2.6, color, power: true, broken });
    this.pools.push({ pos: head.clone().setY(0.02), radius: 4.2, color, power: true, broken });
    this.colliders.push(new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(x, 1.5, z), new THREE.Vector3(0.3, 3, 0.3)));
  }

  /**
   * Pasa las piezas de un grupo armado a la escena con su posición final: así entran en la geometría
   * unida (mergeStatic) en vez de ser una llamada de dibujo cada una. Devuelve las piezas.
   */
  flatten(group) {
    group.updateMatrixWorld(true);
    const parts = [...group.children];
    for (const m of parts) {
      m.applyMatrix4(group.matrixWorld);
      this.scene.add(m);
      m.updateMatrixWorld(true);
    }
    return parts;
  }

  /** Material luminoso que se apaga sin electricidad (farolas, carteles, máquinas). */
  powerGlow(color) {
    const mat = glow(color);
    mat.userData.glowOn = mat.userData.glow.clone();
    mat.userData.glow.set('#1a1a1a');
    mat.color.copy(mat.userData.glow).multiplyScalar(glowScale());
    this.powerGlows.push(mat);
    return mat;
  }

  /**
   * Noche de terror (modo zombi): luna y cielo casi apagados, reflejos mínimos y niebla negra más
   * espesa. Las farolas, el fuego y la linterna del jugador son lo único que alumbra. false = la noche
   * normal (la usa la historia).
   */
  setDread(on) {
    this.dread = on;
    const v = on ? DREAD : CALM;
    this.hemi.intensity = v.hemi;
    this.moon.intensity = v.moon;
    this.envIntensity = v.env;
    this.scene.environmentIntensity = v.env;
    this.scene.background.set(v.background);
    this.scene.fog.color.set(v.background);
    this.scene.fog.near = v.fogNear;
    this.scene.fog.far = v.fogFar;
    HEIGHT_FOG.uHFog.value.set(...v.hfog);
    HEIGHT_FOG.uHFogColor.value.set(v.hfogColor);
    this.fog.setColor(v.banks);
    const u = this.sky.material.uniforms;
    u.uHorizon.value.set(v.sky.horizon);
    u.uGlowAmount.value = v.sky.glowAmount;
    u.uStars.value = v.sky.stars;
    if (u.uMoon.value > 0) u.uMoon.value = v.sky.moon;
    this.setDetail(this.detail ?? 'alta');
  }

  /** Enciende o apaga la electricidad del barrio: farolas, conos de luz y máquinas. */
  setPower(on) {
    this.powered = on;
    this.lights.setPower(on);
    for (const mat of this.powerGlows) {
      mat.userData.glow.copy(on ? mat.userData.glowOn : new THREE.Color('#1a1a1a'));
      mat.color.copy(mat.userData.glow).multiplyScalar(glowScale());
    }
    for (const mat of this.powerSigns) mat.color.setScalar(on ? 1 : 0.16);
    // La baliza de emergencia se apaga con la luz; la palanca sube.
    if (this.beacon) {
      this.beacon.src.on = !on;
      this.beacon.mesh.visible = !on;
    }
    if (this.lever) this.lever.target = on ? this.lever.on : this.lever.off;
  }

  fireBarrel(x, z, M) {
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.3, 0.9, 12), M.rust);
    barrel.position.set(x, 0.45, z);
    this.scene.add(barrel);
    this.solids.push(barrel);
    this.colliders.push(new THREE.Box3().setFromCenterAndSize(barrel.position, new THREE.Vector3(0.64, 0.9, 0.64)));
    // Luz del fuego: parpadea y baña el suelo de naranja (no depende de la electricidad).
    this.lights.add({ pos: new THREE.Vector3(x, 1.5, z), color: '#ff7a33', intensity: 26, distance: 11, power: false, flicker: 'fire' });
    this.pools.push({ pos: new THREE.Vector3(x, 0.02, z), radius: 3.4, color: '#ff6a2a', power: false });
    // Fuego: llamas animadas y humo (fireField, todas las llamas del mapa en una malla).
    this.fires.push({ pos: new THREE.Vector3(x, 0.86, z), width: 0.75, height: 1.05 });
  }

  // --- Secciones ------------------------------------------------------------------------------------

  // Muros perimetrales del rectángulo (con huecos para el callejón y las entradas), piso y entradas.
  section(id, def, M) {
    const r = def.rect;
    const [floorKey, floorColor] = def.floor;
    this.block(r.maxX - r.minX, 0.02, r.maxZ - r.minZ, surface(floorKey, floorColor), (r.minX + r.maxX) / 2, (r.minZ + r.maxZ) / 2, 0, false);
    const gapsBy = { n: [], s: [], o: [], e: [] };
    for (const [side, at] of def.openings) gapsBy[side].push([at, ALLEY_W]);
    for (const [side, at] of def.entries) gapsBy[side].push([at, NICHE_W]);
    // Muros de cada sección con su propio aire (piedra en la iglesia, chapa en la estación…).
    const mats = (def.walls ?? ['brick', 'plasterWarm', 'brickDark', 'plaster']).map((key) => M[key]);
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
            const m = (Math.round(c * 3) + k) % 3 === 0 ? M.window : M.darkWindow;
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
    const mat = circusMaterials().canvas; // lona a rayas de la carpa
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
    // Luz del cuarto (cálida, colgada del muro): tiene generador propio, funciona sin electricidad.
    this.block(1.4, 0.08, 0.2, M.lampWall, 0, r.maxZ - 0.15, 3.6, false);
    this.lights.add({ pos: new THREE.Vector3(0, 3.3, r.maxZ - 0.8), color: '#ffc58a', intensity: 30, distance: 13, power: false, flicker: 'tube' });
    this.pools.push({ pos: new THREE.Vector3(0, 0.02, r.maxZ - 2.5), radius: 5, color: '#ffb470', power: false });
  }

  // Caja misteriosa: un arma al azar por puntos, con su haz de luz que se ve desde lejos.
  // Caja misteriosa: un arma al azar por puntos, con su haz de luz que se ve desde lejos. Cada tantos
  // usos se muda a otro de BOX_SPOTS (moveBox): hay que ir a buscarla.
  mysteryBox(spot, M) {
    const g = new THREE.Group();
    g.userData.dynamic = true;
    const box = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.85, 0.85), M.wood);
    box.position.y = 0.425;
    g.add(box);
    for (const sx of [-0.83, 0.83]) {
      for (const sz of [-0.41, 0.41]) {
        const corner = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.88, 0.1), M.metal);
        corner.position.set(sx, 0.44, sz);
        g.add(corner);
      }
    }
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
    this.scene.add(g);
    const collider = new THREE.Box3();
    this.solids.push(box);
    this.colliders.push(collider);
    const it = { kind: 'box', id: 'box', pos: new THREE.Vector3(), radius: 1.7 };
    this.interactables.push(it);
    this.box = { group: g, box, collider, it, spot: 0, glow: this.lights.add({ pos: new THREE.Vector3(), color: '#7fd4ff', intensity: 9, distance: 6, power: false }) };
    this.moveBox(BOX_SPOTS.indexOf(spot));
  }

  /** Lleva la caja misteriosa al lugar `i` de BOX_SPOTS (su colisionador y su luz con ella). */
  moveBox(i) {
    const b = this.box;
    const spot = BOX_SPOTS[i] ?? BOX_SPOTS[0];
    b.spot = Math.max(0, i);
    b.group.position.set(spot.x, 0, spot.z);
    b.group.rotation.y = spot.ry;
    b.group.updateMatrixWorld(true);
    b.collider.setFromObject(b.box);
    const front = new THREE.Vector3(Math.sin(spot.ry), 0, Math.cos(spot.ry));
    b.it.pos.set(spot.x, 0, spot.z).addScaledVector(front, 1.1);
    b.glow.pos.set(spot.x, 1.3, spot.z).addScaledVector(front, 0.6);
    return spot;
  }

  // Forja: máquina de mejora de armas (quirófano del hospital). Horno con la boca encendida, tolva,
  // tuberías y su cartel. Sin electricidad está apagada.
  forge({ x, z, ry }, M) {
    const g = new THREE.Group();
    const part = (geo, mat, px, py, pz) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(px, py, pz);
      g.add(m);
      return m;
    };
    part(new THREE.BoxGeometry(2.4, 0.2, 1.4), M.metal, 0, 0.1, 0);
    const body = part(new THREE.BoxGeometry(2.0, 1.7, 1.2), M.rust, 0, 1.05, 0);
    part(new THREE.CylinderGeometry(0.55, 0.75, 0.8, 14), M.metal, 0, 2.3, -0.1);
    part(new THREE.CylinderGeometry(0.12, 0.12, 1.6, 10), M.rust, 0.85, 2.6, -0.35);
    part(new THREE.CylinderGeometry(0.12, 0.12, 1.2, 10), M.rust, -0.85, 2.4, -0.35);
    const fire = this.powerGlow('#ff7a2a');
    part(new THREE.BoxGeometry(0.9, 0.5, 0.05), fire, 0, 1.0, 0.61); // boca del horno
    const rune = this.powerGlow('#c56bff');
    for (const px of [-0.7, 0.7]) part(new THREE.BoxGeometry(0.08, 1.2, 0.05), rune, px, 1.05, 0.61);
    part(new THREE.BoxGeometry(2.04, 0.08, 1.24), rune, 0, 1.9, 0);
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    this.flatten(g);
    this.solids.push(body);
    this.colliders.push(new THREE.Box3().setFromObject(body).expandByScalar(0.1));
    const front = new THREE.Vector3(Math.sin(ry), 0, Math.cos(ry));
    const signMesh = sign(this, 'FORJA', '#c56bff', x + front.x * 0.62, 3.0, z + front.z * 0.62, ry, 1.4, 0.34);
    this.powerSigns.push(signMesh.material);
    this.lights.add({ pos: new THREE.Vector3(x, 1.4, z).addScaledVector(front, 1.1), color: '#ff8a4a', intensity: 14, distance: 6.5, power: true, flicker: 'fire' });
    this.pools.push({ pos: new THREE.Vector3(x, 0.02, z).addScaledVector(front, 1.2), radius: 2.4, color: '#ff7a3a', power: true });
    this.interactables.push({ kind: 'forge', id: 'forja', pos: new THREE.Vector3(x, 0, z).addScaledVector(front, 1.4), radius: 1.8 });
  }

  /**
   * Mancha en el suelo (estática: se une con las demás del mismo tipo). kind: blood | oil | puddle |
   * litter. Recibe sombras pero no las proyecta.
   */
  decal(kind, x, z, size, ry = 0) {
    this.decalMats ??= {};
    const mat = (this.decalMats[kind] ??= DECAL_MATERIALS[kind]());
    const geo = new THREE.PlaneGeometry(size, size);
    geo.rotateX(-Math.PI / 2);
    geo.rotateY(ry);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, 0.035 + (this.decalN = (this.decalN ?? 0) + 1) * 0.0002, z);
    m.userData.ground = true;
    this.scene.add(m);
    return m;
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
    for (const [x, z, s] of [[24, -51.4, 1.1], [23.1, -52.4, 0.8], [22.5, -38.5, 1]]) this.crate(x, z, s);
    this.car(18, -51.2, 0.15, M.carB, M);
    for (const [x, z, ry] of [[3, -36.5, 2.4], [23, -36.5, -2.4], [8, -52.5, 0.4]]) this.lamp(x, z, M, { ry });
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
    for (const [x, z] of [[38, 2.6], [54, 2.6], [38, 16.4], [54, 16.4]]) {
      b(0.6, 0.08, 0.2, M.lamp, x, z, 4.2, false);
      this.lights.add({ pos: new THREE.Vector3(x, 3.9, z), color: '#cfe3ff', intensity: 22, distance: 11, power: true, flicker: 'tube' });
      this.pools.push({ pos: new THREE.Vector3(x, 0.02, z), radius: 3.5, color: '#bcd6ff', power: true });
    }
    this.fireBarrel(36.5, 19.5, M);
    // Carga sin despachar en la esquina noroeste del andén.
    for (const [x, z, s] of [[35.25, -2.85, 1.1], [36.5, -3.05, 0.8], [35.2, -1.5, 0.8]]) this.crate(x, z, s);
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
    for (const [x, z, ry] of [[-12, 35.5, 2.4], [17, 35.5, -2.4], [16.5, 45, -1.6]]) this.lamp(x, z, M, { ry, broken: x < 0 });
    for (const [x, z] of [[-10, 52], [14, 52.5]]) this.fireBarrel(x, z, M);
  }

  // Máquina de bebidas: cuerpo sobre un zócalo, corona con el nombre iluminado, vitrina con botellas y
  // franjas del color de la bebida. Casi todas necesitan la electricidad (perk.power === false: no).
  perkMachine(id, x, z, ry, M) {
    const perk = PERKS[id];
    const powered = perk.power !== false;
    const g = new THREE.Group();
    const part = (geo, mat, px, py, pz) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(px, py, pz);
      g.add(m);
      return m;
    };
    part(new THREE.BoxGeometry(1.2, 0.12, 0.9), M.metal, 0, 0.06, 0);
    const body = part(new THREE.BoxGeometry(1.1, 2.1, 0.8), M.machine, 0, 1.17, 0);
    part(new THREE.BoxGeometry(1.24, 0.38, 0.88), M.machine, 0, 2.4, 0);
    part(new THREE.BoxGeometry(0.74, 1.0, 0.03), M.glass, -0.08, 1.2, 0.41);
    part(new THREE.BoxGeometry(0.16, 0.3, 0.06), M.metal, 0.42, 1.25, 0.42); // ranura de monedas
    const light = powered ? this.powerGlow(perk.color) : glow(perk.color);
    for (const [w, h, px, py] of [[1.02, 0.05, 0, 0.3], [0.05, 1.7, 0.53, 1.2], [0.05, 1.7, -0.53, 1.2], [1.2, 0.04, 0, 2.2]]) part(new THREE.BoxGeometry(w, h, 0.03), light, px, py, 0.415);
    // Vitrina con botellas (con su color, de frente al jugador).
    for (const bx of [-0.3, -0.08, 0.14]) part(new THREE.CylinderGeometry(0.06, 0.075, 0.34, 10), light, bx, 1.05, 0.34);
    const signMat = new THREE.MeshBasicMaterial({ map: signTexture(perk.name, perk.color), transparent: true, toneMapped: false });
    if (powered) this.powerSigns.push(signMat);
    const sign = part(new THREE.PlaneGeometry(1.14, 0.2), signMat, 0, 2.4, 0.445);
    sign.userData.dynamic = true;
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    this.flatten(g);
    this.solids.push(body);
    this.colliders.push(new THREE.Box3().setFromObject(body));
    const front = new THREE.Vector3(Math.sin(ry), 0, Math.cos(ry));
    const glowAt = new THREE.Vector3(x, 1.7, z).addScaledVector(front, 0.9);
    this.lights.add({ pos: glowAt, color: perk.color, intensity: 7, distance: 5.5, power: powered });
    this.pools.push({ pos: glowAt.clone().setY(0.02), radius: 1.8, color: perk.color, power: powered });
    this.interactables.push({ kind: 'perk', id, pos: new THREE.Vector3(x, 0, z).addScaledVector(front, 1.1), radius: 1.6 });
  }

  // Arma de la pared: silueta pintada con el nombre y el arma real colgada (llega async).
  wallBuy(id, x, z, side, y0 = 0) {
    const n = NORMALS[side];
    const at = new THREE.Vector3(x, y0 + 1.45, z).addScaledVector(n, 0.04);
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.25), new THREE.MeshBasicMaterial({ map: signTexture(WEAPONS[id].name, '#e8e2c8'), transparent: true, toneMapped: false }));
    panel.position.copy(at).setY(y0 + 1.05);
    panel.lookAt(at.clone().setY(y0 + 1.05).add(n));
    panel.userData.dynamic = true;
    this.scene.add(panel);
    const frame = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.55), new THREE.MeshBasicMaterial({ color: '#d8d0b0', transparent: true, opacity: 0.12, depthWrite: false }));
    frame.position.copy(at);
    frame.lookAt(at.clone().add(n));
    frame.userData.dynamic = true;
    this.scene.add(frame);
    this.interactables.push({ kind: 'wallbuy', id, pos: new THREE.Vector3(x, y0, z).addScaledVector(n, 0.9), radius: 1.7 });
    // El arma: cañón a lo largo de la pared, centrada en el panel.
    const along = new THREE.Vector3(n.z, 0, -n.x); // dirección del cañón
    const yaw = Math.atan2(-along.x, -along.z); // el modelo apunta a -Z
    const length = { pistol: 0.25, magnum: 0.3, smg: 0.6, rifle: 0.9, burst: 0.85, shotgun: 1.0, lmg: 1.1, dmr: 1.0, sniper: 1.2 }[id] ?? 0.9;
    const origin = at.clone().addScaledVector(n, 0.06).addScaledVector(along, -length / 2).setY(y0 + 1.6);
    return { id, position: origin, rotation: new THREE.Euler(0, yaw, 0) };
  }

  /**
   * Caja de madera fija (cobertura): apoyada en el piso de ese lugar (veredas incluidas). Se registra
   * en `crates` para auditarlas (tests/mapBoxes.test.js).
   */
  crate(x, z, s, ry = 0) {
    const y0 = this.floorAt(x, z, 0);
    const m = this.block(s, s, s, this.materials.wood, x, z, y0);
    if (ry) {
      m.rotation.y = ry;
      this.fixCollider(m);
      withObb(this.colliders.at(-1), x, z, s / 2, s / 2, ry);
    }
    (this.crates ??= []).push({ x, z, s, y0, mesh: m, collider: this.colliders.at(-1) });
    return m;
  }

  /**
   * Altura del piso en (x, z) para algo que está a la altura y: el piso más alto que no quede más de un
   * escalón por encima (así, debajo de nada no se "sube" a la terraza; por la escalera, sí).
   */
  floorAt(x, z, y = 0) {
    let best = 0;
    for (const f of this.floors ?? []) {
      if (x < f.minX || x > f.maxX || z < f.minZ || z > f.maxZ) continue;
      let h = f.h;
      if (f.axis) h *= Math.min(1, Math.max(0, ((f.axis === 'x' ? x : z) - f.from) / (f.to - f.from)));
      if (h > best && h <= y + STEP) best = h;
    }
    return best;
  }

  // --- Puertas -------------------------------------------------------------------------------------

  isOpen(section) {
    if (section === 'lobby') return true;
    for (const d of Object.values(this.doors)) if (d.section === section && d.open) return true;
    return false;
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

  // Calidad gráfica (la llama Game al cambiar el detalle): cuántas luces reales y la resolución de las
  // texturas de los zombis.
  setDetail(detail) {
    this.detail = detail;
    this.lights.setCount(LIGHTS_FOR[detail] ?? LIGHTS_FOR.media);
    this.fog.mesh.geometry.instanceCount = BANKS[detail] ?? BANKS.media;
    this.fog.setOpacity(Math.min(0.85, (BANK_OPACITY[detail] ?? BANK_OPACITY.media) * (this.dread ? DREAD : CALM).bankMul));
    setZombieDetail(detail);
    this.buildShadowProxy();
  }

  /*
    Sombra de la luna con UNA llamada de dibujo para todo lo estático. El mapa ya unido (mergeStatic)
    seguía siendo ~200 mallas que se volvían a dibujar en el mapa de sombras en cada cuadro (unos ms de
    CPU). Aquí toda la geometría estática opaca se une en una sola malla que solo escribe en ese mapa
    (en la pasada normal su prueba de profundidad nunca pasa: no pinta nada) y las piezas originales
    dejan de proyectar sombra. Lo que se mueve (zombis, puertas, utilería grande) sigue igual. La
    utilería diminuta (latas, conos) no proyecta sombra: no se notaba y eran decenas de dibujos.
    Se arma una vez, después de que prepareWorld unió la geometría.
  */
  buildShadowProxy() {
    if (this.shadowProxy || !this.gfx?.merge) return;
    const geos = [];
    for (const o of this.scene.children) {
      if (!o.isMesh || o.isSkinnedMesh || o.isInstancedMesh || o.userData.dynamic || !o.castShadow) continue;
      const m = o.material;
      if (Array.isArray(m) || !m.visible || m.transparent || m.alphaTest > 0 || m.alphaMap) continue;
      o.updateMatrixWorld(true);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', o.geometry.attributes.position.clone());
      if (o.geometry.index) g.setIndex(o.geometry.index.clone());
      geos.push(g.applyMatrix4(o.matrixWorld));
      o.castShadow = false;
    }
    if (!geos.length) return;
    const geometry = mergeGeometries(geos.map((g) => (g.index ? g : g.setIndex([...Array(g.attributes.position.count).keys()]))), false);
    for (const g of geos) g.dispose();
    const proxy = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, depthFunc: THREE.NeverDepth }));
    proxy.name = 'sombra:estatica';
    proxy.castShadow = true;
    proxy.receiveShadow = false;
    proxy.frustumCulled = false;
    proxy.matrixAutoUpdate = false;
    proxy.userData.dynamic = true;
    this.scene.add(proxy);
    this.shadowProxy = proxy;
    for (const it of this.props?.items ?? []) {
      it.group.traverse((o) => {
        if (!o.isMesh) return;
        o.geometry.computeBoundingSphere();
        if (o.geometry.boundingSphere.radius * o.getWorldScale(_scale).x < 0.35) o.castShadow = false;
      });
    }
  }

  update(dt) {
    if (this.camera) this.lights.update(dt, this.camera);
    this.fog.update(dt, this.camera);
    this.shapes.update(dt, this.powered);
    // Palanca del generador (sube o baja suave) y baliza que gira.
    const lv = this.lever;
    if (lv) lv.group.rotation.x += ((lv.target ?? lv.off) - lv.group.rotation.x) * Math.min(1, dt * 6);
    if (this.beacon?.mesh.visible) {
      this.beacon.mesh.rotation.y += dt * 5;
      this.beacon.src.intensity = 18 + 16 * Math.max(0, Math.sin(this.fireT * 5));
    }
    this.fireT += dt;
    this.fireFx.update(dt);
    // Tablones de las barricadas: los arrancados salen volando hacia fuera; los reparados entran.
    for (const b of this.barricades) {
      for (const p of b.planks) {
        if (p.t < 0) continue;
        p.t += dt;
        if (p.dir < 0) {
          const k = p.t;
          p.pos.copy(p.home).addScaledVector(b.inward, -k * 3.2);
          p.pos.y = p.home.y + k * 2 - k * k * 9;
          p.cur.set(p.rot.x + k * 6, p.rot.y + k * 3, p.rot.z + k * 5);
          if (k > 0.55) {
            p.visible = false;
            p.t = -1;
          }
        } else {
          const k = Math.min(1, p.t / 0.2);
          p.pos.copy(p.home).addScaledVector(b.inward, (1 - k) * 0.7);
          p.cur.copy(p.rot);
          if (k >= 1) p.t = -1;
        }
        this.writePlank(p);
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
