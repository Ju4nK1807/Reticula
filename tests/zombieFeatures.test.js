import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ZombieMap } from '../src/modes/zombies/ZombieMap.js';
import { ZombieRun } from '../src/modes/zombies/ZombieRun.js';
import { Zombie } from '../src/modes/zombies/Zombie.js';
import { Weapon } from '../src/combat/Weapon.js';
import { WEAPONS } from '../src/combat/weapons.js';
import { BOX_PRICE, FORGE, PERKS, RESERVE, waveConfig, zombieStats } from '../src/modes/zombies/zombieData.js';

const world = new ZombieMap();
const noop = () => {};

function makeRun() {
  const game = {
    world,
    player: { position: new THREE.Vector3(0, 0, 16), eye: new THREE.Vector3(0, 1.6, 16), perkSpeed: 1 },
    hud: { setHealth: noop, damage: noop, hitmarker: noop, flash: noop },
    sfx: { hurt: noop, headshot: noop, hit: noop, kill: noop, meleeHit: noop, draw: noop, reloadEnd: noop },
    effects: { burst: noop },
    viewmodel: { setWeapon: noop, startDraw: noop, cancelReload: noop, startReload: noop },
    angleTo: () => 0,
    panFor: () => 0,
  };
  game.weapon = new Weapon(game);
  game.weapon.reserveBy = Object.fromEntries(Object.entries(RESERVE).map(([id, n]) => [id, n === null ? null : 0]));
  const events = [];
  const mode = { game, root: new THREE.Group(), difficulty: 'normal', variant: 'survival' };
  const run = new ZombieRun(mode);
  run.listener = (type, data) => events.push([type, data]);
  return { run, game, events };
}
const find = (kind, id) => world.interactables.find((x) => x.kind === kind && (id === undefined || x.id === id));

describe('electricidad', () => {
  it('la palanca enciende la luz gratis; después ya no se ofrece', () => {
    world.setPower(false);
    const { run, events } = makeRun();
    const lever = find('power');
    expect(run.offer(lever)).toMatchObject({ price: 0 });
    expect(run.buy(lever)).toBeNull();
    expect(world.powered).toBe(true);
    expect(events.some(([t]) => t === 'power')).toBe(true);
    expect(run.offer(lever)).toBeNull();
    world.setPower(false);
  });

  it('sin luz no se pueden tomar bebidas (salvo Segundo Aire); con luz, sí', () => {
    world.setPower(false);
    const { run } = makeRun();
    run.cash = 99999;
    expect(run.offer(find('perk', 'coraza')).done).toBe(true);
    expect(run.buy(find('perk', 'coraza'))).toBe('Sin electricidad');
    expect(run.perks.has('coraza')).toBe(false);
    expect(run.offer(find('perk', 'aire'))).toMatchObject({ price: PERKS.aire.price });
    world.setPower(true);
    expect(run.buy(find('perk', 'coraza'))).toBeNull();
    expect(run.perks.has('coraza')).toBe(true);
    world.setPower(false);
  });
});

describe('Forja', () => {
  it('sin luz está apagada; con luz forja el arma en la mano una sola vez', () => {
    world.setPower(false);
    const { run, game, events } = makeRun();
    run.giveWeapon('rifle');
    run.cash = FORGE.price + 100;
    const forge = find('forge');
    expect(run.offer(forge).done).toBe(true);
    world.setPower(true);
    expect(run.offer(forge)).toMatchObject({ price: FORGE.price });
    expect(run.buy(forge)).toBeNull();
    expect(run.cash).toBe(100);
    expect(run.upgraded.has('rifle')).toBe(true);
    expect(events.some(([t, d]) => t === 'forge' && d.id === 'rifle')).toBe(true);
    expect(game.weapon.magazine).toBe(Math.round(WEAPONS.rifle.magazine * FORGE.magazine));
    expect(game.weapon.ammo).toBe(game.weapon.magazine);
    expect(game.weapon.reserveBy.rifle).toBe(Math.round(RESERVE.rifle * FORGE.reserve));
    expect(run.offer(forge).done).toBe(true);
    world.setPower(false);
  });

  it('un arma forjada hace el doble de daño', () => {
    world.setPower(true);
    const { run, game } = makeRun();
    run.giveWeapon('rifle');
    run.startWave(30);
    const shot = (forged) => {
      if (forged) run.upgraded.add('rifle');
      else run.upgraded.delete('rifle');
      const z = new Zombie(run, zombieStats('walker', waveConfig(30)), new THREE.Vector3(0, 0, 5));
      run.bots.push(z);
      const before = z.hp;
      run.handleShot({ bot: z, part: 'body', point: new THREE.Vector3(0, 1.2, 5) });
      return before - z.hp;
    };
    const normal = shot(false);
    expect(normal).toBeGreaterThan(0);
    expect(shot(true)).toBeCloseTo(normal * FORGE.damage, 5);
    expect(game.weapon.stats.id).toBe('rifle');
    world.setPower(false);
  });
});

