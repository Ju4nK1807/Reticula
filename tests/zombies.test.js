import { ROUNDS } from '../src/modes/zombies/roundConfig.js';
import { WEAPONS } from '../src/combat/weapons.js';
import { describe, expect, it } from 'vitest';
import { NavGrid } from '../src/modes/zombies/navGrid.js';
import {
  DROP,
  KNIFE_DAMAGE,
  roundHp,
  PERKS,
  PLAYER,
  POWERUPS,
  RESERVE,
  SHOP,
  WALL_BUYS,
  perkStats,
  wallAmmoPrice,
  ZOMBIE_TYPES,
  cannotBuy,
  emptyRecord,
  pointsFor,
  rollDrop,
  updateRecord,
  waveConfig,
  waveRoster,
  zombieStats,
} from '../src/modes/zombies/zombieData.js';

const box = (minX, maxX, minZ, maxZ) => ({ min: { x: minX, y: 0, z: minZ }, max: { x: maxX, y: 3, z: maxZ } });
const seq = (...values) => {
  let i = 0;
  return () => values[i++ % values.length];
};

describe('oleadas zombi', () => {
  it('cada ronda trae más zombis, más resistentes, más rápidos y que pegan más (con tope)', () => {
    let prev = waveConfig(1);
    for (let n = 2; n <= 30; n++) {
      const c = waveConfig(n);
      expect(c.count).toBeGreaterThan(prev.count);
      expect(c.hpMul).toBeGreaterThan(prev.hpMul);
      expect(c.speedMul).toBeGreaterThanOrEqual(prev.speedMul);
      expect(c.speedMul).toBeLessThanOrEqual(ROUNDS.speedMax);
      expect(c.damageMul).toBeGreaterThanOrEqual(prev.damageMul);
      expect(c.damageMul).toBeLessThanOrEqual(ROUNDS.damageMax);
      expect(c.maxAlive).toBeLessThanOrEqual(ROUNDS.aliveMax);
      prev = c;
    }
  });

  it('ronda 1: 5-6 zombis lentos que mueren de 1-2 disparos de pistola', () => {
    const c = waveConfig(1);
    expect(c.count).toBeGreaterThanOrEqual(5);
    expect(c.count).toBeLessThanOrEqual(6);
    expect(new Set(waveRoster(c))).toEqual(new Set(['walker']));
    const z = zombieStats('walker', c);
    expect(z.speed).toBeLessThan(ZOMBIE_TYPES.walker.speed);
    const p = WEAPONS.pistol.damage;
    expect(Math.ceil(z.hp / p.body)).toBeLessThanOrEqual(2);
    expect(Math.ceil(z.hp / p.head)).toBe(1);
  });

  it('las fórmulas salen de roundConfig.js (cantidad = base + ronda × factor; vida = base × (1 + k × ronda))', () => {
    const R = ROUNDS;
    for (const r of [1, 5, 9]) {
      expect(waveConfig(r).count).toBe(Math.round(R.countBase + R.countPerRound * r + R.countCurve * r * r));
      expect(roundHp(r)).toBe(Math.round(R.hpBase * (1 + R.hpPerRound * (r - 1))));
    }
    expect(roundHp(R.hpLateFrom + 2)).toBe(Math.round(R.hpBase * (1 + R.hpPerRound * (R.hpLateFrom + 1)) * R.hpLate ** 2));
  });

  it('las primeras oleadas solo traen caminantes; luego corredores, reptantes y brutos', () => {
    expect(new Set(waveRoster(waveConfig(1)))).toEqual(new Set(['walker']));
    expect(new Set(waveRoster(waveConfig(2)))).toEqual(new Set(['walker']));
    const w8 = waveRoster(waveConfig(8), seq(0.01, 0.5, 0.95, 0.3));
    expect(w8).toContain('runner');
    expect(w8).toContain('brute');
    expect(waveRoster(waveConfig(8)).filter((t) => t === 'brute')).toHaveLength(waveConfig(8).brutes);
  });

  it('el reparto respeta el total y los brutos van en la segunda mitad', () => {
    for (const n of [5, 9, 14, 20]) {
      const cfg = waveConfig(n);
      const roster = waveRoster(cfg);
      expect(roster).toHaveLength(cfg.count);
      roster.forEach((t, i) => {
        if (t === 'brute') expect(i).toBeGreaterThanOrEqual(Math.floor(roster.length * 0.45));
      });
    }
  });

  it('cada 6 oleadas hay noche de corredores', () => {
    expect(waveConfig(6).runnerNight).toBe(true);
    expect(waveConfig(6).runnerShare).toBeGreaterThan(0.6);
    expect(waveConfig(7).runnerNight).toBe(false);
  });

  it('las estadísticas escalan con la oleada; el bruto no acelera', () => {
    const w10 = waveConfig(10);
    expect(zombieStats('walker', w10).hp).toBe(roundHp(10));
    expect(zombieStats('brute', w10).hp).toBe(Math.round(roundHp(10) * ZOMBIE_TYPES.brute.hpScale));
    expect(zombieStats('walker', w10).speed).toBeCloseTo(ZOMBIE_TYPES.walker.speed * w10.speedMul);
    expect(zombieStats('brute', w10).speed).toBe(ZOMBIE_TYPES.brute.speed);
  });

  it('el cuchillo mata de 1 golpe en las primeras rondas y después hacen falta más', () => {
    expect(Math.ceil(zombieStats('walker', waveConfig(1)).hp / KNIFE_DAMAGE)).toBe(1);
    expect(Math.ceil(zombieStats('walker', waveConfig(15)).hp / KNIFE_DAMAGE)).toBeGreaterThan(1);
  });

  it('tres golpes de caminante tumban a un jugador sin bebidas; con Coraza aguanta más', () => {
    expect(Math.ceil(PLAYER.maxHealth / ZOMBIE_TYPES.walker.damage)).toBe(3);
    expect(Math.ceil(perkStats(new Set(['coraza'])).maxHealth / ZOMBIE_TYPES.walker.damage)).toBeGreaterThanOrEqual(6);
  });
});

