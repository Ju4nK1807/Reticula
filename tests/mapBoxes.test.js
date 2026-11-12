// Auditoría de las cajas y la utilería del mapa zombi: apoyadas en su piso, sin atravesar paredes y sin
// tapar puertas, entradas de zombis, compras ni escaleras. Con el mapa y la física reales.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { BOX_SPOTS, ZombieMap } from '../src/modes/zombies/ZombieMap.js';
import { insideBox } from '../src/physics/obb.js';

const world = new ZombieMap();
const r2 = (v) => Math.round(v * 100) / 100;
const label = (o) => `${o.type ?? 'caja'} (${r2(o.x)}, ${r2(o.z)})`;

// Zonas que deben quedar libres: rectángulos { minX, maxX, minZ, maxZ, why }.
function clearZones() {
  const zones = [];
  const rect = (cx, cz, hx, hz, why) => zones.push({ minX: cx - hx, maxX: cx + hx, minZ: cz - hz, maxZ: cz + hz, why });
  // Puertas: el hueco y 3 m a cada lado.
  for (const d of Object.values(world.doors)) {
    const c = d.collider;
    const wide = c.max.x - c.min.x > c.max.z - c.min.z;
    const cx = (c.min.x + c.max.x) / 2;
    const cz = (c.min.z + c.max.z) / 2;
    if (wide) rect(cx, cz, (c.max.x - c.min.x) / 2, 3, `puerta ${d.id}`);
    else rect(cx, cz, 3, (c.max.z - c.min.z) / 2, `puerta ${d.id}`);
  }
  // Entradas de zombis: la boca y 2.5 m hacia dentro.
  for (const b of world.barricades) {
    const i = b.inward;
    const cx = b.mouth.x + i.x * 1.25;
    const cz = b.mouth.z + i.z * 1.25;
    if (Math.abs(i.z) > 0.5) rect(cx, cz, b.width / 2 + 0.3, 1.5, 'entrada de zombis');
    else rect(cx, cz, 1.5, b.width / 2 + 0.3, 'entrada de zombis');
  }
  // Compras y lo que se usa con E: un círculo de ~1 m (como un cuadrado).
  for (const it of world.interactables) if (it.kind !== 'door') rect(it.pos.x, it.pos.z, 0.9, 0.9, `${it.kind} ${it.id}`);
  // Inicio del jugador.
  rect(world.spawn.x, world.spawn.z, 1.5, 1.5, 'inicio');
  // Escaleras de la Feria y 2 m delante de su pie.
  for (const f of world.floors.filter((x) => x.axis)) {
    const pad = f.axis === 'x' ? { x: 2, z: 0 } : { x: 0, z: 2 };
    zones.push({ minX: f.minX - pad.x, maxX: f.maxX, minZ: f.minZ - pad.z, maxZ: f.maxZ, why: 'escalera' });
  }
  return zones;
}

const overlaps = (a, z) => a.minX < z.maxX && a.maxX > z.minX && a.minZ < z.maxZ && a.maxZ > z.minZ;

// Puntos de la base de una caja (centro, esquinas y lados, un poco hacia dentro) para ver si alguno cae
// dentro de otro colisionador.
function footprint(x, z, hx, hz, ry = 0) {
  const c = Math.cos(ry);
  const s = Math.sin(ry);
  const pts = [];
  for (const u of [-1, -0.5, 0, 0.5, 1]) for (const v of [-1, -0.5, 0, 0.5, 1]) {
    const lx = u * (hx - 0.03);
    const lz = v * (hz - 0.03);
    pts.push([x + lx * c + lz * s, z - lx * s + lz * c]);
  }
  return pts;
}

function penetrates(pts, y0, y1, self) {
  for (const b of world.colliders) {
    if (b === self || b.max.y <= y0 + 0.02 || b.min.y >= y1 - 0.02) continue;
    for (const [px, pz] of pts) if (insideBox(b, px, pz, 0)) return b;
  }
  return null;
}

