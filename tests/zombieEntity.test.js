import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Zombie } from '../src/modes/zombies/Zombie.js';
import { waveConfig, zombieStats } from '../src/modes/zombies/zombieData.js';

function setup({ colliders = [], type = 'walker' } = {}) {
  const attacks = [];
  const run = { root: new THREE.Group(), nav: null, onZombieAttack: (z) => attacks.push(z), onGroan() {}, onZombieDeath() {} };
  const zombies = [];
  const player = new THREE.Vector3(0, 0, 0);
  const ctx = { playerPos: player, zombies, colliders };
  const make = (x, z, t = type) => {
    const zb = new Zombie(run, zombieStats(t, waveConfig(1)), new THREE.Vector3(x, 0, z));
    zombies.push(zb);
    return zb;
  };
  const step = (sec, list = zombies) => {
    for (let i = 0; i < sec * 60; i++) for (const zb of list) zb.update(1 / 60, ctx);
  };
  return { run, ctx, player, make, step, attacks, zombies };
}

describe('zombi', () => {
  it('persigue al jugador y se detiene a su alcance para atacar', () => {
    const { make, step } = setup();
    const z = make(0, 10);
    step(2);
    expect(z.position.z).toBeLessThan(10 - 1.5);
    step(12);
    expect(z.state).toBe('attack');
    expect(z.position.distanceTo(new THREE.Vector3())).toBeLessThan(z.stats.attackRange + 0.1);
  });

  it('el golpe llega a mitad del gesto, y solo si el jugador sigue al alcance', () => {
    const { make, step, attacks, player } = setup();
    const z = make(0, 1.0);
    step(0.05);
    expect(z.state).toBe('attack');
    step(z.stats.attackEvery * 0.3);
    expect(attacks).toHaveLength(0);
    step(z.stats.attackEvery * 0.25);
    expect(attacks).toHaveLength(1);
    // Segundo golpe: el jugador retrocede a tiempo y lo esquiva.
    step(z.stats.attackEvery * 0.5);
    player.set(0, 0, -6);
    step(z.stats.attackEvery * 0.6);
    expect(attacks).toHaveLength(1);
  });

  it('no atraviesa las cajas del mapa', () => {
    const wall = new THREE.Box3(new THREE.Vector3(-3, 0, 4), new THREE.Vector3(3, 3, 5));
    const { make, step } = setup({ colliders: [wall] });
    const z = make(0, 9);
    step(6);
    // Sin campo de flujo va directo y queda pegado al muro, pero nunca dentro.
    expect(z.position.z).toBeGreaterThanOrEqual(5 + z.radius - 1e-6);
  });

  it('los zombis no se apilan: se separan entre sí', () => {
    const { make, step } = setup();
    const a = make(0, 8);
    const b = make(0.05, 8.02);
    step(1.5);
    expect(a.position.distanceTo(b.position)).toBeGreaterThan(a.radius + b.radius);
  });

  it('un golpe fuerte lo hace tambalear; al bruto no', () => {
    const { make } = setup();
    const w = make(0, 10);
    w.damage(80, 'body');
    expect(w.state).toBe('stagger');
    const b = make(2, 10, 'brute');
    b.damage(400, 'head');
    expect(b.state).toBe('chase');
  });

  it('muere, queda tendido, se hunde y se retira', () => {
    const { make, step } = setup();
    const z = make(0, 20);
    expect(z.damage(9999, 'head').killed).toBe(true);
    expect(z.alive).toBe(false);
    expect(z.damage(10).killed).toBe(false); // ya muerto
    step(2);
    expect(z.removable).toBe(false);
    step(1.2);
    expect(z.removable).toBe(true);
  });

  it('el reptante tiene las hitboxes cerca del suelo y el corredor la cabeza más baja', () => {
    const { make } = setup();
    const top = (z) => Math.max(...z.hitMeshes.map((m) => m.position.y + m.scale.y / 2));
    expect(top(make(0, 5, 'crawler'))).toBeLessThan(0.7);
    const runner = make(2, 5, 'runner');
    const walker = make(4, 5, 'walker');
    const head = (z) => z.hitMeshes.find((m) => m.userData.part === 'head').position.y;
    expect(head(runner)).toBeLessThan(head(walker));
    for (const m of walker.hitMeshes) expect(m.userData.bot).toBe(walker);
  });
});
