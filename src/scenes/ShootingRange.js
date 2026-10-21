import * as THREE from 'three';
import { World } from './World.js';

// Mapa de la evaluación con dianas: campo de tiro cubierto, sin coberturas que tapen los objetivos.
// El jugador se mueve detrás del mostrador (z de -0.6 a 5.6); las dianas aparecen entre 10 y 16 m.
export class ShootingRange extends World {
  constructor() {
    super({
      name: 'Campo de tiro',
      background: '#141a22',
      fogNear: 34,
      fogFar: 80,
      spawn: new THREE.Vector3(0, 0, 2.5),
      playerZone: { minX: -6.5, maxX: 6.5, minZ: -0.6, maxZ: 5.6 },
    });

    const scene = this.scene;
    scene.add(new THREE.HemisphereLight('#d4e3ff', '#2b2620', 1.7));
    const sun = new THREE.DirectionalLight('#ffffff', 1.5);
    sun.position.set(6, 14, 8);
    scene.add(sun);

    const lambert = (color) => new THREE.MeshLambertMaterial({ color, flatShading: true });
    const M = {
      floor: lambert('#232932'),
      wall: lambert('#333c4a'),
      wallDark: lambert('#28303c'),
      trim: lambert('#435064'),
      concrete: lambert('#4a5260'),
      crate: lambert('#6b5a43'),
      crateDark: lambert('#4f4232'),
      rock: lambert('#3b4350'),
      accent: new THREE.MeshBasicMaterial({ color: '#00ffa3' }),
      accentDim: new THREE.MeshBasicMaterial({ color: '#0d5a45' }),
      lamp: new THREE.MeshBasicMaterial({ color: '#e9f2ff' }),
    };
    const block = this.block.bind(this);

    // Piso y cuadrícula
    this.ground(80, 90, -20, M.floor);
    const grid = new THREE.GridHelper(80, 40, '#3a4555', '#2b333f');
    grid.position.set(0, 0.01, -20);
    scene.add(grid);

    // Muros: fondo, laterales y trasero
    block(44, 12, 1, M.wall, 0, -31.5);
    block(44, 0.25, 0.3, M.accent, 0, -30.85, 3.1, false);
    block(1, 10, 42, M.wallDark, -17, -11);
    block(1, 10, 42, M.wallDark, 17, -11);
    block(36, 10, 1, M.wallDark, 0, 7);

    // Vigas del techo con luminarias
    for (const z of [-3, -11, -19, -27]) {
      block(34, 0.5, 0.6, M.trim, 0, z, 8.75, false);
      block(6, 0.08, 0.3, M.lamp, -7, z, 8.68, false);
      block(6, 0.08, 0.3, M.lamp, 7, z, 8.68, false);
    }

    // Columnas laterales
    for (const z of [-4, -14, -24]) {
      for (const x of [-15.6, 15.6]) {
        block(1.2, 10, 1.2, M.concrete, x, z);
        block(1.25, 0.15, 1.25, M.accentDim, x, z, 1.15, false);
      }
    }

    // Mostrador de tiro a lo ancho de la zona del jugador, con mamparas laterales
    block(14, 1.0, 0.5, M.trim, 0, -1.15);
    block(14, 0.05, 0.04, M.accent, 0, -1.41, 0.94, false);
    for (const x of [-7.2, 7.2]) block(0.15, 2.6, 7.4, M.wall, x, 2.4);
    this.playerBlocker(-7.3, 7.3, -1.45, -0.85);

    // Marcas de distancia en el piso
    for (const z of [-5, -10, -15, -20, -25]) block(12, 0.02, 0.08, M.accentDim, 0, z, 0.01, false);

    // Cajas y rocas decorativas junto a los muros
    const crates = [
      [-14, -8, 1.4, 0.3], [-13.6, -9.6, 1.0, -0.2], [-14.1, -8.4, 0.9, 0.5, 1.4],
      [14, -18, 1.4, 0.1], [13.4, -16.6, 1.1, 0.6], [14.2, -6, 1.2, -0.4],
      [-13.8, -22, 1.3, 0.2], [-12.8, -23.2, 0.8, 0.9],
    ];
    crates.forEach(([x, z, s, ry, y0 = 0], i) => {
      const crate = block(s, s, s, i % 2 ? M.crateDark : M.crate, x, z, y0, false);
      crate.rotation.y = ry;
    });

    const rockGeo = new THREE.DodecahedronGeometry(1, 0);
    for (let i = 0; i < 9; i++) {
      const rock = new THREE.Mesh(rockGeo, M.rock);
      const s = 0.8 + ((i * 37) % 10) / 10;
      rock.scale.set(s * 1.4, s, s);
      rock.position.set(-14 + i * 3.5, s * 0.5, -30 + (i % 3) * 0.6);
      rock.rotation.set(i, i * 2, 0);
      scene.add(rock);
    }

    scene.updateMatrixWorld(true);
  }
}