describe('cajas fijas (coberturas de madera)', () => {
  const crates = world.crates;

  it('hay cajas registradas', () => {
    expect(crates.length).toBeGreaterThan(8);
  });

  it('cada una apoyada en su piso (toda la base sobre la misma altura: nada a medias en una vereda)', () => {
    const bad = [];
    for (const c of crates) {
      const h = c.s / 2;
      const ys = footprint(c.x, c.z, h, h).map(([x, z]) => world.floorAt(x, z, 0));
      if (Math.max(...ys) - Math.min(...ys) > 0.01 || Math.abs(c.y0 - ys[12]) > 0.01) bad.push(`${label(c)} pisos ${[...new Set(ys)].join('/')}`);
    }
    expect(bad).toEqual([]);
  });

  it('ninguna atraviesa paredes ni otras cosas', () => {
    const bad = [];
    for (const c of crates) {
      const hit = penetrates(footprint(c.x, c.z, c.s / 2, c.s / 2), c.y0, c.y0 + c.s, c.collider);
      if (hit) bad.push(`${label(c)} dentro de [${r2(hit.min.x)},${r2(hit.min.z)} → ${r2(hit.max.x)},${r2(hit.max.z)}]`);
    }
    expect(bad).toEqual([]);
  });
});

describe('utilería con física (cajas, munición, barriles, conos, basura)', () => {
  it('quieta al soltarla: no flota, no está enterrada ni dentro de una pared (no se mueve sola)', () => {
    const props = world.props;
    const start = props.items.map((it) => ({ it, p: it.body.position.clone(), q: it.body.quaternion.clone() }));
    for (const it of props.items) it.body.wake();
    for (let i = 0; i < 60 * 6; i++) props.update(1 / 60);
    const bad = [];
    for (const { it, p, q } of start) {
      const moved = it.body.position.distanceTo(p);
      // Inclinación (girar sobre su eje vertical no se nota).
      const up0 = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
      const turned = up0.angleTo(new THREE.Vector3(0, 1, 0).applyQuaternion(it.body.quaternion));
      if (moved > 0.03 || turned > 0.1) bad.push(`${it.type} (${r2(p.x)}, ${r2(p.y)}, ${r2(p.z)}) se movió ${r2(moved)} m, giró ${r2(turned)}`);
    }
    props.reset?.();
    expect(bad).toEqual([]);
  });
});

describe('espacio libre: puertas, pasillos, entradas, compras y escaleras', () => {
  it('ninguna caja ni utilería tapa una puerta, una entrada de zombis, una compra o una escalera', () => {
    const zones = clearZones();
    const things = [
      ...world.crates.map((c) => ({ ...c, half: c.s / 2 })),
      ...world.props.items.map((it) => ({ type: it.type, x: it.home.p.x, z: it.home.p.z, half: it.body.footprint ?? 0.3 })),
    ];
    const bad = [];
    for (const t of things) {
      const a = { minX: t.x - t.half, maxX: t.x + t.half, minZ: t.z - t.half, maxZ: t.z + t.half };
      const z = zones.find((zz) => overlaps(a, zz));
      if (z) bad.push(`${label(t)} tapa ${z.why}`);
    }
    expect(bad).toEqual([]);
  });

  it('la caja misteriosa: cada lugar en una zona distinta, libre y sin atravesar nada', () => {
    expect(new Set(BOX_SPOTS.map((s) => s.where)).size).toBe(BOX_SPOTS.length);
    const bad = [];
    for (let i = 0; i < BOX_SPOTS.length; i++) {
      world.moveBox(i);
      const s = BOX_SPOTS[i];
      const hx = Math.abs(Math.cos(s.ry)) > 0.5 ? 0.85 : 0.43;
      const hz = Math.abs(Math.cos(s.ry)) > 0.5 ? 0.43 : 0.85;
      // Apoyada en su piso: el mismo en todo el ancho de la caja (no a medias sobre una vereda).
      const y0 = world.floorAt(s.x, s.z, 0);
      const hit = penetrates(footprint(s.x, s.z, hx, hz), y0, y0 + 0.85, world.box.collider);
      if (hit) bad.push(`caja en ${s.where}`);
      if (Math.abs(world.box.group.position.y - y0) > 0.01) bad.push(`caja en ${s.where} flota o está enterrada`);
      for (const [dx, dz] of [[-hx, -hz], [hx, -hz], [-hx, hz], [hx, hz]]) {
        if (Math.abs(world.floorAt(s.x + dx, s.z + dz, 0) - y0) > 0.01) bad.push(`caja en ${s.where} a medias sobre una vereda`);
      }
    }
    world.moveBox(0);
    expect(bad).toEqual([]);
  });
});