describe('caja fuerte', () => {
  it('empieza cerrada: pide el código (sin cobrar) y con el código equivocado se bloquea un rato', () => {
    const { run, events } = makeRun();
    run.cash = BOX_PRICE * 5;
    expect(run.safe.unlocked).toBe(false);
    expect(run.offer(world.box.it)).toMatchObject({ keypad: true, price: 0 });
    expect(run.buy(world.box.it)).toBe('keypad');
    expect(run.cash).toBe(BOX_PRICE * 5);
    const wrong = run.safe.code === '0000' ? '1111' : '0000';
    for (const d of wrong) run.safe.press(d);
    expect(run.submitSafeCode()).toBe('wrong');
    expect(events.some(([t]) => t === 'safeWrong')).toBe(true);
    expect(run.safe.unlocked).toBe(false);
    for (const d of run.safe.code) run.safe.press(d);
    expect(run.safe.entry).toBe('');
  });

  it('con el código queda abierta (luz verde) y da armas por puntos', () => {
    const { run, events } = makeRun();
    run.cash = BOX_PRICE * 5;
    for (const d of run.safe.code) run.safe.press(d);
    expect(run.submitSafeCode()).toBe('open');
    expect(events.some(([t]) => t === 'safeOpen')).toBe(true);
    expect(world.box.model.color).toBe('#3dff8a');
    expect(run.buy(world.box.it)).toBeNull();
    expect(run.cash).toBe(BOX_PRICE * 4);
    expect(events.some(([t]) => t === 'box')).toBe(true);
  });

  it('una partida nueva la vuelve a cerrar con otro código', () => {
    const a = makeRun().run;
    for (const d of a.safe.code) a.safe.press(d);
    a.submitSafeCode();
    const b = makeRun().run;
    expect(b.safe.unlocked).toBe(false);
    expect(world.box.model.color).toBe('#ff3030');
  });

  it('después de varias tiradas se muda a otro lugar (y la navegación lo sabe)', () => {
    world.moveBox(0);
    const { run, events } = makeRun();
    for (const d of run.safe.code) run.safe.press(d);
    run.submitSafeCode();
    run.cash = BOX_PRICE * 20;
    run.boxMoveAt = 2;
    const before = world.box.spot;
    const pos = world.box.it.pos.clone();
    run.buy(world.box.it);
    expect(world.box.spot).toBe(before);
    run.buy(world.box.it);
    expect(world.box.spot).not.toBe(before);
    expect(world.box.it.pos.distanceTo(pos)).toBeGreaterThan(5);
    expect(events.some(([t, d]) => t === 'boxMove' && typeof d.where === 'string')).toBe(true);
    expect(world.colliders.includes(world.box.collider)).toBe(true);
    world.moveBox(0);
  });
});

describe('El Jefe', () => {
  it('al morir suelta el código de la caja fuerte (y munición máxima)', () => {
    const { run, events } = makeRun();
    run.startWave(3);
    const boss = run.spawn('boss');
    expect(boss.heavy).toBe(true);
    expect(run.boss).toBe(boss);
    expect(events.some(([t]) => t === 'bossSpawn')).toBe(true);
    expect(run.safe.known).toBe(false);
    run.hitZombie(boss, boss.hp + 1, 'body');
    expect(run.safe.known).toBe(true);
    const ev = events.find(([t]) => t === 'bossKill');
    expect(ev?.[1].code).toBe(run.safe.code);
    expect(run.offer(world.box.it).label).toContain(run.safe.code);
    run.update(1 / 60);
    expect(run.boss).toBeNull();
  });

  it('es más grande y aguanta mucho más que un bruto', () => {
    const cfg = waveConfig(3);
    const boss = zombieStats('boss', cfg);
    const brute = zombieStats('brute', cfg);
    expect(boss.height).toBeGreaterThan(brute.height);
    expect(boss.hp).toBeGreaterThan(brute.hp * 3);
  });
});

