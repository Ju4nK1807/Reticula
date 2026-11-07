// Auditoría del mapa zombi por secciones, con su geometría y navegación reales: puertas que de verdad
// separan las secciones, entradas de zombis con camino hasta el jugador y compras alcanzables.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ZombieMap } from '../src/modes/zombies/ZombieMap.js';
import { NavGrid } from '../src/modes/zombies/navGrid.js';
import { DOORS, PERKS, WALL_BUYS } from '../src/modes/zombies/zombieData.js';

const world = new ZombieMap();
const navFor = () => new NavGrid({ ...world.nav, cell: 1, radius: 0.45, colliders: world.colliders });
// ¿Hay camino por la navegación desde (x, z) hasta el jugador en `to`?
const reachable = (nav, from, to) => {
  nav.build(to.x, to.z);
  return nav.pathDistance(from.x, from.z) < Infinity;
};
const spawn = world.spawn;

// Secciones a las que la horda NO llega con su puerta cerrada (la plaza rodea al vestíbulo: sus zombis
// entran por las ventanas; lo que la puerta de la plaza encierra es al jugador).
const WALLED = ['mercado', 'estacion', 'iglesia'];

describe('mapa zombi por secciones', () => {
  it('vestíbulo de inicio con 4 ventanas, la plaza y tres secciones más, cada una con su puerta', () => {
    expect(Object.keys(world.doors).sort()).toEqual(Object.keys(DOORS).sort());
    expect(world.entries.filter((e) => e.section === 'lobby')).toHaveLength(4);
    for (const id of Object.keys(DOORS)) {
      expect(world.entries.filter((e) => e.section === id).length, id).toBeGreaterThanOrEqual(3);
    }
    // Cada entrada tiene su barricada completa.
    expect(world.entries.every((e) => e.barricade?.boards === e.barricade?.max && e.barricade.max > 0)).toBe(true);
  });

  it('con las puertas cerradas la horda no llega a las secciones; al abrir cada una, sí', () => {
    world.resetDoors();
    const closed = navFor();
    for (const id of WALLED) {
      const inside = world.entries.find((e) => e.section === id).entry;
      expect(reachable(closed, inside, spawn), `${id} cerrada`).toBe(false);
    }
    for (const id of ['plaza', ...WALLED]) {
      world.openDoor(id);
      const nav = navFor();
      const inside = world.entries.find((e) => e.section === id).entry;
      expect(reachable(nav, inside, spawn), `${id} abierta`).toBe(true);
    }
    world.resetDoors();
    expect(world.colliders.filter((c) => Object.values(world.doors).some((d) => d.collider === c))).toHaveLength(Object.keys(DOORS).length);
  });

  it('el jugador queda encerrado en el vestíbulo: las ventanas no se cruzan y la puerta bloquea', () => {
    for (const e of world.entries.filter((x) => x.section === 'lobby')) {
      const m = e.barricade.mouth;
      const blocked = world.playerBlockers.some((b) => m.x >= b.min.x - 0.01 && m.x <= b.max.x + 0.01 && m.z >= b.min.z - 0.01 && m.z <= b.max.z + 0.01);
      expect(blocked, `ventana ${e.id}`).toBe(true);
    }
    expect(world.colliders.includes(world.doors.plaza.collider)).toBe(true);
  });

  it('cada entrada de zombis tiene sitio para aparecer y camino hasta la plaza (con todo abierto)', () => {
    for (const id of Object.keys(DOORS)) world.openDoor(id);
    const nav = navFor();
    nav.build(spawn.x, spawn.z);
    const bad = world.entries.filter((e) => !world.isFree(e.spawn.x, e.spawn.z, 0.42) || nav.pathDistance(e.spawn.x, e.spawn.z) === Infinity).map((e) => `#${e.id} ${e.section}/${e.side}`);
    world.resetDoors();
    expect(bad).toEqual([]);
  });

  it('cada compra del mapa (bebidas, armas de la pared, puertas y caja) se usa desde un sitio libre', () => {
    const kinds = { perk: Object.keys(PERKS), wallbuy: Object.keys(WALL_BUYS), door: Object.keys(DOORS), box: ['box'] };
    for (const [kind, ids] of Object.entries(kinds)) {
      for (const id of ids) {
        const it = world.interactables.find((x) => x.kind === kind && x.id === id);
        expect(it, `${kind} ${id}`).toBeTruthy();
        expect(world.isFree(it.pos.x, it.pos.z, 0.32), `${kind} ${id} ocupado`).toBe(true);
      }
    }
  });

  it('abrir una puerta deja pasar balas y vista; cerrarla las vuelve a bloquear', () => {
    const d = world.doors.mercado;
    const has = () => world.solids.includes(d.solid) && world.colliders.includes(d.collider);
    expect(has()).toBe(true);
    expect(world.openDoor('mercado')).toBe(true);
    expect(world.openDoor('mercado')).toBe(false);
    expect(has()).toBe(false);
    world.resetDoors();
    expect(has()).toBe(true);
  });

  it('el jugador empieza en el vestíbulo, en un sitio libre', () => {
    expect(world.isFree(spawn.x, spawn.z, 0.32)).toBe(true);
    expect(spawn.x > -10 && spawn.x < 10 && spawn.z > 10 && spawn.z < 22).toBe(true);
    expect(world.isOpen('lobby')).toBe(true);
    expect(world.isOpen('plaza')).toBe(false);
    expect(world.isOpen('mercado')).toBe(false);
  });
});

