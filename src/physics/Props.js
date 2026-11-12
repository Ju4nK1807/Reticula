import * as THREE from 'three';
import { RigidBody, boxInertia, boxPoints, conePoints, cylinderInertia, cylinderPoints, separate, stepBody } from './RigidBody.js';
import { boxWorldUV, surface, tileOf } from '../gfx/surfaces.js';

/*
  Utilería con física de un mapa: cajas, barriles, botes de basura, latas y conos que reaccionan a las
  balas (en el punto del impacto), a las granadas y a quien los empuja (jugador, bots, zombis).

  - Cada objeto es una malla (o un grupo) en la escena y en world.solids: frena las balas y tapa la
    línea de visión como cualquier cobertura, pero se mueve. No entra en la geometría unida
    (userData.dynamic) ni en world.colliders: el jugador y los enemigos lo empujan en vez de chocar.
  - reset() los devuelve a su lugar al empezar cada partida.
  - Solo se usan en los modos de acción (zombi, infinito, campaña): la evaluación no tiene, para que
    los rangos sigan siendo comparables.
*/

// shape: box | cylinder | cone · medidas en m · mass en kg · material: sonido del golpe
export const PROP_TYPES = {
  crate: { shape: 'box', size: [0.62, 0.62, 0.62], mass: 16, restitution: 0.12, friction: 0.75, material: 'wood' },
  crateSmall: { shape: 'box', size: [0.46, 0.36, 0.46], mass: 6, restitution: 0.14, friction: 0.75, material: 'wood' },
  ammo: { shape: 'box', size: [0.36, 0.2, 0.2], mass: 3.5, restitution: 0.12, friction: 0.7, material: 'metal' },
  barrel: { shape: 'cylinder', radius: 0.29, height: 0.9, mass: 24, restitution: 0.18, friction: 0.6, material: 'metal', color: '#2f5d8a' },
  barrelRed: { shape: 'cylinder', radius: 0.29, height: 0.9, mass: 24, restitution: 0.18, friction: 0.6, material: 'metal', color: '#8c2e2a' },
  trash: { shape: 'cylinder', radius: 0.27, height: 0.8, mass: 8, restitution: 0.2, friction: 0.55, material: 'metal', color: '#56625a' },
  can: { shape: 'cylinder', radius: 0.034, height: 0.122, mass: 0.12, restitution: 0.35, friction: 0.45, material: 'can', color: '#c62828' },
  canGreen: { shape: 'cylinder', radius: 0.034, height: 0.122, mass: 0.12, restitution: 0.35, friction: 0.45, material: 'can', color: '#2e7d4f' },
  cone: { shape: 'cone', radius: 0.17, height: 0.52, mass: 1.4, restitution: 0.22, friction: 0.65, material: 'plastic', color: '#ff6a1a' },
};

const IMPACT_SOUND = 1.6; // m/s: choques más suaves no suenan
const SOUND_GAP = 0.12; // s mínimos entre sonidos del mismo objeto
const PUSH_KICK = 1.15; // el empujón deja al objeto algo más rápido que quien empuja

// --- Aspecto (geometrías y materiales compartidos por tipo) -----------------------------------------
const looks = new Map();
function lookFor(type) {
  if (looks.has(type)) return looks.get(type);
  const t = PROP_TYPES[type];
  const parts = [];
  if (t.shape === 'box') {
    const [w, h, d] = t.size;
    const mat = t.material === 'wood' ? surface('wood', '#6e5a40') : new THREE.MeshStandardMaterial({ color: '#4a5236', roughness: 0.6, metalness: 0.35 });
    const geo = new THREE.BoxGeometry(w, h, d);
    const tile = tileOf(mat);
    if (tile) boxWorldUV(geo, w, h, d, tile);
    parts.push([geo, mat]);
    if (t.material === 'wood') {
      // Listones oscuros en los cantos: se lee como caja de madera y no como un cubo.
      const dark = new THREE.MeshStandardMaterial({ color: '#3b2d1f', roughness: 0.85 });
      const band = new THREE.BoxGeometry(w + 0.012, 0.06, d + 0.012);
      parts.push([band.clone().translate(0, h / 2 - 0.03, 0), dark], [band.clone().translate(0, -h / 2 + 0.03, 0), dark]);
    } else {
      parts.push([new THREE.BoxGeometry(w + 0.01, 0.035, d + 0.01).translate(0, h / 2 - 0.018, 0), new THREE.MeshStandardMaterial({ color: '#2c3122', roughness: 0.55, metalness: 0.4 })]);
    }
  } else if (t.shape === 'cylinder') {
    const r = t.radius;
    const h = t.height;
    const can = t.material === 'can';
    const body = new THREE.MeshStandardMaterial({ color: t.color, roughness: can ? 0.32 : 0.48, metalness: can ? 0.75 : 0.55 });
    parts.push([new THREE.CylinderGeometry(r, r, h, can ? 14 : 22), body]);
    const rim = new THREE.MeshStandardMaterial({ color: can ? '#c9ced4' : '#2a2f33', roughness: 0.35, metalness: 0.85 });
    if (can) {
      parts.push([new THREE.CylinderGeometry(r * 0.92, r * 0.92, 0.006, 14).translate(0, h / 2, 0), rim]);
    } else {
      // Aros de refuerzo (barril) o tapa (bote de basura).
      for (const y of [-h * 0.22, h * 0.22]) parts.push([new THREE.CylinderGeometry(r + 0.012, r + 0.012, 0.035, 22).translate(0, y, 0), rim]);
      parts.push([new THREE.CylinderGeometry(r * 0.98, r * 0.98, 0.02, 22).translate(0, h / 2, 0), rim]);
    }
  } else {
    const r = t.radius;
    const h = t.height;
    const orange = new THREE.MeshStandardMaterial({ color: t.color, roughness: 0.55, metalness: 0 });
    const white = new THREE.MeshStandardMaterial({ color: '#e8e8e2', roughness: 0.5, metalness: 0 });
    parts.push([new THREE.CylinderGeometry(0.03, r, h - 0.03, 18).translate(0, 0.015, 0), orange]);
    parts.push([new THREE.CylinderGeometry(r * 0.52, r * 0.68, 0.07, 18).translate(0, 0.02, 0), white]);
    parts.push([new THREE.BoxGeometry(r * 2.1, 0.03, r * 2.1).translate(0, -h / 2 + 0.015, 0), orange]);
  }
  looks.set(type, parts);
  return parts;
}

