import * as THREE from 'three';
import { World } from './World.js';
import { boxWorldUV, glow, glowScale, surface, tileOf } from '../gfx/surfaces.js';
import { beamTexture, hazardTexture, holoTexture, laserTexture, pegboardTexture, signTexture, silhouetteTexture } from '../gfx/canvasTextures.js';
import { Sparks } from '../effects/Sparks.js';
import { createDrone, placeWeapons } from './props.js';

/*
  Armería: el escenario de la pantalla de título (no se juega). Un taller de armas con mesa de
  trabajo, estantes y casilleros, drones que escanean el rifle con un láser, pantallas holográficas,
  chispas de soldadura y, al fondo, el campo de tiro con sus blancos encendidos. El soldado del menú
  (effects/MenuShowcase.js) se para en primer plano.

  Planos de cámara por opción del menú (effects/MenuCamera.js): menuShots[id] = { pos, look }.
*/

const W = 7; // medio ancho de la armería (m)
const ROOM_H = 4.4;
const BACK_Z = -6; // muro del fondo, con la abertura al campo de tiro
const OPEN_W = 3.4; // medio ancho de la abertura
const OPEN_H = 2.9;
const RANGE_END = -26;
const BENCH = new THREE.Vector3(-0.45, 0, -0.35); // centro de la mesa de trabajo
const BENCH_TOP = 0.92;

const v3 = (x, y, z) => new THREE.Vector3(x, y, z);

export class ArmoryMenu extends World {
  constructor() {
    super({
      name: 'Armería',
      background: '#0b1014',
      fogNear: 8,
      fogFar: 46,
      spawn: v3(0, 0, 4.6),
      playerZone: { minX: -2, maxX: 2, minZ: 3, maxZ: 5 },
    });
    this.envIntensity = 0.45;
    this.menuOnly = true;
    this.animated = [];
    this.time = 0;

    // Dónde se paran los soldados del menú (MenuShowcase).
    this.showcase = {
      hero: { position: v3(0.5, 0, 2.95), yaw: Math.PI + 0.55, clip: 'neutral', uniform: '#2b323b', slung: 'rifle' },
      extra: { position: v3(-3.35, 0, -3.3), yaw: Math.PI - 0.12, clip: 'idle', uniform: '#3a434e' },
    };

    // Planos de cámara: el principal y uno por opción del menú (se pasa de uno a otro con suavidad).
    this.menuShots = {
      // Movimientos cortos (paneo y pequeño travelling): el soldado sigue en cuadro en todos.
      main: { pos: v3(0, 1.36, 4.65), look: v3(0.1, 1.32, -4) },
      continue: { pos: v3(-0.05, 1.36, 4.5), look: v3(0.05, 1.3, -4.5) },
      play: { pos: v3(-0.1, 1.42, 4.6), look: v3(-0.1, 1.48, -14) },
      arsenal: { pos: v3(-0.3, 1.38, 4.75), look: v3(-1.9, 1.22, -2.4) },
      crosshair: { pos: v3(-0.1, 1.45, 4.5), look: v3(0.15, 1.6, -15) },
      progress: { pos: v3(-0.15, 1.4, 4.55), look: v3(-0.45, 1.5, -1.8) },
      settings: { pos: v3(-0.05, 1.3, 4.45), look: v3(-0.15, 1.05, -1.2) },
      quit: { pos: v3(0.15, 1.42, 5.1), look: v3(0.1, 1.3, -4) },
    };

    this.buildMaterials();
    this.buildRoom();
    this.buildRange();
    this.buildBench();
    this.buildStorage();
    this.buildLights();
    this.buildFx();
    this.loadProps();
    this.limitShadows();
  }

  // Sombras solo de lo que se mueve o está cerca del suelo (mesa, cajas, soldados): muros, techo,
  // vigas y luminarias no proyectan. Así la luz cenital entra en la sala y el pase de sombras es corto.
  limitShadows() {
    const box = new THREE.Box3();
    for (const o of this.scene.children) {
      if (!o.isMesh || o.userData.ground) continue;
      box.setFromObject(o);
      const big = Math.max(box.max.x - box.min.x, box.max.z - box.min.z) > 3;
      if (box.max.y > 2.6 || big) o.userData.noShadow = true;
    }
  }