describe('economía zombi', () => {
  it('puntos: más por la cabeza, por matar y por cuerpo a cuerpo; el doble con doble puntos', () => {
    expect(pointsFor({ part: 'body', killed: false })).toBe(10);
    expect(pointsFor({ part: 'head', killed: false })).toBe(20);
    expect(pointsFor({ part: 'head', killed: true, type: 'walker' })).toBe(20 + ZOMBIE_TYPES.walker.points + 40);
    expect(pointsFor({ part: 'body', killed: true, type: 'brute', melee: true })).toBe(10 + 300 + 50);
    expect(pointsFor({ part: 'body', killed: false }, true)).toBe(20);
  });

  it('la armería explica por qué no se puede comprar algo', () => {
    const state = { points: 5000, owned: new Set(['pistol']), perks: new Set(['coraza']), bag: { frag: PLAYER.maxGrenades, fire: 0, stun: 4, decoy: 0 }, health: 100, maxHealth: 100, reserveFull: true };
    const item = (id) => SHOP.find((s) => s.id === id);
    expect(cannotBuy(item('frag'), state)).toBe('Al máximo');
    expect(cannotBuy(item('stun'), state)).toBe('Al máximo');
    expect(cannotBuy(item('medkit'), state)).toBe('Vida completa');
    expect(cannotBuy(item('ammo'), state)).toBe('Reserva llena');
    expect(cannotBuy(item('fire'), state)).toBeNull();
    expect(cannotBuy(item('decoy'), { ...state, points: 100 })).toBe('Faltan puntos');
    expect(cannotBuy({ kind: 'perk', id: 'coraza', price: 2500 }, state)).toBe('Ya la tienes');
    // Las armas ya no están en la armería (se compran en las paredes del mapa).
    expect(SHOP.some((s) => s.kind === 'weapon')).toBe(false);
  });

  it('las bebidas cambian los valores del jugador y se combinan', () => {
    expect(perkStats(new Set())).toMatchObject({ maxHealth: PLAYER.maxHealth, damage: 1, rate: 1, reload: 1, speed: 1, regenDelay: PLAYER.regenDelay });
    const all = perkStats(new Set(Object.keys(PERKS)));
    expect(all.maxHealth).toBe(250);
    expect(all.damage).toBeGreaterThan(1);
    expect(all.rate).toBeGreaterThan(1);
    expect(all.reload).toBeLessThan(1);
    expect(all.speed).toBeGreaterThan(1);
    expect(all.regenDelay).toBeLessThan(PLAYER.regenDelay);
  });

  it('cada arma de la pared tiene precio, munición a mitad de precio y reserva', () => {
    for (const [id, price] of Object.entries(WALL_BUYS)) {
      expect(RESERVE[id], id).toBeGreaterThan(0);
      expect(wallAmmoPrice(id)).toBeLessThan(price);
      expect(wallAmmoPrice(id) % 50).toBe(0);
    }
  });

  it('los potenciadores respetan la probabilidad y el tiempo entre uno y otro', () => {
    expect(rollDrop(DROP.cooldown - 1, () => 0)).toBeNull();
    expect(rollDrop(DROP.cooldown + 1, () => 0.99)).toBeNull();
    const id = rollDrop(DROP.cooldown + 1, seq(0.01, 0.5));
    expect(Object.keys(POWERUPS)).toContain(id);
  });

  it('el récord guarda la mejor oleada y el historial', () => {
    const r = emptyRecord();
    expect(updateRecord(r, { wave: 5, score: 3000, kills: 40 })).toBe(true);
    expect(updateRecord(r, { wave: 3, score: 9000, kills: 20 })).toBe(false);
    expect(r.bestWave).toBe(5);
    expect(r.bestScore).toBe(9000);
    expect(r.totalRuns).toBe(2);
    expect(r.totalKills).toBe(60);
    expect(r.history).toHaveLength(2);
  });
});