function makeBody(t) {
  if (t.shape === 'box') {
    const [w, h, d] = t.size;
    return new RigidBody({ mass: t.mass, inertia: boxInertia(t.mass, w, h, d), points: boxPoints(w, h, d), radius: Math.hypot(w, h, d) / 2, footprint: Math.max(w, d) / 2, core: Math.min(w, d) / 2, height: h, restitution: t.restitution, friction: t.friction });
  }
  const r = t.radius;
  const h = t.height;
  const points = t.shape === 'cone' ? conePoints(r, h) : cylinderPoints(r, h, r < 0.1 ? 8 : 10);
  return new RigidBody({ mass: t.mass, inertia: cylinderInertia(t.mass, r, h), points, radius: Math.hypot(r, h / 2), footprint: r, core: r, height: h, restitution: t.restitution, friction: t.friction });
}

const halfHeight = (t) => (t.shape === 'box' ? t.size[1] / 2 : t.height / 2);
const _dir = new THREE.Vector3();
const _p = new THREE.Vector3();

export class Props {
  /**
   * @param {import('../scenes/World.js').World} world
   * @param {{ type: string, x: number, z: number, y?: number, ry?: number, rx?: number, rz?: number }[]} spawns
   *   y = altura de la base (0 = el suelo; sobre una barrera, su altura).
   */
  constructor(world, spawns = []) {
    this.world = world;
    this.items = [];
    this.onImpact = null; // (item, speed) → sonido (lo conecta Game)
    this.time = 0;
    for (const s of spawns) this.add(s);
  }

  add({ type, x, z, y = 0, ry = 0, rx = 0, rz = 0 }) {
    const t = PROP_TYPES[type];
    if (!t) throw new Error(`Utilería desconocida: ${type}`);
    const body = makeBody(t);
    const group = new THREE.Group();
    group.userData.dynamic = true;
    for (const [geo, mat] of lookFor(type)) {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.userData.prop = body;
      mesh.userData.dynamic = true;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
      this.world.solids.push(mesh);
    }
    // Sobre el suelo del mapa (algunos tienen el piso un poco por encima de 0, o pisos con altura:
    // world.floorAt) o sobre lo que se indique.
    body.position.set(x, Math.max(y, this.floorAt(x, z, y)) + halfHeight(t), z);
    body.quaternion.setFromEuler(new THREE.Euler(rx, ry, rz));
    const item = { type, def: t, body, group, home: { p: body.position.clone(), q: body.quaternion.clone() }, soundT: 0 };
    body.item = item;
    this.world.scene.add(group);
    this.items.push(item);
    this.sync(item);
    return item;
  }

  sync(item) {
    item.group.position.copy(item.body.position);
    item.group.quaternion.copy(item.body.quaternion);
    item.group.updateMatrixWorld(true);
  }

  /** Todo a su lugar, quieto (al empezar una partida). */
  reset() {
    for (const it of this.items) {
      it.body.position.copy(it.home.p);
      it.body.quaternion.copy(it.home.q);
      it.body.velocity.set(0, 0, 0);
      it.body.angular.set(0, 0, 0);
      it.body.awake = false;
      it.body.lastImpact = 0;
      this.sync(it);
    }
  }

