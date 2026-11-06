import * as THREE from 'three';
import { glow, paint, surface } from '../../../gfx/surfaces.js';
import { CampaignWorld } from './CampaignWorld.js';

const FACADE_X = 10; // cara interior de los edificios de la calle
const BLOCK_X = 20; // fondo de los edificios
const PLAZA_Z = -34; // donde la calle se abre a la plaza
const BACK_Z = -50; // edificio del fondo de la plaza
const FRONT_Z = 12.5; // edificio detrás del jugador
const BALCONY_Y = 3.8; // piso de los balcones
const PARAPET_H = 1.25;
const LOW_H = 1.3;

/*
  Ciudad (mapa 2 · Oro y Diamante): calle al anochecer que desemboca en una plaza.
  - El jugador está detrás de una barricada al inicio de la calle, mirando hacia la plaza.
  - Edificios a ambos lados con dos callejones por lado (flancos), balcones con parapeto (posiciones
    altas) en la calle y en el edificio del fondo.
  - Coches atravesados (se levantan detrás), quioscos (se asoman de lado), jardineras y una fuente.
  - Dos portales detrás del jugador.
*/
export class CityMap extends CampaignWorld {
  constructor() {
    super({
      name: 'Ciudad',
      background: '#1d2236',
      fogNear: 45,
      fogFar: 110,
      spawn: new THREE.Vector3(0, 0, 6),
      playerZone: { minX: -7.5, maxX: 7.5, minZ: 3, maxZ: 9.2 },
    });
    this.openArea = { minX: -17, maxX: 17, minZ: -47, maxZ: -6 };

    const scene = this.scene;
    scene.add(new THREE.HemisphereLight('#cdd6ff', '#3a3026', 1.6));
    const sun = new THREE.DirectionalLight('#ffc89a', 1.3);
    sun.position.set(-14, 18, 6);
    scene.add(sun);

    const L = this.lambert;
    const M = {
      asphalt: surface('asphalt', '#2c2f36'),
      sidewalk: surface('tiles', '#5a5d66'),
      bldgA: surface('brick', '#6b5a52'),
      bldgB: surface('plaster', '#4f5b6e'),
      bldgC: surface('plaster', '#76705f'),
      trim: surface('metal', '#2e323b'),
      concrete: surface('concrete', '#7b7f88'),
      planter: surface('concrete', '#5b4a3c'),
      leaves: L('#3f6b45'),
      kiosk: surface('metal_panel', '#2f6f8f'),
      carA: paint('#a33a3a'),
      carB: paint('#3a6aa3'),
      carC: paint('#c9c2b0'),
      tire: L('#15171b'),
      glass: new THREE.MeshBasicMaterial({ color: '#141a24' }),
      lit: glow('#ffd58a'),
      line: new THREE.MeshBasicMaterial({ color: '#d8d8d0' }),
      lamp: glow('#fff1c9'),
      water: new THREE.MeshBasicMaterial({ color: '#2b6c8f' }),
    };

    // --- Suelo: calle, aceras, plaza ------------------------------------------------------------
    this.ground(120, 120, -20, M.asphalt);
    this.box(-FACADE_X, -6.5, PLAZA_Z, FRONT_Z, 0.12, M.sidewalk, 0, false);
    this.box(6.5, FACADE_X, PLAZA_Z, FRONT_Z, 0.12, M.sidewalk, 0, false);
    this.box(-BLOCK_X, BLOCK_X, BACK_Z, PLAZA_Z, 0.05, M.sidewalk, 0, false);
    for (let z = 8; z > PLAZA_Z; z -= 5) this.box(-0.12, 0.12, z - 2, z, 0.02, M.line, 0.02, false);
    for (let x = -5.5; x <= 5.5; x += 1.4) this.box(x - 0.35, x + 0.35, -3.8, -1.6, 0.02, M.line, 0.02, false); // paso de cebra

    // --- Edificios de la calle con callejones (flancos) --------------------------------------------
    const palette = [M.bldgA, M.bldgB, M.bldgC];
    const heights = [13, 10, 15];
    for (const side of [-1, 1]) {
      const x0 = side < 0 ? -BLOCK_X : FACADE_X;
      const x1 = side < 0 ? -FACADE_X : BLOCK_X;
      const segments = [
        [PLAZA_Z, -23.5],
        [-20.5, -10.5],
        [-7.5, FRONT_Z],
      ];
      segments.forEach(([z0, z1], i) => {
        const mat = palette[(i + (side > 0 ? 1 : 0)) % 3];
        const h = heights[(i + (side > 0 ? 2 : 0)) % 3];
        this.box(x0, x1, z0, z1, h, mat);
        this.windows(side * FACADE_X, z0, z1, h, side, M);
      });
      // Callejones: fondo cerrado lejos y puertas de flanco.
      this.box(x0, x1, -10.5, -7.5, 0.05, M.sidewalk, 0, false);
      this.box(x0, x1, -23.5, -20.5, 0.05, M.sidewalk, 0, false);
      this.addDoorSpot(side * 16, -9, side * 8.6, -9, 'flank');
      this.addDoorSpot(side * 16, -22, side * 8.6, -22, 'front');
    }
    // Cierre lejano de los callejones (para que no se vea el vacío).
    this.box(-BLOCK_X - 1, -BLOCK_X, -24, -7, 12, M.trim);
    this.box(BLOCK_X, BLOCK_X + 1, -24, -7, 12, M.trim);

    // --- Plaza y edificio del fondo ---------------------------------------------------------------
    this.box(-BLOCK_X - 1, BLOCK_X + 1, BACK_Z - 1, BACK_Z, 16, M.bldgB);
    this.windows(0, -BLOCK_X + 1, BLOCK_X - 1, 16, 0, M, BACK_Z);
    for (const side of [-1, 1]) {
      this.box(side < 0 ? -BLOCK_X - 1 : BLOCK_X, side < 0 ? -BLOCK_X : BLOCK_X + 1, BACK_Z, PLAZA_Z, 12, M.bldgC);
    }

    // --- Balcones con parapeto (posiciones altas) ---------------------------------------------------
    for (const side of [-1, 1]) {
      for (const z of [-14, -28]) {
        const inner = side * FACADE_X;
        const outer = side * (FACADE_X - 1.6);
        const [x0, x1] = [Math.min(inner, outer), Math.max(inner, outer)];
        this.box(x0, x1, z - 2.5, z + 2.5, 0.3, M.concrete, BALCONY_Y - 0.3);
        const px0 = side < 0 ? outer - 0.25 : outer; // parapeto en el borde exterior de la losa
        this.box(px0, px0 + 0.25, z - 2.5, z + 2.5, PARAPET_H, M.concrete, BALCONY_Y);
        // Laterales cerrados: sin ellos, al bot agachado se le veía por el extremo del parapeto.
        for (const e of [z - 2.5, z + 2.25]) this.box(x0, x1, e, e + 0.25, PARAPET_H, M.concrete, BALCONY_Y);
        const bx = side * (FACADE_X - 0.8);
        this.addRiseSpot(bx, BALCONY_Y, z - 0.9, 'high');
        this.addRiseSpot(bx, BALCONY_Y, z + 0.9, 'high');
        this.highSpots.push(new THREE.Vector3(bx, BALCONY_Y, z));
      }
    }
    for (const x of [-7, 7]) {
      this.box(x - 2.5, x + 2.5, BACK_Z, BACK_Z + 1.6, 0.3, M.concrete, BALCONY_Y - 0.3);
      this.box(x - 2.5, x + 2.5, BACK_Z + 1.6, BACK_Z + 1.85, PARAPET_H, M.concrete, BALCONY_Y);
      this.addRiseSpot(x - 1.2, BALCONY_Y, BACK_Z + 0.8, 'high');
      this.addRiseSpot(x + 1.2, BALCONY_Y, BACK_Z + 0.8, 'high');
      this.highSpots.push(new THREE.Vector3(x, BALCONY_Y, BACK_Z + 0.8));
    }

    // --- Coberturas de la calle ----------------------------------------------------------------------
    // Coches atravesados: el bot espera agachado detrás y se levanta.
    const car = (cx, cz, mat) => {
      this.box(cx - 2.1, cx + 2.1, cz - 0.95, cz + 0.95, 1.1, mat, 0.35);
      this.box(cx - 2.1, cx + 2.1, cz - 0.8, cz + 0.8, 0.35, M.tire);
      this.box(cx - 1.2, cx + 1.2, cz - 0.85, cz + 0.85, 0.6, M.glass, 1.45);
      for (const dx of [-1.5, 1.5]) this.addRiseSpot(cx + dx, 0, cz - 0.95 - 0.75, 'front');
    };
    car(-3, -12, M.carA);
    car(3.5, -25, M.carB);
    car(-9, -40, M.carC);

    // Quioscos: cobertura alta, se asoman de lado.
    const kiosk = (cx, cz) => {
      this.box(cx - 1.2, cx + 1.2, cz - 1.2, cz + 1.2, 2.6, M.kiosk);
      this.box(cx - 1.4, cx + 1.4, cz - 1.4, cz + 1.4, 0.15, M.trim, 2.6, false);
      this.addSideSpots(cx, cz, 2.4, 2.4, 0, 'front');
    };
    kiosk(-6.8, -17);
    kiosk(6.8, -30);

    // Jardineras bajas y fuente de la plaza.
    const planter = (cx, cz, w) => {
      this.box(cx - w / 2, cx + w / 2, cz - 0.5, cz + 0.5, LOW_H, M.planter);
      this.box(cx - w / 2 + 0.1, cx + w / 2 - 0.1, cz - 0.4, cz + 0.4, 0.5, M.leaves, LOW_H, false);
      for (const dx of [-w / 4, w / 4]) this.addRiseSpot(cx + dx, 0, cz - 1.25, 'front');
    };
    planter(4.5, -6, 3);
    planter(-3.5, -21.5, 3);
    planter(-2, -46, 3);
    this.box(-2.2, 2.2, -43.2, -38.8, LOW_H, M.concrete);
    this.box(-1.9, 1.9, -42.9, -39.1, 0.05, M.water, LOW_H - 0.1, false);
    this.box(-0.35, 0.35, -41.35, -40.65, 2.6, M.concrete, 0, false);
    for (const dx of [-1.2, 1.2]) this.addRiseSpot(dx, 0, -43.95, 'front');

    // Farolas.
    for (const z of [0, -12, -24]) {
      for (const side of [-1, 1]) {
        this.box(side * 8.8 - 0.08, side * 8.8 + 0.08, z - 0.08, z + 0.08, 5, M.trim, 0, false);
        this.box(side * 8.8 - 0.5, side * 8.8 + 0.5, z - 0.2, z + 0.2, 0.15, M.lamp, 5, false);
      }
    }

    // --- Detrás del jugador: barricada visual y portales (espalda) ---------------------------------------
    this.wallX(-BLOCK_X - 1, BLOCK_X + 1, FRONT_Z, 12, M.bldgA, [{ at: -5, w: 2.6 }, { at: 5, w: 2.6 }]);
    for (const x of [-5, 5]) this.addDoorSpot(x, 14.5, x, 10.2, 'back');
    for (const x of [-6.2, -2, 2, 6.2]) this.box(x - 1.5, x + 1.5, 2.2, 2.6, 0.9, M.concrete, 0, false);

    this.finish();
  }

  // Ventanas decorativas en una fachada. side ±1: fachada de la calle en x = xFace; 0: fachada del
  // fondo en z = zFace (mirando a +Z).
  windows(xFace, a0, a1, h, side, M, zFace = 0) {
    const floors = Math.floor((h - 2) / 3.2);
    for (let f = 0; f < floors; f++) {
      const y = 1.6 + f * 3.2;
      for (let a = a0 + 1.5; a < a1 - 1; a += 3) {
        const mat = (Math.floor(a * 7 + f * 13) & 3) === 0 ? M.lit : M.glass;
        if (side === 0) this.box(a, a + 1.2, zFace, zFace + 0.06, 1.6, mat, y, false);
        else {
          const x = xFace - side * 0.03;
          this.box(x - 0.03, x + 0.03, a, a + 1.2, 1.6, mat, y, false);
        }
      }
    }
  }
}