describe('navegación de la horda (campo de flujo)', () => {
  // Zona de 20×20 con un muro en el medio (x = 9..11) que deja un hueco abajo (z > 16).
  const grid = () => new NavGrid({ minX: 0, maxX: 20, minZ: 0, maxZ: 20, cell: 1, radius: 0.6, colliders: [box(9, 11, 0, 16)] });

  it('bloquea las celdas del muro (con el radio del zombi) y deja libre el hueco', () => {
    const g = grid();
    expect(g.blocked[g.index(10, 5)]).toBe(1);
    expect(g.blocked[g.index(8.7, 5)]).toBe(1); // dentro del radio
    expect(g.blocked[g.index(10, 18)]).toBe(0);
  });

  it('desde el otro lado del muro, el camino lo rodea por el hueco', () => {
    const g = grid();
    g.build(17, 5); // jugador a la derecha del muro
    const out = { x: 0, z: 0 };
    expect(g.direction(3, 5, out)).toBe(true);
    expect(out.z).toBeGreaterThan(0.5); // primero baja hacia el hueco (z grande)
    // La distancia por el campo es mayor que la recta (14 m).
    expect(g.pathDistance(3, 5)).toBeGreaterThan(20);
    // Al pasar el hueco ya va hacia el jugador.
    g.direction(13, 18, out);
    expect(out.z).toBeLessThan(0);
  });

  it('en campo abierto va derecho hacia el jugador', () => {
    const g = new NavGrid({ minX: 0, maxX: 20, minZ: 0, maxZ: 20 });
    g.build(15.5, 10.5);
    const out = { x: 0, z: 0 };
    g.direction(2.5, 10.5, out);
    expect(out.x).toBeGreaterThan(0.99);
  });

  it('sin camino posible (zona cerrada) devuelve false y el zombi va directo', () => {
    const g = new NavGrid({ minX: 0, maxX: 20, minZ: 0, maxZ: 20, colliders: [box(9, 11, -1, 21)] });
    g.build(17, 10);
    expect(g.direction(3, 10, { x: 0, z: 0 })).toBe(false);
  });

  it('línea despejada: detecta el muro y el camino libre por el hueco', () => {
    const g = grid();
    expect(g.clearLine(3, 5, 17, 5)).toBe(false); // cruza el muro
    expect(g.clearLine(3, 18, 17, 18)).toBe(true); // por el hueco de abajo
    expect(g.clearLine(2, 2, 6, 14)).toBe(true); // del mismo lado
  });

  it('abrir una puerta (quitar su colisionador) desbloquea las celdas', () => {
    const door = box(9, 11, 16, 20);
    const g = new NavGrid({ minX: 0, maxX: 20, minZ: 0, maxZ: 20, cell: 1, radius: 0.6, colliders: [box(9, 11, 0, 16), door] });
    g.build(17, 5);
    expect(g.direction(3, 5, { x: 0, z: 0 })).toBe(false); // cerrado del todo
    g.setColliders([box(9, 11, 0, 16)]);
    g.build(17, 5);
    expect(g.direction(3, 5, { x: 0, z: 0 })).toBe(true);
  });

  it('un jugador encima de un obstáculo usa la celda libre más cercana', () => {
    const g = grid();
    expect(g.build(10, 5)).toBe(true);
    expect(g.direction(3, 5, { x: 0, z: 0 })).toBe(true);
  });
});