  get awakeCount() {
    let n = 0;
    for (const it of this.items) if (it.body.awake) n++;
    return n;
  }

  /** Balazo: impulso (N·s) en la dirección de la bala, aplicado en el punto del impacto. */
  hit(body, point, dir, impulse) {
    body.applyImpulse(_dir.copy(dir).normalize().multiplyScalar(impulse), point);
    this.onImpact?.(body.item, 2.5 + impulse);
  }

  /** Explosión: empuja hacia fuera (y algo hacia arriba) todo lo que está dentro del radio. */
  explode(point, radius, strength) {
    for (const it of this.items) {
      const b = it.body;
      const d = b.position.distanceTo(point);
      if (d > radius) continue;
      const k = 1 - d / radius;
      _dir.subVectors(b.position, point);
      _dir.y = Math.max(0, _dir.y) + 0.6 * Math.max(0.3, _dir.length());
      _dir.normalize().multiplyScalar(strength * k);
      // Un poco fuera del centro: además de salir volando, gira.
      _p.copy(b.position).addScaledVector(_dir, -0.0001).add(new THREE.Vector3((Math.random() - 0.5) * b.radius, (Math.random() - 0.5) * b.radius, 0));
      b.applyImpulse(_dir, _p);
    }
  }

  // Piso bajo (x, z) para algo a la altura y: el del mapa (veredas, pisos altos) o groundY.
  floorAt(x, z, y = 0) {
    return Math.max(this.world.groundY ?? 0, this.world.floorAt?.(x, z, y) ?? 0);
  }

  /**
   * movers: cilindros que empujan ({ x, z, r, y0, h }): el jugador y los enemigos. Avanza la física de
   * lo que está despierto y separa lo que se toca.
   */
  update(dt, movers = []) {
    this.time += dt;
    const colliders = this.world.colliders;
    // Empujones: el objeto sale del cilindro de quien camina y se lleva parte de su velocidad.
    for (const m of movers) {
      for (const it of this.items) {
        const b = it.body;
        if (b.position.y - b.radius > m.y0 + m.h || b.position.y + b.radius < m.y0) continue;
        const dx = b.position.x - m.x;
        const dz = b.position.z - m.z;
        const min = m.r + b.footprint * 0.85;
        const d2 = dx * dx + dz * dz;
        if (d2 >= min * min) continue;
        const d = Math.sqrt(d2) || 1e-4;
        const push = min - d;
        const nx = dx / d;
        const nz = dz / d;
        b.position.x += nx * push;
        b.position.z += nz * push;
        const along = b.velocity.x * nx + b.velocity.z * nz;
        const want = Math.min(4, (push / Math.max(dt, 1e-3)) * PUSH_KICK);
        if (along < want) {
          b.velocity.x += nx * (want - along);
          b.velocity.z += nz * (want - along);
        }
        b.wake();
      }
    }
    for (const it of this.items) {
      const b = it.body;
      if (!b.awake) continue;
      b.lastImpact = 0;
      stepBody(b, dt, colliders, this.floorAt(b.position.x, b.position.z, b.position.y - b.radius));
      it.soundT -= dt;
      if (b.lastImpact > IMPACT_SOUND && it.soundT <= 0) {
        it.soundT = SOUND_GAP;
        this.onImpact?.(it, b.lastImpact);
      }
    }
    // Choques entre objetos (esferas): solo si al menos uno se mueve.
    for (let i = 0; i < this.items.length; i++) {
      const a = this.items[i].body;
      for (let j = i + 1; j < this.items.length; j++) {
        const b = this.items[j].body;
        if (!a.awake && !b.awake) continue;
        separate(a, b);
      }
    }
    for (const it of this.items) if (it.body.awake) this.sync(it);
  }

  dispose() {
    for (const it of this.items) it.group.removeFromParent();
    const solids = this.world.solids;
    for (let i = solids.length - 1; i >= 0; i--) if (solids[i].userData.prop) solids.splice(i, 1);
    this.items.length = 0;
  }
}

// Generador pseudoaleatorio con semilla (la misma utilería en el mismo lugar cada vez).
function seeded(seed) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const hashSeed = (text) => [...String(text)].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7);

/**
 * Reparte utilería en un mapa a partir de sus coberturas: latas encima de las coberturas bajas y
 * cajas, barriles y conos a su lado, dentro de la zona del jugador, sin tapar el punto de aparición y
 * sin pisar nada. Devuelve la lista de apariciones (para Props).
 * counts: { cans, crates, barrels, cones, trash, ammo }
 */