  buildMaterials() {
    const tex = (t, opts) => (t ? { map: t, ...opts } : opts);
    this.M = {
      floor: surface('concrete_floor', '#262b31'),
      wall: surface('concrete_wall', '#252b32'),
      wallDark: surface('concrete_wall', '#1c2127'),
      panel: surface('metal_panel', '#2a3138', { metal: 0.5 }),
      metal: surface('metal', '#3a434d', { metal: 0.6 }),
      steel: new THREE.MeshStandardMaterial({ color: '#59636d', roughness: 0.32, metalness: 0.85 }),
      dark: new THREE.MeshStandardMaterial({ color: '#15191d', roughness: 0.55, metalness: 0.4 }),
      locker: new THREE.MeshStandardMaterial({ color: '#2d3a36', roughness: 0.48, metalness: 0.55 }),
      olive: new THREE.MeshStandardMaterial({ color: '#3d4630', roughness: 0.7, metalness: 0.25 }),
      wood: surface('wood', '#5c4a36'),
      rubber: new THREE.MeshStandardMaterial({ color: '#111315', roughness: 0.9, metalness: 0 }),
      brass: new THREE.MeshStandardMaterial({ color: '#b48b3e', roughness: 0.3, metalness: 1 }),
      handle: new THREE.MeshStandardMaterial({ color: '#d9a21b', roughness: 0.5, metalness: 0 }),
      pegboard: new THREE.MeshStandardMaterial(tex(pegboardTexture(), { color: '#ffffff', roughness: 0.8, metalness: 0.1 })),
      hazard: new THREE.MeshStandardMaterial(tex(hazardTexture(), { color: '#ffffff', roughness: 0.7, metalness: 0 })),
      tube: glow('#e4fbff'),
      teal: glow('#2dffc0'),
      amber: glow('#ffae4a'),
      red: glow('#ff3b4f'),
      screen: glow('#36f5c4'),
    };
    if (!this.M.hazard.map) this.M.hazard.color.set('#b8891a');
    if (!this.M.pegboard.map) this.M.pegboard.color.set('#2f3a3f');
  }

