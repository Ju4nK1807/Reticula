import * as THREE from 'three';
import { SKIES, createSky } from '../../gfx/sky.js';
import { glow, glowScale, paint, surface } from '../../gfx/surfaces.js';
import { World } from '../../scenes/World.js';
import { Props } from '../../physics/Props.js';
import { withObb } from '../../physics/obb.js';

/*
  "Barrio en ruinas": plaza nocturna rodeada de edificios. El jugador se mueve dentro de la plaza
  (PLAZA); la horda entra por seis callejones (ENTRIES) desde fuera de la vista.

  Expone:
  - entries: [{ id, spawn, entry, center }] — dónde aparece cada zombi (fuera, en el callejón) y por
    dónde entra a la plaza.
  - nav: límites para la cuadrícula de navegación (incluye los callejones).
  - update(dt): parpadeo del fuego de los barriles.
*/

export const PLAZA = 22; // m: la plaza va de -PLAZA a +PLAZA en x y z
const WALL_H = 9;
const ALLEY_W = 4.2;
const OUTSIDE = 9; // m que se extiende cada callejón hacia fuera

// Callejones: lado (n/s/e/o) y posición a lo largo de ese lado.
const ALLEYS = [
  { side: 'n', at: -10 },
  { side: 'n', at: 11 },
  { side: 's', at: 2 },
  { side: 'o', at: -6 },
  { side: 'e', at: -12 },
  { side: 'e', at: 9 },
];

export class ZombieMap extends World {
  constructor() {
    super({
      name: 'Barrio en ruinas',
      background: '#0a0f15',
      fogNear: 9,
      fogFar: 58,
      spawn: new THREE.Vector3(0, 0, 6),
      playerZone: { minX: -PLAZA + 0.6, maxX: PLAZA - 0.6, minZ: -PLAZA + 0.6, maxZ: PLAZA - 0.6 },
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
      tire: new THREE.MeshStandardMaterial({ color: '#111214', roughness: 0.9 }),
      glass: new THREE.MeshStandardMaterial({ color: '#0d1218', roughness: 0.15, metalness: 0.6 }),
      lamp: glow('#ffe1a8'),
      window: glow('#ffb86b'),
      fire: glow('#ff8a3d'),
      line: new THREE.MeshStandardMaterial({ color: '#9a978c', roughness: 0.8 }),
    };
    this.materials = M;
    const block = this.block.bind(this);

    // --- Suelo ---------------------------------------------------------------------------------
    this.ground(130, 130, 0, M.gravel);
    block(PLAZA * 2, 0.02, PLAZA * 2, M.asphalt, 0, 0, 0, false);
    for (const [x, z, w, d] of [[0, -PLAZA + 1.5, PLAZA * 2, 3], [0, PLAZA - 1.5, PLAZA * 2, 3], [-PLAZA + 1.5, 0, 3, PLAZA * 2 - 6], [PLAZA - 1.5, 0, 3, PLAZA * 2 - 6]]) {
      block(w, 0.12, d, M.sidewalk, x, z, 0, false);
    }
    for (let x = -16; x <= 16; x += 8) block(3, 0.025, 0.25, M.line, x, -4, 0.02, false); // marcas viales

    // --- Edificios del perímetro, con los huecos de los callejones -----------------------------------
    this.entries = [];
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
      for (const at of gaps) this.alley(side, at, M, id);
    }

    // --- Coberturas de la plaza ----------------------------------------------------------------------
    // Fuente central (anillo de concreto) y bancos.
    for (const [x, z, w, d] of [[0, -6, 6, 0.6], [0, 0, 6, 0.6], [-2.7, -3, 0.6, 5.4], [2.7, -3, 0.6, 5.4]]) block(w, 0.75, d, M.concrete, x, z);
    block(1.2, 1.6, 1.2, M.concrete, 0, -3);
    // Autos abandonados.
    this.car(-11, 4, 0.35, M.carA, M);
    this.car(12, -7, -0.6, M.carB, M);
    this.car(8, 13, 1.35, M.carC, M);
    // Barreras de concreto y sacos terreros.
    for (const [x, z, ry] of [[-6, 12, 0], [-14, -12, 0.5], [15, 3, 1.57], [5, -15, 0.2]]) {
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
    for (const [x, z, s] of [[19, -5, 1], [18, -4, 0.8], [-12, 17, 1.1], [-11, 18.2, 0.8]]) block(s, s, s, M.wood, x, z, 0);
    // Vallas rotas.
    for (const [x, z, w] of [[-4, 18.5, 6], [10, -19.5, 5]]) {
      block(w, 1.3, 0.12, M.metal, x, z, 0);
      for (let i = 0; i <= 2; i++) block(0.12, 1.5, 0.12, M.metal, x - w / 2 + (i * w) / 2, z, 0);
    }

    // --- Luces: farolas y barriles con fuego ------------------------------------------------------------
    for (const [x, z] of [[-15, -15], [15, -15], [-15, 15], [15, 15], [0, 15], [-19, 0], [19, 0]]) {
      block(0.18, 5, 0.18, M.metal, x, z, 0, false);
      block(1.2, 0.12, 0.3, M.metal, x, z, 5, false);
      block(0.9, 0.06, 0.24, M.lamp, x, z, 4.95, false);
    }
    this.fireMat = M.fire;
    this.flames = [];
    for (const [x, z] of [[-7, -12], [9, 6], [-15, 1], [4, 17]]) {
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.3, 0.9, 12), M.metal);
      barrel.position.set(x, 0.45, z);
      scene.add(barrel);
      this.solids.push(barrel);
      this.colliders.push(new THREE.Box3().setFromCenterAndSize(barrel.position, new THREE.Vector3(0.64, 0.9, 0.64)));
      // Fuego: dos lenguas que cambian de tamaño (se animan en update).
      for (const [r, h, dx] of [[0.24, 0.6, 0], [0.15, 0.42, 0.08]]) {
        const flame = new THREE.Mesh(new THREE.ConeGeometry(r, h, 6), M.fire);
        flame.position.set(x + dx, 0.9 + h / 2, z - dx);
        flame.userData.dynamic = true; // se escala cada cuadro: no entra en la geometría unida
        flame.userData.base = h;
        scene.add(flame);
        this.flames.push(flame);
      }
    }
    this.fireT = 0;

