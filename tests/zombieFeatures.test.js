// Electricidad, bebidas, Forja, caja misteriosa que se muda y Último Aliento, con la partida real
// (ZombieRun) sobre el mapa real y el arma real (sin navegador: los modelos no se cargan).
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
    expect(run.buy(find('perk', 'coraza'))).toBe('Sin electricidad'); // no se puede usar (no cobra)
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
    // Cargador y reserva más grandes.
    expect(game.weapon.magazine).toBe(Math.round(WEAPONS.rifle.magazine * FORGE.magazine));
    expect(game.weapon.ammo).toBe(game.weapon.magazine);
    expect(game.weapon.reserveBy.rifle).toBe(Math.round(RESERVE.rifle * FORGE.reserve));
    expect(run.offer(forge).done).toBe(true); // ya forjada
    world.setPower(false);
  });

  it('un arma forjada hace el doble de daño', () => {
    world.setPower(true);
    const { run, game } = makeRun();
    run.giveWeapon('rifle');
    run.startWave(30); // mucha vida: ninguno de los dos tiros mata
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

describe('caja misteriosa', () => {
  it('después de varias tiradas se muda a otro lugar (y la navegación lo sabe)', () => {
    world.moveBox(0);
    const { run, events } = makeRun();
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
    expect(z.loseLegs()).toBe(false); // solo una vez
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
    // Con la escopeta en la mano, el rifle la reemplaza (y se avisa).
    expect(run.offer(find('wallbuy', 'rifle')).label).toContain('cambia tu Escopeta');
    expect(run.buy(find('wallbuy', 'rifle'))).toBeNull();
    expect(run.slots).toEqual(['pistol', 'smg', 'rifle']);
    expect(run.owned.has('shotgun')).toBe(false);
    expect(game.weapon.id).toBe('rifle');
    expect(events.at(-1)).toEqual(['weapon', { id: 'rifle', dropped: 'shotgun' }]);
    // Con la pistola en la mano, la caja cambia la pistola.
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
    // La caja da el arma especial, pero poco.
    let rays = 0;
    let s = 1;
    const rng = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    for (let i = 0; i < 2000; i++) if (rollBox(new Set(['pistol']), rng) === 'ray') rays++;
    expect(rays).toBeGreaterThan(0);
    expect(rays / 2000).toBeLessThan(1 / 9);
  });
});