  // Caja sin colisión (decoración). Con material de superficie, UVs en metros.
  deco(w, h, d, mat, x, y, z, ry = 0) {
    const geo = new THREE.BoxGeometry(w, h, d);
    const tile = tileOf(mat);
    if (tile) boxWorldUV(geo, w, h, d, tile);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y + h / 2, z);
    m.rotation.y = ry;
    this.scene.add(m);
    return m;
  }

  buildRoom() {
    const { M } = this;
    this.ground(2 * W, 14 + 2, 1, M.floor);
    // Muros laterales y del fondo (con la abertura al campo de tiro).
    this.block(0.5, ROOM_H, 15, M.wall, -W, 1);
    this.block(0.5, ROOM_H, 15, M.wall, W, 1);
    const sideW = W - OPEN_W;
    this.block(sideW, ROOM_H, 0.5, M.wallDark, -OPEN_W - sideW / 2, BACK_Z);
    this.block(sideW, ROOM_H, 0.5, M.wallDark, OPEN_W + sideW / 2, BACK_Z);
    this.deco(OPEN_W * 2, ROOM_H - OPEN_H, 0.5, M.wallDark, 0, OPEN_H, BACK_Z);
    this.block(2 * W, ROOM_H, 0.5, M.wall, 0, 8.5);
    // Marco de la abertura con luz de acento.
    this.deco(OPEN_W * 2 + 0.3, 0.16, 0.6, M.metal, 0, OPEN_H - 0.08, BACK_Z);
    this.deco(OPEN_W * 2, 0.04, 0.05, M.teal, 0, OPEN_H - 0.14, BACK_Z + 0.3);
    for (const sx of [-1, 1]) this.deco(0.22, OPEN_H, 0.6, M.metal, sx * (OPEN_W + 0.05), 0, BACK_Z);
    // Letrero luminoso sobre la abertura.
    const sign = signTexture('Campo de tiro');
    const signMat = glow('#bffff0');
    if (sign) signMat.map = sign;
    const signMesh = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.41), signMat);
    signMesh.position.set(0, 3.42, BACK_Z + 0.27);
    this.scene.add(signMesh);
    // Lámparas de pared cálidas a los lados de la abertura (contraste cálido / frío, como en un taller).
    for (const sx of [-1, 1]) {
      const lx = sx * (OPEN_W + 1.1);
      this.deco(0.26, 0.3, 0.16, M.dark, lx, 2.45, BACK_Z + 0.3);
      this.deco(0.2, 0.2, 0.05, M.amber, lx, 2.5, BACK_Z + 0.39);
    }

    // Techo de chapa con vigas y tubos fluorescentes en dos filas (dan profundidad).
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(2 * W, 15), M.panel);
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(0, ROOM_H, 1);
    this.scene.add(ceil);
    for (let z = 7; z > BACK_Z; z -= 2.6) this.deco(2 * W, 0.28, 0.24, M.metal, 0, ROOM_H - 0.28, z);
    for (const x of [-2.5, 2.5]) {
      for (let z = 3.0; z > BACK_Z + 1; z -= 2.6) {
        this.deco(0.34, 0.07, 1.9, M.dark, x, ROOM_H - 0.62, z - 1.3);
        this.deco(0.12, 0.035, 1.8, M.tube, x - 0.08, ROOM_H - 0.655, z - 1.3);
        this.deco(0.12, 0.035, 1.8, M.tube, x + 0.08, ROOM_H - 0.655, z - 1.3);
        // Cables que cuelgan del techo.
        this.deco(0.012, 0.55, 0.012, M.dark, x, ROOM_H - 0.55, z - 0.5);
        this.deco(0.012, 0.55, 0.012, M.dark, x, ROOM_H - 0.55, z - 2.1);
      }
    }
    // Franjas de seguridad en el piso alrededor de la zona de la mesa y del paso al campo.
    const stripe = (len, x, z, ry) => {
      const geo = new THREE.PlaneGeometry(len, 0.14);
      if (M.hazard.map) {
        const uv = geo.attributes.uv;
        for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * len * 2);
      }
      const m = new THREE.Mesh(geo, M.hazard);
      m.rotation.set(-Math.PI / 2, 0, ry);
      m.position.set(x, 0.006, z);
      m.userData.ground = true;
      this.scene.add(m);
    };
    stripe(4.2, BENCH.x, BENCH.z + 1.25, 0);
    stripe(4.2, BENCH.x, BENCH.z - 1.4, 0);
    stripe(2.65, BENCH.x - 2.1, BENCH.z - 0.08, Math.PI / 2);
    stripe(2.65, BENCH.x + 2.1, BENCH.z - 0.08, Math.PI / 2);
    stripe(OPEN_W * 2, 0, BACK_Z + 0.6, 0);
    // Rejilla de desagüe y cables en el piso.
    this.deco(1.6, 0.012, 0.3, M.steel, 2.6, 0, 0.6);
    this.deco(0.05, 0.03, 6, M.rubber, 3.9, 0, -1.5);
    this.deco(5.2, 0.03, 0.05, M.rubber, -1.2, 0, -3.4);
  }

  buildRange() {
    const { M } = this;
    // Campo de tiro al otro lado de la abertura: carriles, techo bajo y blancos encendidos.
    this.ground(10, -RANGE_END + BACK_Z + 0.5, (BACK_Z + RANGE_END) / 2, M.floor);
    this.block(0.4, 3.6, -RANGE_END + BACK_Z, M.wallDark, -5, (BACK_Z + RANGE_END) / 2);
    this.block(0.4, 3.6, -RANGE_END + BACK_Z, M.wallDark, 5, (BACK_Z + RANGE_END) / 2);
    this.block(10, 3.6, 0.4, M.wallDark, 0, RANGE_END);
    this.deco(10, 0.12, 0.1, M.teal, 0, 2.3, RANGE_END + 0.25);
    const lanes = [-3.3, -1.1, 1.1, 3.3];
    for (const x of [-2.2, 0, 2.2]) this.deco(0.08, 1.1, 9, M.metal, x, 0, BACK_Z - 5.5);
    for (let z = BACK_Z - 2; z > RANGE_END + 1; z -= 3.2) this.deco(9.6, 0.05, 0.25, M.tube, 0, 3.35, z);
    // Blancos: silueta luminosa sobre un poste, a 15-20 m.
    const sil = silhouetteTexture();
    this.targets = [];
    lanes.forEach((x, i) => {
      const z = -15.5 - (i % 2) * 1.8;
      this.deco(0.05, 1.0, 0.05, M.dark, x, 0, z);
      const mat = glow('#3dffc9');
      if (sil) {
        mat.map = sil;
        mat.transparent = true;
        mat.depthWrite = false;
      }
      const board = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 1.5), mat);
      board.position.set(x, 1.72, z + 0.03);
      board.userData.dynamic = true;
      this.scene.add(board);
      this.targets.push(board);
    });
  }

  buildBench() {
    const { M } = this;
    const { x, z } = BENCH;
    // Mesa de trabajo metálica con estante inferior y tablero trasero.
    this.block(2.6, 0.06, 1.05, M.steel, x, z, BENCH_TOP - 0.06);
    this.deco(2.62, 0.05, 1.07, M.dark, x, BENCH_TOP - 0.11, z);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) this.deco(0.07, BENCH_TOP - 0.11, 0.07, M.dark, x + sx * 1.22, 0, z + sz * 0.45);
    this.deco(2.4, 0.04, 0.9, M.metal, x, 0.22, z);
    // Estante de abajo: cajas de munición, un casco y una mochila.
    this.deco(0.42, 0.26, 0.3, M.olive, x - 0.75, 0.26, z + 0.05, 0.1);
    this.deco(0.42, 0.26, 0.3, M.olive, x - 0.28, 0.26, z + 0.08, -0.06);
    this.deco(0.34, 0.2, 0.26, M.dark, x - 0.5, 0.52, z + 0.06, 0.2);
    this.deco(0.55, 0.36, 0.32, M.locker, x + 0.6, 0.26, z + 0.04, -0.15);
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), M.dark);
    helmet.position.set(x + 0.15, 0.26, z + 0.12);
    this.scene.add(helmet);
    this.deco(2.6, 0.08, 0.05, M.dark, x, BENCH_TOP, z - 0.5); // reborde trasero
    // Lámparas colgantes con su haz de luz (cono volumétrico falso) sobre la mesa.
    const beam = beamTexture();
    const beamMat = new THREE.MeshBasicMaterial({
      color: '#fff1d6',
      map: beam,
      transparent: true,
      opacity: beam ? 0.16 : 0.05,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
      fog: false,
    });
    for (const lx of [x - 0.65, x + 0.65]) {
      this.deco(0.012, ROOM_H - 2.75, 0.012, M.dark, lx, 2.75, z);
      const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.22, 0.2, 20, 1, true), M.dark);
      shade.material.side = THREE.DoubleSide;
      shade.position.set(lx, 2.65, z);
      this.scene.add(shade);
      const bulb = new THREE.Mesh(new THREE.CircleGeometry(0.17, 20), M.tube);
      bulb.rotation.x = Math.PI / 2;
      bulb.position.set(lx, 2.56, z);
      this.scene.add(bulb);
      const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.85, 1.62, 24, 1, true), beamMat);
      cone.position.set(lx, 2.56 - 0.81, z);
      cone.userData.dynamic = true;
      this.scene.add(cone);
    }
    this.deco(0.16, 0.1, 0.14, M.metal, x - 1.0, BENCH_TOP, z + 0.2);
    this.deco(0.05, 0.05, 0.2, M.steel, x - 1.0, BENCH_TOP + 0.1, z + 0.2);
    // Cargadores, caja de munición, cartuchos y destornillador.
    for (let i = 0; i < 4; i++) {
      const mag = this.deco(0.032, 0.16, 0.075, M.dark, x + 0.35 + i * 0.07, BENCH_TOP, z + 0.28);
      mag.rotation.z = Math.PI / 2;
      mag.position.y = BENCH_TOP + 0.016;
      mag.rotation.y = 0.2 + i * 0.12;
    }
    this.deco(0.32, 0.17, 0.16, M.olive, x + 0.85, BENCH_TOP, z + 0.18, 0.25);
    this.deco(0.33, 0.02, 0.17, M.dark, x + 0.85, BENCH_TOP + 0.17, z + 0.18, 0.25);
    for (let i = 0; i < 7; i++) {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.045, 8), M.brass);
      c.position.set(x + 0.45 + (i % 4) * 0.035, BENCH_TOP + 0.006, z + 0.42 - Math.floor(i / 4) * 0.03);
      c.rotation.z = Math.PI / 2;
      c.rotation.y = i * 0.7;
      this.scene.add(c);
    }
    this.deco(0.02, 0.02, 0.22, M.dark, x - 0.55, BENCH_TOP, z + 0.38, 0.5);
    this.deco(0.03, 0.03, 0.09, M.handle, x - 0.6, BENCH_TOP, z + 0.31, 0.5);
    // Portátil abierto con la pantalla encendida.
    this.deco(0.36, 0.02, 0.25, M.dark, x - 0.85, BENCH_TOP, z - 0.18, 0.3);
    const lid = this.deco(0.36, 0.24, 0.015, M.dark, x - 0.9, BENCH_TOP + 0.01, z - 0.3, 0.3);
    lid.rotation.x = -0.25;
    const holo = holoTexture('stats');
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.2), holo ? new THREE.MeshBasicMaterial({ map: holo, toneMapped: false }) : M.screen);
    scr.position.set(x - 0.9, BENCH_TOP + 0.135, z - 0.29);
    scr.rotation.set(-0.25, 0.3, 0, 'YXZ');
    scr.translateZ(0.009);
    this.scene.add(scr);
  }

  buildStorage() {
    const { M } = this;
    // Pared izquierda: tablero de herramientas, estante de armas (se llena en loadProps) y repisas.
    this.deco(0.05, 1.5, 4.2, M.pegboard, -W + 0.3, 0.9, -1.2);
    // Rack de armas: dos barras con soportes.
    this.deco(0.12, 0.06, 3.4, M.dark, -W + 0.42, 0.55, 1.9);
    this.deco(0.12, 0.06, 3.4, M.dark, -W + 0.42, 1.55, 1.9);
    for (let z = 0.4; z < 3.6; z += 0.55) this.deco(0.16, 1.1, 0.03, M.metal, -W + 0.4, 0.5, z);
    // Repisas con cajas de munición.
    for (const [y, n] of [[2.35, 5], [2.95, 4]]) {
      this.deco(0.45, 0.04, 2.6, M.metal, -W + 0.48, y, -2.6);
      for (let i = 0; i < n; i++) this.deco(0.3, 0.2, 0.36, i % 2 ? M.olive : M.dark, -W + 0.46, y + 0.04, -3.6 + i * 0.5);
    }
    // Pared derecha: casilleros y lámparas cálidas.
    for (let i = 0; i < 6; i++) {
      const z = -4.6 + i * 0.62;
      this.block(0.55, 2.05, 0.58, M.locker, W - 0.55, z);
      for (let k = 0; k < 4; k++) this.deco(0.01, 0.025, 0.3, M.dark, W - 0.83, 1.55 + k * 0.06, z);
      this.deco(0.012, 0.12, 0.03, M.steel, W - 0.83, 1.0, z + 0.2);
    }
    for (const z of [-0.8, -4.0]) {
      this.deco(0.16, 0.22, 0.3, M.dark, W - 0.33, 2.85, z);
      this.deco(0.03, 0.14, 0.24, M.amber, W - 0.42, 2.88, z);
    }
    // Cajones y cajas apiladas (primer plano izquierdo, fondo derecho).
    this.block(1.1, 0.75, 0.8, M.wood, -4.3, 2.3);
    this.block(0.9, 0.62, 0.7, M.wood, -4.25, 2.3, 0.75);
    this.block(0.8, 0.55, 0.65, M.olive, -3.15, 2.8);
    this.block(1.0, 0.7, 0.8, M.wood, 4.2, -3.6);
    this.deco(0.5, 0.36, 0.4, M.olive, 4.3, 0.7, -3.6);
    // Mesa auxiliar al fondo izquierdo (con el punto de soldadura).
    this.block(1.6, 0.85, 0.8, M.metal, -2.9, -2.3);
    this.deco(0.4, 0.25, 0.3, M.dark, -3.3, 0.85, -2.3);
    // Pantalla grande en el muro del fondo.
    const big = holoTexture('map');
    const wallScreen = new THREE.Mesh(
      new THREE.PlaneGeometry(2.1, 1.2),
      big ? new THREE.MeshBasicMaterial({ map: big, transparent: true, opacity: 0.92, toneMapped: false, depthWrite: false }) : M.screen,
    );
    wallScreen.position.set(-5.1, 2.35, BACK_Z + 0.27);
    this.scene.add(wallScreen);
  }

  buildLights() {
    const scene = this.scene;
    scene.add(new THREE.HemisphereLight('#a9c2d4', '#221b15', 0.95));
    // "Sol" del techo: luz principal fría con sombras (la usa gfx/lighting.js).
    const sun = new THREE.DirectionalLight('#d6ecff', 1.6);
    sun.position.set(-2.5, 9, 3);
    scene.add(sun);
    // Lámpara de trabajo sobre la mesa.
    const work = new THREE.SpotLight('#fff1d6', 30, 6, 0.75, 0.6, 1.5);
    work.position.set(BENCH.x, 2.5, BENCH.z);
    work.target.position.set(BENCH.x, BENCH_TOP, BENCH.z);
    scene.add(work, work.target);
    // Contraluz verde azulado: perfila al soldado del primer plano.
    const rim = new THREE.SpotLight('#2dffc0', 34, 9, 0.5, 0.6, 1.4);
    rim.position.set(2.4, 2.6, -0.6);
    rim.target.position.set(0.62, 1.3, 2.95);
    scene.add(rim, rim.target);
    // Relleno cálido sobre la espalda del soldado del primer plano (si no, queda como una silueta negra).
    const key = new THREE.SpotLight('#ffd9b0', 16, 7, 0.42, 0.7, 1.5);
    key.position.set(-1.4, 2.9, 5.6);
    key.target.position.set(0.62, 1.15, 2.95);
    scene.add(key, key.target);
    // Luz cálida de las lámparas de la derecha y fría del campo de tiro.
    const warm = new THREE.PointLight('#ff9a45', 12, 9, 1.5);
    warm.position.set(OPEN_W + 1.3, 2.55, BACK_Z + 1.2);
    scene.add(warm);
    const range = new THREE.PointLight('#38ffd0', 14, 16, 1.4);
    range.position.set(0, 2.4, -12);
    scene.add(range);
    this.flicker = warm;
    // Luces de ambientación (sin ellas la escena se sigue entendiendo): se apagan en calidad baja.
    this.extraLights = [key, warm, range];
  }

  buildFx() {
    const { M } = this;
    // Drones: uno escanea el rifle de la mesa con un abanico láser; otro patrulla al fondo.
    this.drones = [createDrone(), createDrone()];
    this.drones[0].group.position.set(BENCH.x + 0.3, 2.0, BENCH.z + 0.1);
    this.drones[0].group.rotation.y = -0.4;
    this.drones[1].group.position.set(-2.3, 2.85, -3.4);
    this.drones[1].group.rotation.y = 0.9;
    for (const d of this.drones) this.scene.add(d.group);

    const lt = laserTexture();
    const fanMat = new THREE.MeshBasicMaterial({
      color: lt ? '#ffffff' : '#36f5c4',
      map: lt,
      transparent: true,
      opacity: lt ? 0.85 : 0.25,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    // Abanico: triángulo del lente a una línea sobre la mesa (los vértices se mueven en update).
    const fanGeo = new THREE.BufferGeometry();
    fanGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(9), 3));
    fanGeo.setAttribute('uv', new THREE.Float32BufferAttribute([0.5, 1, 0, 0, 1, 0], 2));
    this.fan = new THREE.Mesh(fanGeo, fanMat);
    this.fan.frustumCulled = false;
    this.fan.userData.dynamic = true;
    this.scene.add(this.fan);
    // Línea brillante donde el láser toca la mesa (a lo ancho del abanico: 0.68 m en z).
    this.scanLine = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.004, 0.68), M.teal);
    this.scanLine.userData.dynamic = true;
    this.scene.add(this.scanLine);

    // Pantallas holográficas flotando sobre la mesa.
    this.holos = [];
    for (const [kind, x, y, z, w, h, ry] of [
      ['scan', BENCH.x - 0.8, 1.62, BENCH.z - 0.55, 0.9, 0.56, 0.22],
      ['stats', BENCH.x + 0.95, 1.78, BENCH.z - 0.7, 0.7, 0.44, -0.18],
    ]) {
      const map = holoTexture(kind);
      const mat = new THREE.MeshBasicMaterial({ color: '#ffffff', map, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
      if (!map) mat.color.set('#1d6b58');
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
      m.position.set(x, y, z);
      m.rotation.y = ry;
      m.userData.dynamic = true;
      m.userData.baseY = y;
      this.scene.add(m);
      this.holos.push(m);
    }

    // Chispas de soldadura en la mesa auxiliar.
    this.sparks = new Sparks({ count: 120, size: 0.045 });
    this.scene.add(this.sparks.points);
    this.weldAt = v3(-2.65, 0.9, -2.15);
    this.weldT = 0.5;
  }

  // Armas del estante y de la mesa (GLB a escala real, se cargan aparte).
  loadProps() {
    if (typeof document === 'undefined') return;
    const rx = -W + 0.5;
    const up = new THREE.Euler(-Math.PI / 2, Math.PI / 2, 0, 'YXZ'); // cañón hacia arriba, de perfil
    const flat = (yaw, roll = 0) => new THREE.Euler(0, yaw, Math.PI / 2 + roll, 'YXZ');
    placeWeapons(this.scene, [
      { id: 'rifle', position: v3(rx, 0.32, 0.65), rotation: up },
      { id: 'smg', position: v3(rx, 0.55, 1.2), rotation: up },
      { id: 'shotgun', position: v3(rx, 0.3, 1.75), rotation: up },
      { id: 'sniper', position: v3(rx, 0.25, 2.3), rotation: up },
      { id: 'rifle', position: v3(rx, 0.32, 2.85), rotation: up },
      // Sobre la mesa: el rifle que escanea el dron, una pistola y un subfusil.
      { id: 'rifle', position: v3(BENCH.x + 0.42, BENCH_TOP + 0.035, BENCH.z + 0.02), rotation: flat(Math.PI / 2 + 0.08) },
      { id: 'pistol', position: v3(BENCH.x - 0.35, BENCH_TOP + 0.025, BENCH.z + 0.3), rotation: flat(-Math.PI / 2 - 0.4) },
      { id: 'smg', position: v3(BENCH.x - 0.1, BENCH_TOP + 0.03, BENCH.z - 0.2), rotation: flat(Math.PI / 2 - 0.25) },
    ]).catch(() => {});
  }

  /** Calidad baja: sin las luces de ambientación (cada luz encarece todo lo que se dibuja). */
  setDetail(detail) {
    for (const l of this.extraLights) l.visible = detail !== 'baja';
  }

  update(dt) {
    this.time += dt;
    const t = this.time;
    for (const d of this.drones) d.update(dt, t);
    // El segundo dron recorre despacio el fondo de la sala.
    this.drones[1].setBase(v3(-2.3 + Math.sin(t * 0.18) * 1.6, 2.85 + Math.sin(t * 0.4) * 0.15, -3.4 + Math.cos(t * 0.18) * 0.6));
    this.drones[1].group.rotation.y = 0.9 + Math.sin(t * 0.18) * 0.6;

    // Abanico láser: barre el rifle de la mesa de un extremo al otro.
    const lens = this.drones[0].camera.getWorldPosition(new THREE.Vector3());
    const sweep = Math.sin(t * 0.9) * 0.42;
    const cx = BENCH.x + 0.42 + sweep;
    const cz = BENCH.z + 0.02;
    const half = 0.34;
    const p = this.fan.geometry.attributes.position;
    p.setXYZ(0, lens.x, lens.y, lens.z);
    p.setXYZ(1, cx, BENCH_TOP + 0.01, cz - half);
    p.setXYZ(2, cx, BENCH_TOP + 0.01, cz + half);
    p.needsUpdate = true;
    this.fan.geometry.computeBoundingSphere();
    this.fan.material.opacity = 0.62 + Math.sin(t * 23) * 0.06;
    this.scanLine.position.set(cx, BENCH_TOP + 0.012, cz);

    // Pantallas: flotan y parpadean levemente.
    this.holos.forEach((m, i) => {
      m.position.y = m.userData.baseY + Math.sin(t * 0.8 + i) * 0.015;
      m.material.opacity = 0.74 + Math.sin(t * 3.1 + i * 2) * 0.04 + (Math.random() < 0.01 ? -0.3 : 0);
    });
    // Blancos del fondo: pulso suave.
    const pulse = glowScale() * (0.85 + Math.sin(t * 1.6) * 0.15);
    for (const b of this.targets) b.material.color.setRGB(0.24 * pulse, 1.0 * pulse, 0.79 * pulse);
    // Lámpara cálida con un parpadeo ocasional.
    this.flicker.intensity = Math.random() < 0.015 ? 4 : 12;

    // Soldadura: ráfagas de chispas con su destello.
    this.weldT -= dt;
    if (this.weldT <= 0) {
      this.weldT = 0.08 + (Math.random() < 0.18 ? 1.2 + Math.random() * 1.6 : Math.random() * 0.12);
      this.sparks.burst(this.weldAt, v3(0.3, 1, 0.6).normalize(), 6 + Math.floor(Math.random() * 6), { speed: [1.2, 3.6], spread: 1.1 });
    }
    this.sparks.update(dt);
  }
}
