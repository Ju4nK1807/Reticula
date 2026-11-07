import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { PROP_TYPES, Props, autoPropSpawns } from '../src/physics/Props.js';
import { World } from '../src/scenes/World.js';
import { BastionMap } from '../src/modes/endless/BastionMap.js';
import { ZombieMap } from '../src/modes/zombies/ZombieMap.js';

const DT = 1 / 60;
function flatWorld(colliders = []) {
  const w = new World({ name: 'prueba', background: '#000', fogNear: 1, fogFar: 2, spawn: new THREE.Vector3(0, 0, 0), playerZone: { minX: -10, maxX: 10, minZ: -10, maxZ: 10 } });
  w.colliders.push(...colliders);
  return w;
}
const step = (props, seconds, movers = []) => {
  for (let t = 0; t < seconds; t += DT) props.update(DT, movers);
};

describe('utilería con física', () => {
  it('cada objeto queda en los sólidos del mapa (frena balas) y apoyado en el suelo', () => {
    const w = flatWorld();
    const props = new Props(w, [{ type: 'crate', x: 2, z: 0 }, { type: 'can', x: -2, z: 1 }, { type: 'cone', x: 0, z: 3 }]);
    expect(w.solids.filter((m) => m.userData.prop)).toHaveLength(props.items.reduce((n, it) => n + it.group.children.length, 0));
    expect(props.items[0].body.position.y).toBeCloseTo(PROP_TYPES.crate.size[1] / 2, 5);
    expect(props.awakeCount).toBe(0); // quietos hasta que algo los toque
  });

  it('un balazo hace volar una lata; a una caja apenas la mueve', () => {
    const w = flatWorld();
    const props = new Props(w, [{ type: 'can', x: 0, z: 0 }, { type: 'crate', x: 4, z: 0 }]);
    const [can, crate] = props.items;
    const dir = new THREE.Vector3(1, 0, 0);
    props.hit(can.body, can.body.position.clone(), dir, 1.4);
    props.hit(crate.body, crate.body.position.clone(), dir, 1.4);
    step(props, 3);
    expect(can.body.position.x).toBeGreaterThan(2);
    expect(crate.body.position.x - 4).toBeLessThan(0.2);
    expect(props.awakeCount).toBe(0); // todo vuelve a dormirse
  });

  it('una explosión empuja hacia fuera y hacia arriba', () => {
    const w = flatWorld();
    const props = new Props(w, [{ type: 'crate', x: 1.5, z: 0 }, { type: 'barrel', x: -1.5, z: 0 }, { type: 'crate', x: 9, z: 0 }]);
    props.explode(new THREE.Vector3(0, 0.2, 0), 6, 90);
    let maxY = 0;
    for (let t = 0; t < 0.5; t += DT) {
      props.update(DT);
      maxY = Math.max(maxY, props.items[0].body.position.y);
    }
    step(props, 4);
    expect(props.items[0].body.position.x).toBeGreaterThan(2);
    expect(props.items[1].body.position.x).toBeLessThan(-2);
    expect(maxY).toBeGreaterThan(0.5);
    expect(props.items[2].body.position.x).toBe(9); // fuera del radio: ni se entera
  });

  it('quien camina empuja los objetos en vez de atravesarlos', () => {
    const w = flatWorld();
    const props = new Props(w, [{ type: 'cone', x: 0, z: 0 }]);
    const cone = props.items[0].body;
    const mover = { x: -1.5, z: 0, r: 0.38, y0: 0, h: 1.75 };
    for (let i = 0; i < 90; i++) {
      mover.x += 0.03;
      props.update(DT, [mover]);
      expect(Math.hypot(cone.position.x - mover.x, cone.position.z - mover.z)).toBeGreaterThan(0.38);
    }
    expect(cone.position.x).toBeGreaterThan(0.8);
  });

  it('reset() devuelve todo a su lugar', () => {
    const w = flatWorld();
    const props = new Props(w, [{ type: 'barrel', x: 3, z: 3, ry: 0.4 }]);
    const b = props.items[0].body;
    const home = b.position.clone();
    props.explode(new THREE.Vector3(2.5, 0, 2.5), 5, 120);
    step(props, 1);
    expect(b.position.distanceTo(home)).toBeGreaterThan(0.3);
    props.reset();
    expect(b.position.distanceTo(home)).toBe(0);
    expect(b.awake).toBe(false);
  });

  it('el reparto automático del Bastión queda dentro de la zona del jugador, libre y sin encimarse', () => {
    const map = new BastionMap();
    const spawns = autoPropSpawns(map, { cans: 6, crates: 4, barrels: 3, ammo: 2, cones: 2 });
    const ground = spawns.filter((s) => !s.y);
    expect(ground.length).toBeGreaterThanOrEqual(6);
    const z = map.playerZone;
    for (const s of spawns) {
      expect(s.x).toBeGreaterThan(z.minX);
      expect(s.x).toBeLessThan(z.maxX);
      expect(s.z).toBeGreaterThan(z.minZ);
      expect(s.z).toBeLessThan(z.maxZ);
    }
    for (let i = 0; i < ground.length; i++) {
      for (let j = i + 1; j < ground.length; j++) expect(Math.hypot(ground[i].x - ground[j].x, ground[i].z - ground[j].z)).toBeGreaterThan(0.5);
    }
    // Siempre igual (semilla por mapa).
    expect(autoPropSpawns(new BastionMap(), { cans: 6, crates: 4, barrels: 3, ammo: 2, cones: 2 })).toEqual(spawns);
  });

  it('el modo zombi tiene utilería y nada nace dentro de un obstáculo', () => {
    const map = new ZombieMap();
    expect(map.props.items.length).toBeGreaterThan(25);
    // Tras unos segundos sin tocar nada, todo sigue quieto donde estaba (nada cae ni salta).
    for (const it of map.props.items) it.body.wake();
    const before = map.props.items.map((it) => it.body.position.clone());
    step(map.props, 3);
    map.props.items.forEach((it, i) => expect(it.body.position.distanceTo(before[i]), it.type).toBeLessThan(0.06));
  });
});
