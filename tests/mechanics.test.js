import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Weapon } from '../src/combat/Weapon.js';
import { MELEE, Melee } from '../src/combat/Melee.js';
import { WEAPONS, WEAPON_ORDER } from '../src/combat/weapons.js';
import { DEFAULT_SETTINGS } from '../src/config/defaults.js';

function fakeGame({ moving = 0, cast = () => null, mode = {} } = {}) {
  const camera = new THREE.PerspectiveCamera();
  camera.updateMatrixWorld();
  const calls = { melee: [], sounds: [] };
  const game = {
    settings: structuredClone(DEFAULT_SETTINGS),
    engine: { camera },
    player: { inaccuracy: moving },
    input: { mouseDown: false },
    playing: true,
    mode: { hitMeshes: () => [], meleeAllowed: () => true, onMeleeHit: (hit, dmg) => calls.melee.push({ hit, dmg }), ...mode },
    ballistics: { cast: (origin, dir, targets, far) => cast(dir.clone(), far) },
    effects: { tracer() {}, burst() {}, decal() {} },
    sfx: { shot() {}, dryFire() {}, reloadStart() {}, reloadEnd() {}, draw() {}, swing: () => calls.sounds.push('swing'), meleeHit: () => calls.sounds.push('hit') },
    viewmodel: { setWeapon() {}, startDraw() {}, startReload() {}, cancelReload() {}, kick() {}, melee() {} },
    hud: { flash() {} },
  };
  const weapon = new Weapon(game);
  weapon.enabled = true;
  game.weapon = weapon;
  game.melee = new Melee(game);
  return { game, weapon, calls };
}

describe('apuntar con las miras (ADS)', () => {
  it('cada arma tiene mira telescópica o miras de hierro, nunca las dos', () => {
    for (const id of WEAPON_ORDER) {
      const w = WEAPONS[id];
      expect(!!w.zoom !== !!w.ads, id).toBe(true);
      if (w.ads) {
        expect(w.ads.zoom).toBeGreaterThan(1.05);
        expect(w.ads.zoom).toBeLessThan(1.6);
        expect(w.ads.spread).toBeLessThan(1);
        expect(w.ads.speed).toBeLessThan(1);
      }
    }
  });

  it('apuntando, la ráfaga y el movimiento desvían menos', () => {
    const { weapon } = fakeGame({ moving: 1 });
    weapon.setWeapon('rifle', { force: true });
    weapon.bloom = 2;
    const hip = weapon.currentSpread();
    weapon.aiming = true;
    expect(weapon.currentSpread()).toBeCloseTo(hip * WEAPONS.rifle.ads.spread, 6);
  });

  it('la escopeta apuntando cierra también el cono de perdigones', () => {
    const dirs = [];
    const { weapon } = fakeGame({ cast: (d) => (dirs.push(d), null) });
    weapon.setWeapon('shotgun', { force: true });
    const spreadOf = () => {
      dirs.length = 0;
      weapon.drawLeft = 0;
      weapon.cooldown = 0;
      weapon.fire();
      return Math.max(...dirs.map((d) => d.angleTo(new THREE.Vector3(0, 0, -1))));
    };
    const samples = (n) => Array.from({ length: n }, spreadOf);
    const hip = Math.max(...samples(40));
    weapon.aiming = true;
    const aimed = Math.max(...samples(40));
    expect(aimed).toBeLessThan(hip);
  });

  it('sin apuntar el multiplicador es 1 (no cambia nada)', () => {
    const { weapon } = fakeGame();
    expect(weapon.aimFactor).toBe(1);
  });
});