    // Navegación: la plaza más los callejones.
    const reach = PLAZA + 3 + OUTSIDE + 1;
    this.nav = { minX: -reach, maxX: reach, minZ: -reach, maxZ: reach };
    this.openArea = { minX: -PLAZA + 2, maxX: PLAZA - 2, minZ: -PLAZA + 2, maxZ: PLAZA - 2 };

    // Utilería con física: latas sobre barreras y sacos (para tirarlas a balazos), conos, botes de
    // basura en las veredas, cajas y barriles. Los zombis los empujan al pasar.
    const along = (x, z, ry, d) => [x + Math.cos(ry) * d, z - Math.sin(ry) * d];
    const cans = [];
    for (const [x, z, ry, ds] of [[-6, 12, 0, [-0.9, 0, 0.9]], [-14, -12, 0.5, [-0.8, 0, 0.8]], [15, 3, 1.57, [-0.6, 0.6]], [5, -15, 0.2, [-0.7, 0.7]]]) {
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
      { type: 'crateSmall', x: 2.5, z: 19.6, ry: -0.5 },
      { type: 'barrel', x: -9.6, z: -14.4 },
      { type: 'barrelRed', x: 11.2, z: 9.6 },
      { type: 'barrel', x: -16.4, z: 12.6 },
      { type: 'barrelRed', x: 19.6, z: 12.0 },
    ]);
    scene.updateMatrixWorld(true);
  }

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

  // Callejón: muros laterales hacia fuera y un fondo; registra la entrada.
  alley(side, at, M, id) {
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
    const end = base.clone().addScaledVector(dir, depth - 3 + 0.3);
    if (side.axis === 'x') this.block(w + 1.2, WALL_H - 2, 0.6, M.brickDark, end.x, end.z);
    else this.block(0.6, WALL_H - 2, w + 1.2, M.brickDark, end.x, end.z);
    this.entries.push({
      id: this.entries.length,
      side: id,
      spawn: base.clone().addScaledVector(dir, 4.5), // dentro del callejón, fuera de la vista de la plaza
      entry: base.clone().addScaledVector(side.inward, 2.5),
      center: base.clone(),
    });
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
    this.colliders.push(withObb(new THREE.Box3().setFromObject(body).union(new THREE.Box3().setFromObject(cabin)), x, z, 2.1, 0.95, ry));
  }

  // Colisionador de una caja recién creada y girada: la caja alineada que la envuelve.
  fixCollider(mesh) {
    mesh.updateMatrixWorld(true);
    this.colliders[this.colliders.length - 1] = new THREE.Box3().setFromObject(mesh);
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
  }
}
