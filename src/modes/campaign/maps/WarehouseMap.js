import * as THREE from 'three';
import { CampaignWorld } from './CampaignWorld.js';

const HALF_W = 22; // el interior va de x = -22 a 22
const BACK_Z = -46; // muro del fondo
const FRONT_Z = 12.5; // muro detrás del jugador
const WALL_H = 9;
const RACK_H = 4.2;
const RACK_D = 1.2;
const LOW_H = 1.3;
const CATWALK_Y = 4.6; // altura del piso de la pasarela
const CATWALK_Z = -43.6;

/*
  Bodega (mapa 1 · Bronce y Plata): almacén interior.
  - El jugador está en el muelle de carga (z 2…9) mirando hacia el fondo.
  - Tres filas de estanterías altas perpendiculares a la vista, con un pasillo central largo: los bots
    se esconden detrás y se asoman por los extremos.
  - Palés y cajas bajas (se levantan detrás), un montacargas y una pasarela elevada en el fondo con
    barandilla (posiciones altas).
  - Portones laterales (flancos) y dos puertas detrás del jugador.
*/
export class WarehouseMap extends CampaignWorld {
  constructor() {
    super({
      name: 'Bodega',
      background: '#14171d',
      fogNear: 40,
      fogFar: 90,
      spawn: new THREE.Vector3(0, 0, 5.5),
      playerZone: { minX: -13, maxX: 13, minZ: 2.2, maxZ: 9 },
    });
    this.openArea = { minX: -19, maxX: 19, minZ: -40, maxZ: -5 };

    const scene = this.scene;
    scene.add(new THREE.HemisphereLight('#f4ead8', '#2b2620', 1.5));
    const key = new THREE.DirectionalLight('#fff2dc', 1.1);
    key.position.set(6, 20, 10);
    scene.add(key);

    const L = this.lambert;
    const M = {
      floor: L('#3a3a3a'),
      wall: L('#4b5160'),
      wallLow: L('#3e434f'),
      rack: L('#28456e'),
      beam: L('#e07b26'),
      boxA: L('#9b7a4e'),
      boxB: L('#7e623d'),
      pallet: L('#8a6b43'),
      forklift: L('#e3b21f'),
      dark: L('#1d2027'),
      steel: L('#59606e'),
      stripe: new THREE.MeshBasicMaterial({ color: '#f2c14e' }),
      lamp: new THREE.MeshBasicMaterial({ color: '#fff4d6' }),
      accent: new THREE.MeshBasicMaterial({ color: '#00ffa3' }),
    };

    // --- Piso, muros, techo ------------------------------------------------------------------
    this.ground(70, 80, -16, M.floor);
    const grid = new THREE.GridHelper(70, 35, '#4a4a4a', '#414141');
    grid.position.set(0, 0.01, -16);
    scene.add(grid);
    this.wallZ(BACK_Z, FRONT_Z, -HALF_W - 0.5, WALL_H, M.wall, [{ at: -9, w: 3 }, { at: -24, w: 3 }]);
    this.wallZ(BACK_Z, FRONT_Z, HALF_W + 0.5, WALL_H, M.wall, [{ at: -9, w: 3 }, { at: -24, w: 3 }]);
    this.wallX(-HALF_W - 1, HALF_W + 1, BACK_Z - 0.5, WALL_H, M.wall);
    this.wallX(-HALF_W - 1, HALF_W + 1, FRONT_Z, WALL_H, M.wall, [{ at: -8, w: 3 }, { at: 8, w: 3 }]);
    this.box(-HALF_W, HALF_W, -6, -5.6, 0.6, M.wallLow, WALL_H - 0.6, false); // viga del techo
    this.ceiling(HALF_W * 2 + 2, FRONT_Z - BACK_Z + 2, (FRONT_Z + BACK_Z) / 2, WALL_H, '#1b1e24');
    for (const z of [6, -6, -18, -30, -40]) {
      for (const x of [-12, 0, 12]) this.box(x - 2.5, x + 2.5, z - 0.15, z + 0.15, 0.08, M.lamp, WALL_H - 0.1, false);
    }

    // Borde del muelle (zona del jugador) con franja amarilla.
    this.box(-HALF_W, HALF_W, 1.4, 1.7, 0.03, M.stripe, 0.01, false);

    // --- Estanterías ------------------------------------------------------------------------------
    // ends: 'both' | 'inner' (solo el extremo hacia el pasillo central; los exteriores del fondo quedan
    // tapados por la fila delantera desde toda la zona del jugador).
    const rack = (cx, cz, w, ends = 'both') => {
      this.box(cx - w / 2, cx + w / 2, cz - RACK_D / 2, cz + RACK_D / 2, RACK_H, M.rack);
      for (const y of [1.3, 2.7, 4.0]) this.box(cx - w / 2 - 0.02, cx + w / 2 + 0.02, cz - RACK_D / 2 - 0.02, cz + RACK_D / 2 + 0.02, 0.1, M.beam, y, false);
      for (let x = cx - w / 2 + 0.7; x < cx + w / 2 - 0.5; x += 1.6) {
        this.box(x, x + 1.1, cz - 0.62, cz + 0.62, 0.9, (Math.round(x) & 1) ? M.boxA : M.boxB, 1.4, false);
      }
      if (ends === 'both') this.addSideSpots(cx, cz, w, RACK_D, 0, 'front');
      else {
        const s = Math.sign(cx); // extremo que mira al centro
        const z = cz - RACK_D / 2 - 0.7;
        const edge = cx - s * (w / 2);
        this.spot(edge + s * 0.6, 0, z, edge - s * 1.1, 0, z, 'side', 'front');
      }
    };
    rack(-11, -14, 8); // fila A (pasillo central libre)
    rack(11, -14, 8);
    rack(0, -27, 8); // fila B (centro)
    rack(-12, -38, 8, 'inner'); // fila C
    rack(12, -38, 8, 'inner');

    // --- Coberturas bajas: palés con cajas (se levantan detrás) -------------------------------------
    const low = (cx, cz, w, d = 1) => {
      this.box(cx - w / 2, cx + w / 2, cz - d / 2, cz + d / 2, LOW_H, M.pallet);
      this.box(cx - w / 2 + 0.1, cx + w / 2 - 0.1, cz - d / 2 + 0.1, cz + d / 2 - 0.1, 0.06, M.boxB, LOW_H, false);
      for (const dx of [-w / 4, w / 4]) this.addRiseSpot(cx + dx, 0, cz - d / 2 - 0.75, 'front');
    };
    low(-7, -7, 3);
    low(7, -8, 3);
    low(-17, -21, 3);
    low(17, -20.5, 3);
    low(0, -20, 4);
    low(-6, -32, 3);

    // Montacargas: cobertura alta y ancha.
    this.box(13, 16.2, -32, -30, 2.2, M.forklift);
    this.box(13.2, 14.4, -31.8, -30.2, 0.6, M.dark, 2.2, false);
    this.box(12.6, 13, -31.6, -30.4, 3.2, M.steel, 0, false);
    this.addSideSpots(14.6, -31, 3.2, 2, 0, 'front');

    // --- Pasarela del fondo (posiciones altas) ---------------------------------------------------------
    this.box(-20, 20, -45.5, -42.6, 0.3, M.steel, CATWALK_Y - 0.3);
    this.box(-20, 20, -42.6, -42.35, 1.25, M.steel, CATWALK_Y); // barandilla: se agachan detrás
    this.box(-20, 20, -42.62, -42.33, 0.06, M.stripe, CATWALK_Y + 1.25, false);
    for (const x of [-18, -9, 0, 9, 18]) this.box(x - 0.2, x + 0.2, -43.4, -43, CATWALK_Y - 0.3, M.steel, 0, false);
    for (const x of [-12, -4, 4, 12]) this.addRiseSpot(x, CATWALK_Y, CATWALK_Z, 'high');
    for (let x = -16; x <= 16; x += 4) this.highSpots.push(new THREE.Vector3(x, CATWALK_Y, CATWALK_Z));

    // --- Puertas: flancos (portones laterales) y espalda (detrás del jugador) -----------------------
    for (const side of [-1, 1]) {
      this.addDoorSpot(side * 24.5, -9, side * 20.4, -9, 'flank');
      this.addDoorSpot(side * 24.5, -24, side * 20.4, -24, 'front');
      this.addDoorSpot(side * 8, 14.5, side * 8, 10.2, 'back');
      for (const z of [-9, -24]) this.box(side * (HALF_W + 0.45) - 0.05, side * (HALF_W + 0.45) + 0.05, z - 1.3, z + 1.3, 0.12, M.lamp, 3.1, false);
    }

    this.finish();
  }
}
