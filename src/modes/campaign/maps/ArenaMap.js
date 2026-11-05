import * as THREE from 'three';
import { CampaignWorld } from './CampaignWorld.js';

const HALF_W = 21;
const BACK_Z = -46;
const FRONT_Z = 11.5;
const WALL_H = 7;
const TOWER_H = 2; // torre central
const TOWER_HALF = 3;
const TOWER_Z = -24;
const LEDGE_Y = 3; // plataformas laterales
const LEDGE_INNER = 17;
const PARAPET_H = 1.25;
const LOW_H = 1.3;

/*
  Arena (mapa 3 · Élite): arena competitiva simétrica, iluminada y con acentos de neón.
  - El jugador está detrás de una barrera en un extremo.
  - Torre central con parapeto (los bots se levantan arriba) y dos plataformas laterales elevadas con
    barandilla: muchas posiciones altas y ángulos cruzados.
  - Pilares (se asoman de lado) y barreras bajas repartidas simétricamente.
  - Túneles laterales (flancos y frente) y dos accesos detrás del jugador.
*/
export class ArenaMap extends CampaignWorld {
  constructor() {
    super({
      name: 'Arena',
      background: '#0f1220',
      fogNear: 50,
      fogFar: 110,
      spawn: new THREE.Vector3(0, 0, 6),
      playerZone: { minX: -10, maxX: 10, minZ: 3, maxZ: 9 },
    });
    this.openArea = { minX: -16, maxX: 16, minZ: -42, maxZ: -6 };

    const scene = this.scene;
    scene.add(new THREE.HemisphereLight('#e6ecff', '#2a2440', 1.8));
    const key = new THREE.DirectionalLight('#ffffff', 1.2);
    key.position.set(0, 24, 12);
    scene.add(key);

    const L = this.lambert;
    const M = {
      floorA: L('#2a2f45'),
      floorB: L('#323852'),
      wall: L('#3b4262'),
      block: L('#555e82'),
      blockAlt: L('#4a527a'),
      tower: L('#5f6890'),
      cyan: new THREE.MeshBasicMaterial({ color: '#36d6ff' }),
      magenta: new THREE.MeshBasicMaterial({ color: '#ff4fd8' }),
      accent: new THREE.MeshBasicMaterial({ color: '#00ffa3' }),
      dark: L('#1a1d2c'),
    };

    // --- Suelo a cuadros, muros con neón, túneles ------------------------------------------------------
    this.ground(100, 100, -17, M.floorA);
    for (let x = -HALF_W; x < HALF_W; x += 6) {
      for (let z = BACK_Z; z < FRONT_Z; z += 6) {
        if (((x + z) / 6) & 1) this.box(x, x + 6, z, Math.min(z + 6, FRONT_Z), 0.02, M.floorB, 0.005, false);
      }
    }
    this.wallZ(BACK_Z, FRONT_Z, -HALF_W - 0.5, WALL_H, M.wall, [{ at: -38, w: 3 }, { at: -8, w: 3 }]);
    this.wallZ(BACK_Z, FRONT_Z, HALF_W + 0.5, WALL_H, M.wall, [{ at: -38, w: 3 }, { at: -8, w: 3 }]);
    this.wallX(-HALF_W - 1, HALF_W + 1, BACK_Z - 0.5, WALL_H, M.wall);
    this.wallX(-HALF_W - 1, HALF_W + 1, FRONT_Z + 0.5, WALL_H, M.wall, [{ at: -7, w: 2.8 }, { at: 7, w: 2.8 }]);
    for (const side of [-1, 1]) {
      const x = side * (HALF_W - 0.02);
      this.box(x - 0.03, x + 0.03, BACK_Z, FRONT_Z, 0.12, side < 0 ? M.cyan : M.magenta, 5.4, false);
    }
    this.box(-HALF_W, HALF_W, BACK_Z + 0.02, BACK_Z + 0.08, 0.12, M.accent, 5.4, false);

    // --- Torre central ---------------------------------------------------------------------------------
    const tz0 = TOWER_Z - TOWER_HALF;
    const tz1 = TOWER_Z + TOWER_HALF;
    this.box(-TOWER_HALF, TOWER_HALF, tz0, tz1, TOWER_H, M.tower);
    this.box(-TOWER_HALF, TOWER_HALF, tz1 - 0.3, tz1, PARAPET_H, M.block, TOWER_H); // parapeto frontal
    this.box(-TOWER_HALF - 0.02, TOWER_HALF + 0.02, tz1 - 0.02, tz1 + 0.02, 0.1, M.accent, TOWER_H - 0.4, false);
    for (const x of [-1.6, 1.6]) this.addRiseSpot(x, TOWER_H, tz1 - 1.1, 'high');
    for (const x of [-2, 0, 2]) this.highSpots.push(new THREE.Vector3(x, TOWER_H, TOWER_Z - 1));
    this.addSideSpots(0, TOWER_Z, TOWER_HALF * 2, TOWER_HALF * 2, 0, 'front'); // al pie de la torre

    // --- Plataformas laterales elevadas ------------------------------------------------------------------
    for (const side of [-1, 1]) {
      const [x0, x1] = side < 0 ? [-HALF_W, -LEDGE_INNER] : [LEDGE_INNER, HALF_W];
      this.box(x0, x1, -34, -12, 0.3, M.block, LEDGE_Y - 0.3);
      const rx = side < 0 ? -LEDGE_INNER : LEDGE_INNER - 0.25;
      this.box(rx, rx + 0.25, -34, -12, PARAPET_H, M.blockAlt, LEDGE_Y);
      for (const z of [-34, -12.25]) this.box(x0, x1, z, z + 0.25, PARAPET_H, M.blockAlt, LEDGE_Y); // laterales cerrados
      this.box(rx - 0.01, rx + 0.26, -34, -12, 0.08, side < 0 ? M.cyan : M.magenta, LEDGE_Y + PARAPET_H, false);
      for (const z of [-16, -32]) this.box(side * 19 - 0.25, side * 19 + 0.25, z - 0.25, z + 0.25, LEDGE_Y - 0.3, M.dark, 0, false);
      const sx = side * (LEDGE_INNER + 1);
      for (const z of [-16, -23, -30]) this.addRiseSpot(sx, LEDGE_Y, z, 'high');
      // Sin puntos más al fondo: los pilares laterales los tapan desde la zona del jugador (auditoría).
      for (const z of [-15, -19.5, -26.5]) this.highSpots.push(new THREE.Vector3(sx, LEDGE_Y, z));
    }

    // --- Pilares y barreras bajas (simétricos) ------------------------------------------------------------
    const pillar = (cx, cz) => {
      this.box(cx - 1, cx + 1, cz - 1, cz + 1, 5, M.block);
      this.box(cx - 1.02, cx + 1.02, cz - 1.02, cz + 1.02, 0.1, M.accent, 2.4, false);
      this.addSideSpots(cx, cz, 2, 2, 0, 'front');
    };
    const low = (cx, cz, w) => {
      this.box(cx - w / 2, cx + w / 2, cz - 0.4, cz + 0.4, LOW_H, M.blockAlt);
      this.box(cx - w / 2 - 0.02, cx + w / 2 + 0.02, cz - 0.42, cz + 0.42, 0.06, cx < 0 ? M.cyan : M.magenta, LOW_H, false);
      for (const dx of [-w / 4, w / 4]) this.addRiseSpot(cx + dx, 0, cz - 1.15, 'front');
    };
    for (const s of [-1, 1]) {
      pillar(s * 8, -14);
      pillar(s * 8, -34);
      pillar(s * 13.5, -24);
      low(s * 4.5, -9, 3);
      low(s * 12, -18, 3);
      low(s * 11, -40, 3);
    }
    low(0, -37, 5);

    // --- Barrera del jugador (visual) y accesos -----------------------------------------------------------
    this.box(-HALF_W, HALF_W, 2.2, 2.5, 0.9, M.block, 0, false);
    this.box(-HALF_W, HALF_W, 2.18, 2.52, 0.05, M.accent, 0.9, false);
    for (const side of [-1, 1]) {
      this.addDoorSpot(side * 23.5, -8, side * 19.6, -8, 'flank');
      this.addDoorSpot(side * 23.5, -38, side * 19.6, -38, 'front');
      this.addDoorSpot(side * 7, 13.5, side * 7, 9.7, 'back');
    }

    this.finish();
  }
}
