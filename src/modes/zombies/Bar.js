import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { glow } from '../../gfx/surfaces.js';
import { signTexture } from '../../gfx/canvasTextures.js';
import { DEFENSE } from './zombieData.js';

/*
  La barra del modo «Defensa de la barra»: la fuente de la plaza llena de botellas de licor.

  - Las botellas (vino, whisky, vodka, ron, ginebra y tequila) van sobre el borde de la fuente y en la
    columna del centro, con un letrero «BAR» encendido.
  - Los golpes de los zombis acumulan daño: cada DEFENSE.hpPerBottle se rompe la botella más cercana al
    que golpea (vidrio y licor saltando). Sin botellas, se pierde la partida.
  - Las botellas son sólidas para las balas: un tiro que se escapa también rompe la que toca.
  - Rendimiento: una malla instanciada por tipo de botella (6 llamadas de dibujo para 46 botellas) y la
    guirnalda de bombillas unida en una sola malla.
  - restock(n) repone botellas rotas (armería).
  Los zombis buscan el contorno de la barra con su propio campo de flujo (attackPoints).
*/

// Contorno exterior de la fuente (ver ZombieMap: anillo de 6 × 6 m centrado en (0, -3)).
export const BAR_RECT = { minX: -3.0, maxX: 3.0, minZ: -6.3, maxZ: 0.3 };
const RIM_Y = 0.75;
const PILLAR_Y = 1.6;

// Tipos de botella: color del vidrio, alto, radio, forma (lados del torno: 4 = cuadrada) y cuello.
const KINDS = [
  { name: 'vino', color: '#1d5a2c', h: 0.33, r: 0.042, sides: 12, neck: 0.4 },
  { name: 'whisky', color: '#b8641b', h: 0.27, r: 0.055, sides: 4, neck: 0.22 },
  { name: 'vodka', color: '#cfe6ff', h: 0.32, r: 0.04, sides: 12, neck: 0.3 },
  { name: 'ron', color: '#7a3a12', h: 0.29, r: 0.048, sides: 12, neck: 0.26 },
  { name: 'ginebra', color: '#2b72b8', h: 0.28, r: 0.05, sides: 6, neck: 0.24 },
  { name: 'tequila', color: '#e3bd4f', h: 0.25, r: 0.047, sides: 8, neck: 0.25 },
];