export function autoPropSpawns(world, counts = {}, seed = hashSeed(world.name)) {
  const rng = seeded(seed);
  const zone = world.playerZone ?? world.openArea;
  const spawn = world.spawn;
  const out = [];
  const taken = [];
  const inZone = (x, z) => !zone || (x > zone.minX + 0.5 && x < zone.maxX - 0.5 && z > zone.minZ + 0.5 && z < zone.maxZ - 0.5);
  const clear = (x, z, r) =>
    inZone(x, z) &&
    (!spawn || Math.hypot(x - spawn.x, z - spawn.z) > 2.5) &&
    taken.every(([tx, tz, tr]) => Math.hypot(x - tx, z - tz) > r + tr + 0.4) &&
    world.isFree(x, z, r + 0.12, 0.05, 1.6);
  // Coberturas bajas apoyadas en el suelo (no muros ni plataformas enormes).
  const covers = world.colliders.filter((b) => {
    const w = b.max.x - b.min.x;
    const h = b.max.y - b.min.y;
    const d = b.max.z - b.min.z;
    return b.min.y < 0.05 && h > 0.5 && h < 1.45 && w > 0.5 && d > 0.5 && w * d < 9;
  });
  for (let i = covers.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [covers[i], covers[j]] = [covers[j], covers[i]];
  }
  let ci = 0;
  const nextCover = () => (covers.length ? covers[ci++ % covers.length] : null);

  // Latas sobre las coberturas (de a dos o tres por cobertura).
  let cans = counts.cans ?? 0;
  for (let guard = 0; cans > 0 && guard < covers.length * 2; guard++) {
    const b = nextCover();
    if (!b) break;
    const cx = (b.min.x + b.max.x) / 2;
    const cz = (b.min.z + b.max.z) / 2;
    if (!inZone(cx, cz)) continue;
    const n = Math.min(cans, 2 + Math.floor(rng() * 2));
    const alongX = b.max.x - b.min.x > b.max.z - b.min.z;
    const span = (alongX ? b.max.x - b.min.x : b.max.z - b.min.z) * 0.6;
    for (let k = 0; k < n; k++) {
      const t = n === 1 ? 0 : (k / (n - 1) - 0.5) * span;
      out.push({ type: rng() < 0.5 ? 'can' : 'canGreen', x: alongX ? cx + t : cx, z: alongX ? cz : cz + t, y: b.max.y, ry: rng() * 6 });
    }
    cans -= n;
  }
  // Objetos en el suelo junto a las coberturas.
  const ground = [];
  for (const [type, key] of [['crate', 'crates'], ['crateSmall', 'crates'], ['barrel', 'barrels'], ['barrelRed', 'barrels'], ['cone', 'cones'], ['trash', 'trash'], ['ammo', 'ammo']]) {
    const n = counts[key] ?? 0;
    const share = type === 'crateSmall' || type === 'barrelRed' ? Math.floor(n / 2) : Math.ceil(n / 2);
    const k = key === 'cones' || key === 'trash' || key === 'ammo' ? n : share;
    for (let i = 0; i < k; i++) ground.push(type);
  }
  for (const type of ground) {
    const t = PROP_TYPES[type];
    const r = t.shape === 'box' ? Math.hypot(t.size[0], t.size[2]) / 2 : t.radius;
    let placed = false;
    for (let attempt = 0; attempt < 24 && !placed; attempt++) {
      const b = nextCover();
      if (!b) break;
      // Un lado al azar de la cobertura, pegado a ella.
      const side = Math.floor(rng() * 4);
      const u = rng();
      let x;
      let z;
      if (side < 2) {
        x = b.min.x + (b.max.x - b.min.x) * u;
        z = side === 0 ? b.min.z - r - 0.15 : b.max.z + r + 0.15;
      } else {
        z = b.min.z + (b.max.z - b.min.z) * u;
        x = side === 2 ? b.min.x - r - 0.15 : b.max.x + r + 0.15;
      }
      if (!clear(x, z, r)) continue;
      taken.push([x, z, r]);
      out.push({ type, x, z, ry: rng() * Math.PI * 2 });
      placed = true;
    }
    // Sin coberturas a mano: contra los bordes de la zona (los costados y el fondo, no delante).
    for (let attempt = 0; attempt < 30 && !placed && zone; attempt++) {
      const edge = Math.floor(rng() * 3);
      const x = edge === 0 ? zone.minX + r + 0.6 : edge === 1 ? zone.maxX - r - 0.6 : zone.minX + (zone.maxX - zone.minX) * rng();
      const z = edge === 2 ? zone.maxZ - r - 0.6 : zone.minZ + (zone.maxZ - zone.minZ) * (0.35 + 0.65 * rng());
      if (!clear(x, z, r)) continue;
      taken.push([x, z, r]);
      out.push({ type, x, z, ry: rng() * Math.PI * 2 });
      placed = true;
    }
  }
  return out;
}