describe('Último Aliento', () => {
  it('al caer te levanta una vez con toda la vida y se gasta', () => {
    const { run, events } = makeRun();
    run.perks.add('aliento');
    run.applyPerks();
    run.takeDamage(run.maxHealth * 5, new THREE.Vector3());
    expect(run.died).toBe(false);
    expect(run.health).toBe(run.maxHealth);
    expect(run.perks.has('aliento')).toBe(false);
    expect(events.some(([t]) => t === 'lastStand')).toBe(true);
    run.takeDamage(run.maxHealth * 5, new THREE.Vector3());
    expect(run.died).toBe(true);
  });
});

describe('zombis sin piernas', () => {
  it('una explosión puede dejarlo sin piernas: sigue vivo, más lento y a ras del suelo', () => {
    const { run } = makeRun();
    run.startWave(5);
    const z = new Zombie(run, zombieStats('walker', waveConfig(5)), new THREE.Vector3(0, 0, 5));
    expect(z.loseLegs()).toBe(true);
    expect(z.alive).toBe(true);
    expect(z.stats.low).toBe(true);
    expect(z.stats.speed).toBeLessThan(1);
    expect(Math.max(...z.hitMeshes.map((m) => m.position.y))).toBeLessThan(0.6);
    expect(z.animKey()).toBe('drag');
    expect(z.loseLegs()).toBe(false);
    const brute = new Zombie(run, zombieStats('brute', waveConfig(5)), new THREE.Vector3(2, 0, 5));
    expect(brute.loseLegs()).toBe(false);
  });
});

describe('armas: límite de 3, cambio al comprar y arma especial', () => {
  it('se cargan hasta 3 armas; con las manos llenas, comprar cambia la de la mano (en su espacio)', () => {
    const { run, game, events } = makeRun();
    run.cash = 99999;
    game.weapon.setWeapon('pistol', { force: true });
    expect(run.slots).toEqual(['pistol']);
    expect(run.buy(find('wallbuy', 'smg'))).toBeNull();
    expect(run.buy(find('wallbuy', 'shotgun'))).toBeNull();
    expect(run.slots).toEqual(['pistol', 'smg', 'shotgun']);
    expect(run.offer(find('wallbuy', 'rifle')).label).toContain('cambia tu Escopeta');
    expect(run.buy(find('wallbuy', 'rifle'))).toBeNull();
    expect(run.slots).toEqual(['pistol', 'smg', 'rifle']);
    expect(run.owned.has('shotgun')).toBe(false);
    expect(game.weapon.id).toBe('rifle');
    expect(events.at(-1)).toEqual(['weapon', { id: 'rifle', dropped: 'shotgun' }]);
    game.weapon.setWeapon('pistol', { force: true });
    run.giveWeapon('ray');
    expect(run.slots).toEqual(['ray', 'smg', 'rifle']);
    expect(run.owned.size).toBe(3);
  });

  it('cada arma tiene su precio, cargador, cadencia, daño y recarga; el Desintegrador es especial', async () => {
    const { WALL_BUYS, rollBox } = await import('../src/modes/zombies/zombieData.js');
    const ids = Object.keys(WALL_BUYS);
    expect(ids.length).toBeGreaterThanOrEqual(6);
    expect(new Set(ids.map((id) => WALL_BUYS[id])).size).toBe(ids.length);
    for (const k of ['magazine', 'rps', 'reloadTime']) expect(new Set(ids.map((id) => WEAPONS[id][k])).size, k).toBeGreaterThan(ids.length / 2);
    expect(WEAPONS.ray.special).toBe(true);
    expect(RESERVE.ray).toBeGreaterThan(0);
    let rays = 0;
    let s = 1;
    const rng = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    for (let i = 0; i < 2000; i++) if (rollBox(new Set(['pistol']), rng) === 'ray') rays++;
    expect(rays).toBeGreaterThan(0);
    expect(rays / 2000).toBeLessThan(1 / 9);
  });
});