describe('golpe cuerpo a cuerpo', () => {
  const bot = { alive: true };
  const near = (d) => (d.z < -0.9 ? { bot, part: 'body', distance: 1.2, point: new THREE.Vector3(), normal: new THREE.Vector3() } : null);

  it('golpea al enemigo de enfrente en el momento del impacto, no al pulsar', () => {
    const { game, calls } = fakeGame({ cast: near });
    expect(game.melee.trigger()).toBe(true);
    expect(calls.melee).toHaveLength(0);
    game.melee.update(MELEE.hitAt + 0.01);
    expect(calls.melee).toHaveLength(1);
    expect(calls.melee[0].dmg).toBe(MELEE.damage);
    expect(calls.sounds).toEqual(['swing', 'hit']);
  });

  it('el abanico alcanza enemigos algo descentrados y respeta el alcance', () => {
    const offCenter = (d) => (d.x > 0.15 ? { bot, part: 'body', distance: 1.5, point: new THREE.Vector3(), normal: new THREE.Vector3() } : null);
    const { game, calls } = fakeGame({ cast: offCenter });
    game.melee.trigger();
    game.melee.update(0.2);
    expect(calls.melee).toHaveLength(1);
    // El alcance se pasa al raycast (no golpea a 10 m).
    const fars = [];
    const g2 = fakeGame({ cast: (d, far) => (fars.push(far), null) }).game;
    g2.melee.trigger();
    g2.melee.update(0.2);
    expect(Math.max(...fars)).toBe(MELEE.range);
  });

  it('bloquea el disparo mientras dura y tiene un tiempo de espera', () => {
    const { game } = fakeGame();
    game.melee.trigger();
    expect(game.melee.busy).toBe(true);
    expect(game.melee.trigger()).toBe(false);
    game.melee.update(MELEE.duration + 0.01);
    expect(game.melee.busy).toBe(false);
  });

  it('no funciona donde el modo no lo permite (evaluación)', () => {
    const { game } = fakeGame({ mode: { meleeAllowed: () => false } });
    expect(game.melee.trigger()).toBe(false);
  });
});

describe('munición de reserva', () => {
  // Saca el arma y espera a que termine de desenfundarla.
  const ready = (weapon, id) => {
    weapon.setWeapon(id, { force: true });
    weapon.update(weapon.stats.drawTime + 0.01);
  };
  const reload = (weapon) => {
    weapon.reload();
    weapon.update(weapon.stats.reloadTime * weapon.reloadMul + 0.01);
  };

  it('sin reserva administrada (todos los modos salvo el zombi) es infinita', () => {
    const { weapon } = fakeGame();
    ready(weapon, 'smg');
    expect(weapon.reserve).toBe(Infinity);
    weapon.ammo = 0;
    reload(weapon);
    expect(weapon.ammo).toBe(weapon.stats.magazine);
  });

  it('recargar toma las balas de la reserva; si no alcanzan, carga lo que queda', () => {
    const { weapon } = fakeGame();
    weapon.reserveBy = { smg: 40 };
    ready(weapon, 'smg');
    const mag = weapon.stats.magazine;
    weapon.ammo = mag - 25;
    reload(weapon);
    expect(weapon.ammo).toBe(mag);
    expect(weapon.reserve).toBe(15);
    weapon.ammo = 0;
    reload(weapon);
    expect(weapon.ammo).toBe(15);
    expect(weapon.reserve).toBe(0);
  });

  it('con la reserva vacía no recarga (tampoco sola al vaciar el cargador) y avisa', () => {
    const { game, weapon } = fakeGame();
    const flashes = [];
    game.hud.flash = (text) => flashes.push(text);
    game.settings.gameplay.autoReload = true;
    weapon.reserveBy = { smg: 0 };
    ready(weapon, 'smg');
    weapon.ammo = 0;
    weapon.reload();
    expect(weapon.reloading).toBe(false);
    weapon.tryFire(0);
    expect(weapon.reloading).toBe(false);
    expect(flashes).toHaveLength(2);
    for (const f of flashes) expect(f).toMatch(/munición/i);
  });

  it('cada arma tiene su reserva; un arma sin límite (la pistola del modo zombi) sigue infinita', () => {
    const { weapon } = fakeGame();
    weapon.reserveBy = { pistol: null, smg: 0, rifle: 90 };
    ready(weapon, 'pistol');
    expect(weapon.reserve).toBe(Infinity);
    ready(weapon, 'smg');
    expect(weapon.reserve).toBe(0);
    ready(weapon, 'rifle');
    expect(weapon.reserve).toBe(90);
  });

  it('la recarga rápida acorta el tiempo y la barra de progreso lo respeta', () => {
    const { weapon } = fakeGame();
    weapon.reloadMul = 0.65;
    ready(weapon, 'rifle');
    weapon.ammo = 0;
    weapon.reload();
    const total = weapon.stats.reloadTime * 0.65;
    weapon.update(total / 2);
    expect(weapon.reloadProgress).toBeCloseTo(0.5, 5);
    weapon.update(total / 2 + 0.01);
    expect(weapon.reloading).toBe(false);
    expect(weapon.ammo).toBe(weapon.stats.magazine);
  });
});