function bottleGeometry(k) {
  const { h, r, neck } = k;
  const nr = r * 0.32;
  const shoulder = h * (1 - neck);
  const pts = [
    [0, 0],
    [r * 0.96, 0],
    [r, 0.01],
    [r, shoulder],
    [r * 0.62, shoulder + h * neck * 0.35],
    [nr, shoulder + h * neck * 0.6],
    [nr, h - 0.012],
    [nr * 1.25, h - 0.01],
    [nr * 1.25, h],
    [0, h],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const g = new THREE.LatheGeometry(pts, k.sides);
  if (k.sides === 4) g.rotateY(Math.PI / 4);
  return g;
}

const _v = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _one = new THREE.Vector3(1, 1, 1);
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const UP = new THREE.Vector3(0, 1, 0);

export class Bar {
  /**
   * @param {import('../../core/Game.js').Game} game
   * @param {THREE.Object3D} root grupo del modo (se limpia al salir)
   */
  constructor(game, root) {
    this.game = game;
    this.root = root;
    this.world = game.world;
    this.acc = 0;
    this.bottles = [];
    const geos = KINDS.map(bottleGeometry);
    const mats = KINDS.map(
      (k) =>
        new THREE.MeshStandardMaterial({
          color: k.color,
          roughness: 0.12,
          metalness: 0.05,
          transparent: true,
          opacity: 0.86,
          emissive: k.color,
          emissiveIntensity: 0.22, // se ven de noche
        }),
    );
    this.mats = mats;
    let n = 0;
    const spots = [];
    const put = (x, y, z) => {
      const ki = (n * 7 + Math.floor(n / 3)) % KINDS.length;
      n++;
      spots.push({ ki, pos: new THREE.Vector3(x, y, z), rot: (n * 1.7) % (Math.PI * 2) });
    };
    // Borde de la fuente: muros norte y sur (a lo largo de x) y este y oeste (a lo largo de z).
    for (let x = -2.5; x <= 2.51; x += 0.5) {
      put(x, RIM_Y, 0);
      put(x, RIM_Y, -6);
    }
    for (let z = -5.2; z <= -0.79; z += 0.55) {
      put(-2.7, RIM_Y, z);
      put(2.7, RIM_Y, z);
    }
    // Columna del centro.
    for (const [dx, dz] of [[-0.3, -0.25], [0, -0.3], [0.3, -0.25], [-0.3, 0.25], [0, 0.3], [0.3, 0.25]]) put(dx, PILLAR_Y, -3 + dz);
    // Una malla instanciada por tipo: cada botella es una instancia (se esconde al romperse).
    this.meshes = KINDS.map((k, ki) => {
      const list = spots.filter((s) => s.ki === ki);
      const mesh = new THREE.InstancedMesh(geos[ki], mats[ki], Math.max(1, list.length));
      mesh.count = list.length;
      mesh.userData.bottle = true;
      mesh.userData.dynamic = true;
      mesh.castShadow = true;
      list.forEach((s, index) => {
        const b = { kind: k, ki, index, mesh, pos: s.pos, rot: s.rot, broken: false };
        this.bottles.push(b);
        this.place(b);
      });
      mesh.computeBoundingSphere();
      root.add(mesh);
      this.world.solids.push(mesh);
      return mesh;
    });
    this.total = this.bottles.length;

    // Letrero «BAR» sobre la columna, hacia el jugador (sur) y hacia el norte.
    const tex = signTexture('Bar', '#ffb54d');
    const signMat = glow('#ffd9a0');
    if (tex) signMat.map = tex;
    for (const [z, ry] of [[-2.38, 0], [-3.62, Math.PI]]) {
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.3), signMat);
      sign.position.set(0, PILLAR_Y + 0.55, z);
      sign.rotation.y = ry;
      sign.userData.dynamic = true;
      root.add(sign);
    }
    // Guirnalda de bombillas cálidas sobre el borde (solo brillo: sin luces reales que encarezcan).
    const bulbs = [];
    for (let x = -3; x <= 3.01; x += 0.6) {
      for (const z of [0.3, -6.3]) bulbs.push(new THREE.SphereGeometry(0.035, 8, 6).translate(x, 1.25 + Math.sin(x * 2.1) * 0.05, z));
    }
    const garland = new THREE.Mesh(mergeGeometries(bulbs, false), glow('#ffcf7a'));
    garland.userData.dynamic = true;
    root.add(garland);

    // Puntos alrededor de la barra (a 0.8 m del borde) para el campo de flujo de los zombis.
    const pts = [];
    const R = BAR_RECT;
    for (let x = R.minX; x <= R.maxX + 0.01; x += 1) pts.push({ x, z: R.maxZ + 0.8 }, { x, z: R.minZ - 0.8 });
    for (let z = R.minZ; z <= R.maxZ + 0.01; z += 1) pts.push({ x: R.minX - 0.8, z }, { x: R.maxX + 0.8, z });
    this.attackPoints = pts;
  }

  get left() {
    let n = 0;
    for (const b of this.bottles) if (!b.broken) n++;
    return n;
  }

  get missing() {
    return this.total - this.left;
  }

  get destroyed() {
    return this.left === 0;
  }

  // Matriz de la instancia de una botella (en su sitio, o a escala cero si está rota).
  place(b) {
    if (b.broken) b.mesh.setMatrixAt(b.index, ZERO);
    else b.mesh.setMatrixAt(b.index, _m.compose(b.pos, _q.setFromAxisAngle(UP, b.rot), _one));
    b.mesh.instanceMatrix.needsUpdate = true;
  }

  get center() {
    return _v.set(0, 1, -3);
  }

  /** Distancia en planta desde (x, z) hasta el borde de la barra (0 si está encima). */
  distance(x, z) {
    const R = BAR_RECT;
    const dx = Math.max(R.minX - x, 0, x - R.maxX);
    const dz = Math.max(R.minZ - z, 0, z - R.maxZ);
    return Math.hypot(dx, dz);
  }

  /** Punto del borde más cercano a (x, z). */
  nearest(x, z, out = { x: 0, z: 0 }) {
    const R = BAR_RECT;
    out.x = Math.max(R.minX, Math.min(x, R.maxX));
    out.z = Math.max(R.minZ, Math.min(z, R.maxZ));
    return out;
  }

  /** Golpe de un zombi desde `from` (posición): rompe botellas cada DEFENSE.hpPerBottle de daño. */
  damage(amount, from) {
    this.acc += amount;
    let broke = 0;
    while (this.acc >= DEFENSE.hpPerBottle && !this.destroyed) {
      this.acc -= DEFENSE.hpPerBottle;
      const b = this.nearestIntact(from);
      if (b) {
        this.breakBottle(b);
        broke++;
      }
    }
    return broke;
  }

  nearestIntact(from) {
    let best = null;
    let bestD = Infinity;
    for (const b of this.bottles) {
      if (b.broken) continue;
      const d = from ? b.pos.distanceToSquared(from) : Math.random();
      if (d < bestD) {
        bestD = d;
        best = b;
      }
    }
    return best;
  }

  /** Rompe una botella (golpe o balazo): vidrio y licor saltando, sonido de cristal. */
  breakBottle(b) {
    if (b.broken) return false;
    b.broken = true;
    this.place(b);
    const g = this.game;
    const p = b.pos.clone().setY(b.pos.y + b.kind.h * 0.5);
    g.effects.burst(p, UP, '#dff6ff', 10, 3.2);
    g.effects.burst(p, UP, b.kind.color, 12, 2.4);
    g.sfx.glass?.(g.panFor(p));
    return true;
  }

  /** Botella que tocó una bala (por su malla instanciada y el número de instancia). */
  bottleOf(mesh, instanceId) {
    return this.bottles.find((b) => b.mesh === mesh && b.index === instanceId) ?? null;
  }

  /** Repone hasta n botellas rotas. Devuelve cuántas volvieron. */
  restock(n) {
    let k = 0;
    for (const b of this.bottles) {
      if (k >= n) break;
      if (!b.broken) continue;
      b.broken = false;
      this.place(b);
      k++;
    }
    return k;
  }

  dispose() {
    const solids = this.world.solids;
    for (const m of this.meshes) {
      const i = solids.indexOf(m);
      if (i >= 0) solids.splice(i, 1);
    }
    for (const m of this.mats) m.dispose();
  }
}
