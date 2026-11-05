import * as THREE from 'three';
import { World } from '../../scenes/World.js';

// Medidas del recinto (metros). El patio va de -HALF a HALF en X y en Z.
const HALF = 24;
const WALL_H = 4.5;
const WALL_T = 1;
const GATE_OFFSET = 10; // las puertas están a ±10 m del centro de cada muro
const GATE_W = 3.2;
const GATE_H = 3.2;
const SPAWN_OUT = 3.5; // dónde aparece el bot, fuera del muro
const ENTRY_IN = 4.5; // primer punto dentro del patio
const PLAYER_LIMIT = 21.3;
const BOT_LIMIT = 20.5;

const LAMP_IDLE = new THREE.Color('#ffe9b0');
const LAMP_WARN = new THREE.Color('#ff2a3d');

/*
  Bastión: patio cuadrado de 48 m con 8 puertas (dos por muro). Mapa del modo infinito: los enemigos
  pueden llegar desde cualquier lado, así que el jugador tiene que vigilar 360°.

  Diseño:
  - Los carriles que van de cada puerta hacia el centro están libres: los bots entran caminando en
    línea recta y nunca se atascan en la entrada.
  - Las coberturas están entre carriles, en tres anillos: pilares junto al centro, muros bajos a 12 m
    y muros altos y cajas a 16-17 m.
  - Cada puerta tiene una lámpara que se pone roja y parpadea antes de que entre un enemigo.

  Expone además de World: gates (puertas con spawn, entry, dir y lámpara), botArea (zona donde los
  bots eligen a dónde avanzar), warnGate(gate, s) y clearWarnings().
*/
export class BastionMap extends World {
  constructor() {
    super({
      name: 'Bastión',
      background: '#191e2b',
      fogNear: 46,
      fogFar: 115,
      spawn: new THREE.Vector3(0, 0, 0),
      playerZone: { minX: -PLAYER_LIMIT, maxX: PLAYER_LIMIT, minZ: -PLAYER_LIMIT, maxZ: PLAYER_LIMIT },
    });
    this.botArea = { minX: -BOT_LIMIT, maxX: BOT_LIMIT, minZ: -BOT_LIMIT, maxZ: BOT_LIMIT };
    this.gates = [];

    const scene = this.scene;
    scene.add(new THREE.HemisphereLight('#d9e2ff', '#3b2f26', 1.75));
    const sun = new THREE.DirectionalLight('#ffd9b0', 1.7);
    sun.position.set(14, 22, 9);
    scene.add(sun);

    const lambert = (color) => new THREE.MeshLambertMaterial({ color, flatShading: true });
    const M = {
      ground: lambert('#353a44'),
      yard: lambert('#3d434e'),
      wall: lambert('#4d5568'),
      wallTop: lambert('#5d667b'),
      concrete: lambert('#6b7383'),
      trim: lambert('#2a303b'),
      crate: lambert('#8a6c45'),
      crateDark: lambert('#6e5536'),
      tower: lambert('#414959'),
      hill: lambert('#262f3c'),
      accent: new THREE.MeshBasicMaterial({ color: '#00ffa3' }),
      accentDim: new THREE.MeshBasicMaterial({ color: '#0d5a45' }),
    };
    this.materials = M;
    const block = this.block.bind(this);

    // --- Suelo -------------------------------------------------------------------
    this.ground(170, 170, 0, M.ground);
    const yard = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2, HALF * 2), M.yard);
    yard.rotation.x = -Math.PI / 2;
    yard.position.y = 0.005;
    scene.add(yard);
    const grid = new THREE.GridHelper(HALF * 2, 24, '#4c5465', '#444b59');
    grid.position.y = 0.012;
    scene.add(grid);
    // Círculo central: referencia visual de dónde está el centro del patio.
    const ring = new THREE.Mesh(new THREE.RingGeometry(2.6, 2.85, 40), M.accentDim);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.02;
    scene.add(ring);

    // --- Muros con puertas -------------------------------------------------------------
    const gateEdge = GATE_OFFSET - GATE_W / 2;
    const gateFar = GATE_OFFSET + GATE_W / 2;
    const end = HALF + WALL_T / 2;
    const spans = [
      [-end, -gateFar],
      [-gateEdge, gateEdge],
      [gateFar, end],
    ];
    // side: dirección hacia dentro del patio (norte = +Z hacia dentro, etc.).
    const sides = [
      { axis: 'x', fixed: -HALF, inward: new THREE.Vector3(0, 0, 1) }, // norte
      { axis: 'x', fixed: HALF, inward: new THREE.Vector3(0, 0, -1) }, // sur
      { axis: 'z', fixed: -HALF, inward: new THREE.Vector3(1, 0, 0) }, // oeste
      { axis: 'z', fixed: HALF, inward: new THREE.Vector3(-1, 0, 0) }, // este
    ];
    for (const side of sides) {
      const along = side.axis; // eje a lo largo del muro
      const place = (a, b, h, y0, mat, depth = WALL_T) => {
        const len = b - a;
        const mid = (a + b) / 2;
        return along === 'x'
          ? block(len, h, depth, mat, mid, side.fixed, y0)
          : block(depth, h, len, mat, side.fixed, mid, y0);
      };
      for (const [a, b] of spans) {
        place(a, b, WALL_H, 0, M.wall);
        place(a, b, 0.25, WALL_H, M.wallTop, WALL_T + 0.2);
      }
      for (const sign of [-1, 1]) {
        const c = sign * GATE_OFFSET;
        place(c - GATE_W / 2, c + GATE_W / 2, WALL_H - GATE_H, GATE_H, M.wall); // dintel
        // Marco de la puerta y línea de acento en el piso.
        for (const e of [-1, 1]) place(c + e * (GATE_W / 2) - 0.2, c + e * (GATE_W / 2) + 0.2, GATE_H, 0, M.trim, WALL_T + 0.3);
        place(c - GATE_W / 2, c + GATE_W / 2, 0.02, 0.01, M.accentDim, 0.25); // umbral
        this.addGate(c, side);
      }
    }

    // Torres de las esquinas (decoración sólida).
    for (const x of [-HALF, HALF]) {
      for (const z of [-HALF, HALF]) {
        block(3.4, 7.5, 3.4, M.tower, x, z);
        block(3.8, 0.3, 3.8, M.wallTop, x, z, 7.5);
        block(3.82, 0.12, 3.82, M.accentDim, x, z, 5.2, false);
      }
    }

    // --- Coberturas (fuera de los carriles de las puertas, que quedan en x/z = ±10) -------
    // Pilares junto al centro.
    for (const x of [-5, 5]) {
      for (const z of [-5, 5]) {
        block(1.2, 3.2, 1.2, M.concrete, x, z);
        block(1.26, 0.12, 1.26, M.accentDim, x, z, 1.4, false);
      }
    }
    // Muros bajos a 12 m (se puede disparar por encima de pie; agachado cubren).
    for (const s of [-1, 1]) {
      block(5, 1.3, 0.6, M.concrete, 0, s * 12);
      block(0.6, 1.3, 5, M.concrete, s * 12, 0);
      block(5.02, 0.05, 0.62, M.trim, 0, s * 12, 1.3, false);
      block(0.62, 0.05, 5.02, M.trim, s * 12, 0, 1.3, false);
    }
    // Muros altos a 17 m.
    for (const a of [-5, 5]) {
      for (const s of [-1, 1]) {
        block(4, 2.6, 0.6, M.concrete, a, s * 17);
        block(0.6, 2.6, 4, M.concrete, s * 17, a);
      }
    }
    // Pilas de cajas en las diagonales.
    for (const x of [-16, 16]) {
      for (const z of [-16, 16]) {
        block(2.4, 2.4, 2.4, M.crate, x, z);
        block(2.42, 0.05, 2.42, M.crateDark, x, z, 1.2, false);
        block(1.2, 1.2, 1.2, M.crateDark, x - Math.sign(x) * 1.9, z, 0).rotation.y = 0.35;
      }
    }

    // --- Decoración lejana --------------------------------------------------------------
    const hillGeo = new THREE.ConeGeometry(1, 1, 5);
    for (let i = 0; i < 16; i++) {
      const hill = new THREE.Mesh(hillGeo, M.hill);
      const a = (i / 16) * Math.PI * 2 + 0.2;
      const s = 14 + ((i * 53) % 9) * 2.2;
      hill.scale.set(s, s * 0.5, s);
      hill.position.set(Math.cos(a) * 72, (s * 0.5) / 2 - 1, Math.sin(a) * 72);
      hill.rotation.y = i;
      scene.add(hill);
    }

    scene.updateMatrixWorld(true);
  }

  // Puerta en la posición `c` a lo largo del muro `side`.
  addGate(c, side) {
    const { axis, fixed, inward } = side;
    const at = (depth) =>
      axis === 'x'
        ? new THREE.Vector3(c, 0, fixed + inward.z * depth)
        : new THREE.Vector3(fixed + inward.x * depth, 0, c);
    const lampMat = new THREE.MeshBasicMaterial({ color: LAMP_IDLE });
    const lampPos = at(WALL_T / 2 + 0.06);
    const lamp =
      axis === 'x'
        ? this.block(GATE_W - 0.6, 0.16, 0.1, lampMat, lampPos.x, lampPos.z, GATE_H + 0.15, false)
        : this.block(0.1, 0.16, GATE_W - 0.6, lampMat, lampPos.x, lampPos.z, GATE_H + 0.15, false);
    this.gates.push({
      id: this.gates.length,
      dir: inward.clone(),
      spawn: at(-SPAWN_OUT),
      entry: at(ENTRY_IN),
      center: at(0),
      lamp,
      lampMat,
      warnT: 0,
    });
  }

  // Lámpara roja intermitente durante `seconds` (aviso de entrada).
  warnGate(gate, seconds) {
    gate.warnT = Math.max(gate.warnT, seconds);
  }

  clearWarnings() {
    for (const g of this.gates) {
      g.warnT = 0;
      g.lampMat.color.copy(LAMP_IDLE);
    }
  }

  update(dt) {
    for (const g of this.gates) {
      if (g.warnT <= 0) continue;
      g.warnT = Math.max(0, g.warnT - dt);
      const on = g.warnT > 0 && Math.floor(g.warnT * 8) % 2 === 0;
      g.lampMat.color.copy(on ? LAMP_WARN : LAMP_IDLE);
    }
  }
}
