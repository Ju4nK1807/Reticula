// Ataques especiales del Jefe (bossBrain.js + ZombieRun.bossAction), texturas de las armas y el tope de
// zombis a la vez. Con la partida real sobre el mapa real (sin navegador: los modelos no se cargan).
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ZombieMap } from '../src/modes/zombies/ZombieMap.js';
import { ZombieRun } from '../src/modes/zombies/ZombieRun.js';
import { Weapon } from '../src/combat/Weapon.js';
import { BOSS, BossBrain } from '../src/modes/zombies/bossBrain.js';
import { RESERVE, waveConfig, zombieStats, ZOMBIE_TYPES } from '../src/modes/zombies/zombieData.js';
import { ALIVE_BY_DETAIL, ROUNDS } from '../src/modes/zombies/roundConfig.js';
import { boxProjectUV, fitWeaponModel } from '../src/combat/weaponModels.js';

const world = new ZombieMap();
const noop = () => {};

function makeRun() {
  const game = {
    world,
    player: { position: new THREE.Vector3(0, 0, 16), eye: new THREE.Vector3(0, 1.6, 16), perkSpeed: 1, velocity: new THREE.Vector3(), onGround: true },
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
  run.startWave(3);
  return { run, game, events };
}

// Jefe de mentira para probar el cerebro solo (sin mapa): se mueve libre salvo que `wall` lo frene.
function fakeBoss({ wall = false } = {}) {
  const actions = [];
  const z = {
    hp: 1000,
    maxHp: 1000,
    state: 'chase',
    riseT: 0,
    scale: 1.4,
    yaw: 0,
    stats: { speed: 1.5, attackEvery: 1.7, attackRange: 1.95 },
    position: new THREE.Vector3(0, 0, 0),
    run: { bossAction: (kind, _z, data) => actions.push([kind, data]), nav: null },
    collideWorld() {
      if (wall && this.position.z > 3) this.position.z = 3;
    },
    holdAtBarricade: noop,
    turnTowards(a) {
      this.yaw = a;
    },
  };
  z.brain = new BossBrain(z);
  return { z, actions };
}

function stepBrain(z, player, seconds) {
  const dt = 1 / 60;
  for (let t = 0; t < seconds; t += dt) {
    const dx = player.x - z.position.x;
    const dz = player.z - z.position.z;
    z.brain.update(dt, { colliders: [] }, Math.hypot(dx, dz), dx, dz);
  }
}

describe('El Jefe: más vida y sin barra en pantalla', () => {
  it('aguanta 30 veces la vida de un caminante de su ronda', () => {
    const cfg = waveConfig(3);
    expect(ZOMBIE_TYPES.boss.hpScale).toBe(30);
    expect(zombieStats('boss', cfg).hp).toBeGreaterThanOrEqual(zombieStats('walker', cfg).hp * 29);
  });
});

describe('El Jefe: embestida', () => {
  it('ruge, carga en línea recta y, si te alcanza, te golpea', () => {
    const { z, actions } = fakeBoss();
    z.brain.chargeCd = 0;
    z.brain.slamCd = 99;
    const player = new THREE.Vector3(0, 0, 12);
    stepBrain(z, player, 0.05);
    expect(z.brain.state).toBe('chargeWind');
    expect(actions[0][0]).toBe('chargeWind');
    stepBrain(z, player, BOSS.charge.windup + 0.05);
    expect(z.brain.state === 'charge' || actions.some(([k]) => k === 'chargeHit')).toBe(true);
    stepBrain(z, player, 1.5);
    expect(actions.some(([k]) => k === 'chargeHit')).toBe(true);
    expect(z.position.z).toBeGreaterThan(8); // recorrió la distancia a toda velocidad
    expect(z.brain.state).toBe('idle');
  });

  it('si choca contra una pared queda aturdido', () => {
    const { z, actions } = fakeBoss({ wall: true });
    z.brain.chargeCd = 0;
    z.brain.slamCd = 99;
    const player = new THREE.Vector3(0, 0, 14);
    stepBrain(z, player, BOSS.charge.windup + 0.6);
    expect(actions.some(([k]) => k === 'crash')).toBe(true);
    expect(z.brain.state).toBe('dazed');
    stepBrain(z, player, BOSS.charge.dazed + 0.1);
    expect(z.brain.state).not.toBe('dazed');
  });

  it('el golpe de la embestida duele más que un zarpazo y te lanza', () => {
    const { run, game } = makeRun();
    const boss = run.spawn('boss');
    run.bossAction('chargeHit', boss, { dir: { x: 0, z: 1 } });
    expect(run.maxHealth - run.health).toBeGreaterThan(boss.stats.damage);
    expect(game.player.velocity.z).toBeGreaterThan(5);
    expect(game.player.onGround).toBe(false);
  });
});

describe('El Jefe: pisotón', () => {
  it('cerca: prepara el golpe y la onda daña y empuja hacia afuera', () => {
    const { z, actions } = fakeBoss();
    z.brain.slamCd = 0;
    z.brain.chargeCd = 99;
    stepBrain(z, new THREE.Vector3(0, 0, 2.5), BOSS.slam.windup + 0.1);
    expect(actions.map(([k]) => k)).toEqual(['slamWind', 'slam']);

    const { run, game } = makeRun();
    const boss = run.spawn('boss');
    boss.group.position.set(game.player.position.x, 0, game.player.position.z - 2);
    run.bossAction('slam', boss, { radius: BOSS.slam.radius });
    expect(run.health).toBeLessThan(run.maxHealth);
    expect(game.player.velocity.z).toBeGreaterThan(2); // lejos del Jefe
  });

  it('saltando a tiempo (o lejos) no te pasa nada', () => {
    const { run, game } = makeRun();
    const boss = run.spawn('boss');
    boss.group.position.set(game.player.position.x, 0, game.player.position.z - 2);
    game.player.onGround = false;
    game.player.position.y = 0.8;
    run.bossAction('slam', boss, { radius: BOSS.slam.radius });
    expect(run.health).toBe(run.maxHealth);
    game.player.onGround = true;
    game.player.position.y = 0;
    boss.group.position.set(game.player.position.x, 0, game.player.position.z - BOSS.slam.radius - 1);
    run.bossAction('slam', boss, { radius: BOSS.slam.radius });
    expect(run.health).toBe(run.maxHealth);
  });
});

describe('El Jefe: llamado y furia', () => {
  it('a 2/3 de su vida llama corredores que salen de la tierra a su alrededor', () => {
    const { z, actions } = fakeBoss();
    z.hp = z.maxHp * 0.6;
    stepBrain(z, new THREE.Vector3(0, 0, 10), BOSS.summon.roar + 0.1);
    expect(actions.filter(([k]) => k === 'summon')).toHaveLength(1);
    expect(z.brain.summoned).toBe(1);

    const { run, events } = makeRun();
    const boss = run.spawn('boss');
    boss.group.position.copy(run.game.player.position).add(new THREE.Vector3(0, 0, -4));
    const before = run.bots.length;
    run.bossAction('summon', boss, { type: 'runner', count: BOSS.summon.count });
    const added = run.bots.slice(before);
    expect(added.length).toBeGreaterThan(0);
    expect(added.every((m) => m.type === 'runner' && m.riseT > 0)).toBe(true);
    expect(events.find(([t, d]) => t === 'boss' && d.kind === 'summon')?.[1].spawned).toBe(added.length);
  });

  it('con poca vida se enfurece: más rápido y pega más seguido', () => {
    const { z, actions } = fakeBoss();
    z.brain.summoned = BOSS.summon.at.length;
    z.hp = z.maxHp * 0.2;
    stepBrain(z, new THREE.Vector3(0, 0, 30), 0.05);
    expect(actions.some(([k]) => k === 'enrage')).toBe(true);
    expect(z.stats.speed).toBeCloseTo(1.5 * BOSS.enrage.speed);
    expect(z.stats.attackEvery).toBeCloseTo(1.7 * BOSS.enrage.attackEvery);
  });

  it('el Jefe real lleva el cerebro y los demás zombis no', () => {
    const { run } = makeRun();
    expect(run.spawn('boss').brain).toBeInstanceOf(BossBrain);
    expect(run.spawn('walker').brain).toBeNull();
  });
});

describe('35 zombis a la vez', () => {
  it('el tope sube a 35 (en calidad alta)', () => {
    expect(ROUNDS.aliveMax).toBe(35);
    expect(ALIVE_BY_DETAIL.alta).toBe(35);
    expect(waveConfig(40).maxAlive).toBe(35);
  });
});

describe('armas con texturas reales', () => {
  it('las UVs de caja van en metros: una cara de 0.3 m ocupa una repetición', () => {
    const g = boxProjectUV(new THREE.BoxGeometry(0.3, 0.3, 0.3));
    expect(g.index).toBeNull();
    const uv = g.attributes.uv;
    expect(uv.count).toBe(g.attributes.position.count);
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < uv.count; i++) {
      min = Math.min(min, uv.getX(i));
      max = Math.max(max, uv.getX(i));
    }
    expect(max - min).toBeCloseTo(1, 5);
  });

  it('cada pieza lleva textura (color, relieve y ARM) y las miras siguen brillando', () => {
    const root = new THREE.Group();
    const parts = ['M_PCL_Flat_Black', 'M_PCL_Flat_Grey_Darker', 'M_PCL_Flat_Brown.Chestnut', 'M_PCL_Flat_White'].map((name) => {
      const mat = new THREE.MeshStandardMaterial();
      mat.name = name;
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.4), mat);
      root.add(m);
      return m;
    });
    fitWeaponModel(root, { scale: 1, back: 0, top: 0, finish: 'shotgun' });
    const [frame, metal, wood, sights] = parts.map((m) => m.material);
    for (const m of [frame, metal, wood]) {
      expect(m.map).toBeTruthy();
      expect(m.normalMap).toBeTruthy();
      expect(m.roughnessMap).toBeTruthy();
      expect(m.metalnessMap).toBeNull(); // metalicidad del acabado, no de la textura
    }
    expect(wood.userData.surface).toBe('gun_wood'); // la escopeta tiene culata de nogal
    expect(metal.metalness).toBeGreaterThan(0.8);
    expect(parts.every((m) => m.geometry.attributes.uv)).toBe(true);
    expect(sights.map).toBeTruthy(); // detalles claros de la escopeta: sin brillo, con textura

    // Las miras de la pistola brillan (color plano con brillo propio, sin textura).
    const pistol = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.02), Object.assign(new THREE.MeshStandardMaterial(), { name: 'M_PCL_Flat_White' }));
    fitWeaponModel(new THREE.Group().add(pistol), { scale: 1, back: 0, top: 0, finish: 'pistol' });
    expect(pistol.material.map).toBeNull();
    expect(pistol.material.emissiveIntensity).toBeGreaterThan(1);
  });
});