describe('barricadas', () => {
  it('el zombi sale de la tierra, arranca los tablones uno a uno y recién entonces entra', async () => {
    const { Zombie } = await import('../src/modes/zombies/Zombie.js');
    const { waveConfig, zombieStats, BARRICADE } = await import('../src/modes/zombies/zombieData.js');
    world.resetBarricades();
    const nav = navFor();
    nav.build(spawn.x, spawn.z);
    const torn = [];
    const run = { root: new THREE.Group(), nav, onZombieAttack() {}, onGroan() {}, onZombieDeath() {}, onTearBoard: (z, b) => world.removeBoard(b) && torn.push(z.t) };
    const entry = world.entries.find((e) => e.section === 'lobby');
    const z = new Zombie(run, zombieStats('walker', waveConfig(1)), entry.spawn.clone());
    z.entry = entry;
    z.rise();
    const ctx = { playerPos: spawn, zombies: [z], colliders: world.colliders, decoy: null };
    const b = entry.barricade;
    const inside = () => (z.position.x - b.mouth.x) * b.inward.x + (z.position.z - b.mouth.z) * b.inward.z;
    let maxInsideWithBoards = -Infinity;
    for (let i = 0; i < 60 * 30 && z.state !== 'attack'; i++) {
      z.update(1 / 60, ctx);
      if (b.boards > 0) maxInsideWithBoards = Math.max(maxInsideWithBoards, inside());
    }
    expect(torn).toHaveLength(BARRICADE.boards); // arrancó todos
    expect(maxInsideWithBoards).toBeLessThan(0); // con tablones nunca cruzó
    expect(z.state).toBe('attack'); // y después llegó al jugador
    world.resetBarricades();
    expect(b.boards).toBe(b.max);
  });

  it('reparar vuelve a poner tablones hasta el máximo', () => {
    const b = world.barricades[0];
    world.removeBoard(b);
    world.removeBoard(b);
    expect(b.boards).toBe(b.max - 2);
    expect(world.addBoard(b)).toBe(true);
    expect(world.addBoard(b)).toBe(true);
    expect(world.addBoard(b)).toBe(false);
  });

  it('la caja misteriosa da un arma que no tienes', async () => {
    const { rollBox, BOX_POOL } = await import('../src/modes/zombies/zombieData.js');
    const owned = new Set(['pistol', ...BOX_POOL.slice(1)]);
    expect(rollBox(owned)).toBe(BOX_POOL[0]);
    expect(rollBox(new Set(['pistol', ...BOX_POOL]))).toBeNull();
  });
});

describe('suavidad de la horda en el mapa real', () => {
  it('una fila de zombis cruza la plaza sin girar de golpe', async () => {
    const { Zombie } = await import('../src/modes/zombies/Zombie.js');
    const { waveConfig, zombieStats } = await import('../src/modes/zombies/zombieData.js');
    const nav = navFor();
    const player = new THREE.Vector3(0, 0, 6);
    nav.build(player.x, player.z);
    const run = { root: new THREE.Group(), nav, onZombieAttack() {}, onGroan() {}, onZombieDeath() {}, onTearBoard: (z, b) => world.removeBoard(b) };
    const zombies = [];
    const ctx = { playerPos: player, zombies, colliders: world.colliders, decoy: null };
    world.resetBarricades();
    for (const e of world.entries.filter((x) => x.section === 'plaza')) {
      const z = new Zombie(run, zombieStats('walker', waveConfig(3)), e.spawn.clone());
      z.entry = e;
      zombies.push(z);
    }
    let jumps = 0;
    let frames = 0;
    const prev = new Map();
    // Salen a ~30 m del jugador: a 1.7 m/s necesitan unos 18 s.
    for (let f = 0; f < 60 * 30; f++) {
      for (const z of zombies) {
        const x0 = z.position.x;
        const z0 = z.position.z;
        z.update(1 / 60, ctx);
        const mx = z.position.x - x0;
        const mz = z.position.z - z0;
        if (Math.hypot(mx, mz) < 1e-3) continue;
        const a = Math.atan2(mx, mz);
        if (prev.has(z)) {
          frames++;
          if (Math.abs(Math.atan2(Math.sin(a - prev.get(z)), Math.cos(a - prev.get(z)))) > 0.35) jumps++;
        }
        prev.set(z, a);
      }
    }
    // Todos llegan hasta el jugador (ninguno queda atascado en un callejón o una cobertura).
    const far = zombies.filter((z) => z.position.distanceTo(player) > 3).map((z) => z.position.toArray().map((v) => v.toFixed(1)).join(','));
    world.resetBarricades();
    expect(far).toEqual([]);
    expect(jumps / frames).toBeLessThan(0.01);
  });
});
