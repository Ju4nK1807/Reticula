import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { GRENADE, Grenades, explosionDamage, stepGrenade } from '../src/combat/Grenades.js';

const DT = 1 / 60;
const BALL = 0.07; // radio de la granada (el mismo que Grenades.js)

// Igual que Grenades.update: subpasos de 0.2 m como máximo.
function simulate(pos, vel, seconds, colliders = []) {
  let bounces = 0;
  for (let t = 0; t < seconds; t += DT) {
    const steps = Math.max(1, Math.ceil((vel.length() * DT) / 0.2));
    for (let s = 0; s < steps; s++) if (stepGrenade(pos, vel, DT / steps, colliders)) bounces++;
  }
  return bounces;
}

function fakeGame({ allowed = true, count = 2, colliders = [] } = {}) {
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(0, 1.6, 0);
  camera.updateMatrixWorld();
  const calls = { explosions: [], sounds: [] };
  const mode = {
    grenades: count,
    grenadesAllowed: () => allowed,
    onExplosion: (point, radius, los) => calls.explosions.push({ point: point.clone(), radius, los }),
  };
  const game = {
    mode,
    playing: true,
    melee: { busy: false },
    engine: { camera },
    player: { velocity: new THREE.Vector3() },
    world: { colliders },
    sfx: { throwGrenade: () => calls.sounds.push('throw'), bounce: () => calls.sounds.push('bounce'), explosion: () => calls.sounds.push('boom') },
    viewmodel: { melee() {} },
    effects: { burst() {}, decal() {} },
    panFor: () => 0,
    ballistics: { lineOfSight: () => true },
  };
  const grenades = new Grenades(game);
  grenades.attach(new THREE.Scene());
  const step = (seconds) => {
    for (let t = 0; t < seconds; t += DT) grenades.update(DT);
  };
  return { game, grenades, calls, mode, step };
}

describe('física de la granada', () => {
  it('cae, rebota perdiendo fuerza y queda quieta sobre el suelo', () => {
    const pos = new THREE.Vector3(0, 1.5, 0);
    const vel = new THREE.Vector3(0, 3, -12);
    let minY = Infinity;
    let bounces = 0;
    for (let t = 0; t < 5; t += DT) {
      if (stepGrenade(pos, vel, DT)) bounces++;
      minY = Math.min(minY, pos.y);
    }
    expect(bounces).toBeGreaterThan(0);
    expect(minY).toBeGreaterThanOrEqual(BALL - 1e-9); // nunca se hunde en el suelo
    expect(pos.y).toBeCloseTo(BALL, 3);
    expect(vel.length()).toBeLessThan(0.05);
    expect(pos.z).toBeLessThan(-8); // avanzó en la dirección del lanzamiento
  });

  it('no atraviesa un muro fino aunque vaya rápido: rebota hacia atrás', () => {
    const wall = new THREE.Box3(new THREE.Vector3(3, 0, -2), new THREE.Vector3(3.15, 3, 2));
    const pos = new THREE.Vector3(0, 1.2, 0);
    const vel = new THREE.Vector3(GRENADE.speed, 0, 0);
    let maxX = -Infinity;
    for (let t = 0; t < 1; t += DT) {
      simulate(pos, vel, DT, [wall]);
      maxX = Math.max(maxX, pos.x);
    }
    expect(maxX).toBeLessThanOrEqual(3 - BALL + 1e-6);
    expect(vel.x).toBeLessThanOrEqual(0);
  });

  it('se apoya encima de una caja en vez de caer a través de ella', () => {
    const box = new THREE.Box3(new THREE.Vector3(-1, 0, -1), new THREE.Vector3(1, 0.8, 1));
    const pos = new THREE.Vector3(0, 2, 0);
    const vel = new THREE.Vector3(0, 0, 0);
    simulate(pos, vel, 3, [box]);
    expect(pos.y).toBeCloseTo(0.8 + BALL, 2);
  });

  it('el daño es máximo en el centro y baja en línea recta hasta el radio', () => {
    expect(explosionDamage(0)).toBe(GRENADE.damage);
    expect(explosionDamage(GRENADE.radius / 2)).toBe(Math.round(GRENADE.damage / 2));
    expect(explosionDamage(GRENADE.radius)).toBe(0);
    expect(explosionDamage(GRENADE.radius * 3)).toBe(0);
    expect(explosionDamage(1)).toBeGreaterThan(explosionDamage(2));
  });
});

describe('lanzar granadas', () => {
  it('solo donde el modo las da, gastando una por lanzamiento y con espera entre lanzamientos', () => {
    const { grenades, mode, calls, step } = fakeGame({ count: 2 });
    expect(grenades.throw()).toBe(true);
    expect(mode.grenades).toBe(1);
    expect(grenades.throw()).toBe(false); // todavía en espera
    step(GRENADE.cooldown + 0.05);
    expect(grenades.throw()).toBe(true);
    expect(mode.grenades).toBe(0);
    step(GRENADE.cooldown + 0.05);
    expect(grenades.throw()).toBe(false); // sin granadas
    expect(calls.sounds.filter((s) => s === 'throw')).toHaveLength(2);

    const closed = fakeGame({ allowed: false });
    expect(closed.grenades.throw()).toBe(false);
    expect(closed.mode.grenades).toBe(2);
  });

  it('no se lanza en medio de un golpe cuerpo a cuerpo', () => {
    const { game, grenades, mode } = fakeGame();
    game.melee.busy = true;
    expect(grenades.throw()).toBe(false);
    expect(mode.grenades).toBe(2);
  });

  it('explota al acabar la mecha, delante del jugador, y avisa al modo con el radio', () => {
    const { grenades, calls, step } = fakeGame();
    grenades.throw();
    step(GRENADE.fuse - 0.1);
    expect(calls.explosions).toHaveLength(0);
    for (let i = 0; i < 30 && !calls.explosions.length; i++) grenades.update(DT);
    expect(calls.explosions).toHaveLength(1);
    const { point, radius, los } = calls.explosions[0];
    expect(radius).toBe(GRENADE.radius);
    expect(point.z).toBeLessThan(-6); // la cámara mira hacia -z
    expect(typeof los).toBe('function');
    expect(los(new THREE.Vector3(0, 1, 0))).toBe(true);
    expect(calls.sounds).toContain('boom');
    expect(grenades.active).toHaveLength(0);
    expect(grenades.shake).toBeGreaterThan(0); // cerca: sacude la cámara
  });

  it('el destello se apaga solo y clear() lo limpia todo', () => {
    const { grenades, step } = fakeGame();
    grenades.throw();
    step(GRENADE.fuse + 0.05);
    expect(grenades.blasts).toHaveLength(1);
    step(0.5);
    expect(grenades.blasts).toHaveLength(0);

    grenades.throw();
    grenades.clear();
    expect(grenades.active).toHaveLength(0);
    expect(grenades.root.children).toHaveLength(0);
    expect(grenades.shake).toBe(0);
  });
});
