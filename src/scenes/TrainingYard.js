import * as THREE from 'three';
import { World } from './World.js';

// Mapa de la evaluación con enemigos: patio exterior con coberturas, puertas laterales/traseras
// y un balcón alto. El jugador mira hacia -Z; el campo enemigo va de z = -5 a z = -46.
// coverSpots: lugares donde un bot puede esconderse y asomarse ("peek").
export class TrainingYard extends World {
  constructor() {
    super({
      name: 'Patio de entrenamiento',
      background: '#1c2636',
      fogNear: 50,
      fogFar: 120,
      spawn: new THREE.Vector3(0, 0, 4),
      playerZone: { minX: -21.7, maxX: 21.7, minZ: -3.0, maxZ: 10.6 },
    });
    this.openArea = { minX: -19, maxX: 19, minZ: -41, maxZ: -7 };

    const scene = this.scene;
    scene.add(new THREE.HemisphereLight('#dbe7ff', '#3a3226', 1.8));
    const sun = new THREE.DirectionalLight('#fff4e0', 1.6);
    sun.position.set(-12, 20, 10);
    scene.add(sun);

    const lambert = (color) => new THREE.MeshLambertMaterial({ color, flatShading: true });
    const M = {
      ground: lambert('#3a3f47'),
      wall: lambert('#4a5466'),
      wallDark: lambert('#394252'),
      concrete: lambert('#6b7383'),
      trim: lambert('#2c333f'),
      crate: lambert('#8a6c45'),
      crateDark: lambert('#6e5536'),
      container: lambert('#2f6f8f'),
      hill: lambert('#28323f'),
      glass: new THREE.MeshBasicMaterial({ color: '#0d141d' }),
      accent: new THREE.MeshBasicMaterial({ color: '#00ffa3' }),
      lamp: new THREE.MeshBasicMaterial({ color: '#ffe9b0' }),
    };
    this.materials = M;

    const block = this.block.bind(this);
    const playerBlocker = this.playerBlocker.bind(this);

    // --- Suelo -------------------------------------------------------------
    this.ground(160, 160, -18, M.ground);
    const grid = new THREE.GridHelper(160, 80, '#4a5260', '#424955');
    grid.position.set(0, 0.01, -18);
    scene.add(grid);

    // --- Muros perimetrales con puertas -------------------------------------------
    for (const side of [-1, 1]) {
      const x = side * 22.5;
      for (const [a, b] of [[-47, -12], [-10, 0], [2, 12]]) block(1, 6, b - a, M.wall, x, (a + b) / 2);
      for (const z of [-11, 1]) {
        block(1, 2.8, 2, M.wall, x, z, 3.2);
        block(0.1, 0.12, 1.6, M.lamp, x - side * 0.55, z, 3.05, false);
      }
      playerBlocker(side > 0 ? 21.9 : -24, side > 0 ? 24 : -21.9, 0, 2);
    }
    for (const [a, b] of [[-22, -9], [-7, 7], [9, 22]]) block(b - a, 6, 1, M.wallDark, (a + b) / 2, 11.5);
    for (const x of [-8, 8]) {
      block(2, 2.8, 1, M.wallDark, x, 11.5, 3.2);
      block(1.6, 0.12, 0.1, M.lamp, x, 10.95, 3.05, false);
      playerBlocker(x - 1, x + 1, 10.9, 13);
    }

    // --- Fachada con balcón (posiciones altas) ------------------------------------
    block(46, 11, 1, M.wall, 0, -46.5);
    block(24, 0.3, 3, M.concrete, 0, -44.5, 3.3);
    block(24, 1.25, 0.25, M.concrete, 0, -43.1, 3.6);
    block(24, 0.08, 0.27, M.accent, 0, -43.1, 4.85, false);
    for (const x of [-8, 0, 8]) block(0.9, 3.2, 0.9, M.trim, x, -44.2, 3.6);
    for (const x of [-11.5, -4, 4, 11.5]) block(0.5, 3.3, 0.5, M.trim, x, -43.3);
    for (const x of [-17, -12, 12, 17]) block(2.2, 1.6, 0.1, M.glass, x, -45.95, 5.5, false);
    for (const x of [-16, 16]) block(2.4, 2.9, 0.1, M.glass, x, -45.95, 0, false);

    // --- Coberturas del campo -----------------------------------------------------
    const walls = [
      { x: -6, z: -14, w: 5 },
      { x: 9, z: -18, w: 4 },
      { x: -13, z: -24, w: 4 },
      { x: 3, z: -30, w: 6 },
      { x: 14, z: -35, w: 4 },
      { x: -4, z: -39, w: 4 },
    ];
    for (const c of walls) {
      block(c.w, 2.6, 0.6, M.concrete, c.x, c.z);
      block(c.w, 0.06, 0.62, M.trim, c.x, c.z, 2.6, false);
      this.addSideSpots(c.x, c.z, c.w, 0.6, 0, 'front');
    }

    const lowWalls = [
      { x: 0, z: -21, w: 4 },
      { x: -11, z: -33, w: 5 },
      { x: 12, z: -10, w: 3.5 },
    ];
    for (const c of lowWalls) {
      block(c.w, 1.3, 0.5, M.concrete, c.x, c.z);
      for (const dx of [-c.w / 4, c.w / 4]) this.addRiseSpot(c.x + dx, 0, c.z - 0.75, 'front');
    }

    // Pilas de cajas (2x2 cajas, una sola hitbox)
    for (const c of [{ x: -17, z: -12 }, { x: 17, z: -23 }, { x: -18, z: -38 }]) {
      block(2.4, 2.4, 1.2, M.crate, c.x, c.z);
      for (const [dx, dy] of [[-0.6, 0], [0.6, 0], [-0.6, 1.2], [0.6, 1.2]]) {
        block(1.16, 0.04, 1.22, (dx + dy) % 2 ? M.crateDark : M.trim, c.x + dx, c.z, dy + 1.14, false);
      }
      this.addSideSpots(c.x, c.z, 2.4, 1.2, 0, 'front');
    }
    block(2.6, 2.7, 6.5, M.container, 19, -30);

    // Balcón: asomarse junto a las columnas o levantarse detrás del parapeto
    for (const x of [-8, 0, 8]) {
      for (const side of [-1, 1]) {
        this.coverSpots.push(this.spot(x, 3.6, -45.2, x + side * 1.3, 3.6, -45.2, 'side', 'high'));
      }
    }
    for (const x of [-11, -4, 4, 11]) this.addRiseSpot(x, 3.6, -44, 'high');
    for (let x = -10.5; x <= 10.5; x += 3) this.highSpots.push(new THREE.Vector3(x, 3.6, -44));

    // Puertas: los bots entran caminando desde fuera del mapa
    for (const side of [-1, 1]) {
      this.coverSpots.push(this.spot(side * 24, 0, -11, side * 20.6, 0, -11, 'door', 'front'));
      this.coverSpots.push(this.spot(side * 24, 0, 1, side * 20.4, 0, 1, 'door', 'flank'));
      this.coverSpots.push(this.spot(side * 8, 0, 13, side * 8, 0, 9.2, 'door', 'back'));
    }

    // --- Zona del jugador -----------------------------------------------------------
    for (let x = -22; x <= 22; x += 2) block(0.1, 0.95, 0.1, M.trim, x, -3.3, 0, false);
    block(44, 0.07, 0.07, M.accent, 0, -3.3, 0.92, false);
    playerBlocker(-22, 22, -3.6, -3.05);
    block(1.2, 1.2, 1.2, M.crate, -7, 2);
    block(1.2, 1.2, 1.2, M.crateDark, 8, 6);
    block(1, 3, 1, M.trim, -14, 6);
    block(1, 3, 1, M.trim, 15, 3);

    // --- Decoración lejana ----------------------------------------------------------
    const hillGeo = new THREE.ConeGeometry(1, 1, 5);
    for (let i = 0; i < 14; i++) {
      const hill = new THREE.Mesh(hillGeo, M.hill);
      const a = (i / 14) * Math.PI * 2;
      const s = 14 + ((i * 53) % 9) * 2;
      hill.scale.set(s, s * 0.55, s);
      hill.position.set(Math.cos(a) * 75, (s * 0.55) / 2 - 1, -18 + Math.sin(a) * 75);
      hill.rotation.y = i;
      scene.add(hill);
    }

    scene.updateMatrixWorld(true);
  }

  spot(hx, hy, hz, ex, ey, ez, kind, area) {
    return {
      id: this.coverSpots.length,
      hidden: new THREE.Vector3(hx, hy, hz),
      exposed: new THREE.Vector3(ex, ey, ez),
      kind,
      area,
    };
  }

  // Bordes izquierdo y derecho de una cobertura ancha: el bot se oculta detrás y sale de lado.
  addSideSpots(cx, cz, w, d, y, area) {
    const z = cz - d / 2 - 0.7;
    this.coverSpots.push(this.spot(cx - w / 2 + 0.6, y, z, cx - w / 2 - 1.1, y, z, 'side', area));
    this.coverSpots.push(this.spot(cx + w / 2 - 0.6, y, z, cx + w / 2 + 1.1, y, z, 'side', area));
  }

  // Cobertura baja: el bot espera agachado y se levanta.
  addRiseSpot(x, y, z, area) {
    this.coverSpots.push(this.spot(x, y, z, x, y, z, 'rise', area));
  }
}
