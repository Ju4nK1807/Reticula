import { FIRST_COUNTDOWN, INTERMISSION, ROUNDS } from './roundConfig.js';

export const ZOMBIE_TYPES = {
  walker: { name: 'Caminante', height: 1.78, hpScale: 1, speed: 1.6, damage: 45, attackRange: 1.3, attackEvery: 1.35, points: 60, look: 'normal', bulk: 1 },
  runner: { name: 'Corredor', height: 1.74, hpScale: 0.7, speed: 4.1, damage: 34, attackRange: 1.25, attackEvery: 0.95, points: 80, look: 'runner', bulk: 0.94 },
  crawler: { name: 'Reptante', height: 1.78, hpScale: 0.6, speed: 2.2, damage: 38, attackRange: 1.15, attackEvery: 1.1, points: 90, low: true, look: 'normal', bulk: 0.96 },
  brute: { name: 'Bruto', height: 2.35, hpScale: 3, speed: 1.45, damage: 80, attackRange: 1.75, attackEvery: 1.8, points: 300, look: 'brute', bulk: 1.18, heavy: true },
  boss: { name: 'El Jefe', height: 2.6, hpScale: 30, speed: 1.55, damage: 90, attackRange: 1.95, attackEvery: 1.7, points: 1000, look: 'boss', bulk: 1.3, heavy: true, boss: true },
};

export function roundHp(n) {
  const r = Math.max(1, Math.floor(n));
  const R = ROUNDS;
  return Math.round(R.hpBase * (1 + R.hpPerRound * (r - 1)) * R.hpLate ** Math.max(0, r - R.hpLateFrom));
}

export const KNIFE_DAMAGE = 150;

export const PLAYER = {
  maxHealth: 100,
  regenDelay: 5,
  regenRate: 9,
  startPoints: 500,
  startGrenades: 2,
  maxGrenades: 6,
};

export const GRENADE_MAX = { frag: PLAYER.maxGrenades, fire: 4, stun: 4, decoy: 2 };

export const PERKS = {
  coraza: { name: 'Coraza', desc: 'Vida máxima 100 → 250: aguantas más del doble de golpes.', price: 2500, color: '#ff5a3d' },
  plomo: { name: 'Doble Plomo', desc: '+50 % de daño y +25 % de cadencia con todas las armas.', price: 2000, color: '#ffb020' },
  mano: { name: 'Mano Rápida', desc: 'Recargas el doble de rápido.', price: 3000, color: '#36d6ff' },
  pies: { name: 'Pies Ligeros', desc: 'Corres un 15 % más rápido.', price: 2000, color: '#8aff5a' },
  aire: { name: 'Segundo Aire', desc: 'Empiezas a recuperar vida a los 2.5 s (no a los 5) y el doble de rápido.', price: 1500, color: '#c86bff', power: false },
  aliento: { name: 'Último Aliento', desc: 'Si caes, te levantas una vez con toda la vida (luego hay que volver a beberla).', price: 1500, color: '#ffe14d' },
};
export const PERK_EFFECTS = {
  coraza: { maxHealth: 250 },
  plomo: { damage: 1.5, rate: 1.25 },
  mano: { reload: 0.5 },
  pies: { speed: 1.15 },
  aire: { regenDelay: 2.5, regenRate: 20 },
};

export function perkStats(perks) {
  const has = (id) => perks.has(id);
  return {
    maxHealth: has('coraza') ? PERK_EFFECTS.coraza.maxHealth : PLAYER.maxHealth,
    damage: has('plomo') ? PERK_EFFECTS.plomo.damage : 1,
    rate: has('plomo') ? PERK_EFFECTS.plomo.rate : 1,
    reload: has('mano') ? PERK_EFFECTS.mano.reload : 1,
    speed: has('pies') ? PERK_EFFECTS.pies.speed : 1,
    regenDelay: has('aire') ? PERK_EFFECTS.aire.regenDelay : PLAYER.regenDelay,
    regenRate: has('aire') ? PERK_EFFECTS.aire.regenRate : PLAYER.regenRate,
  };
}

export const MAX_WEAPONS = 3;
export const WALL_BUYS = { magnum: 900, smg: 1000, shotgun: 1500, rifle: 1600, burst: 1800, dmr: 2000, lmg: 2500, sniper: 2750, ray: 6000 };
export const wallAmmoPrice = (id) => Math.round((WALL_BUYS[id] ?? 1000) / 2 / 50) * 50;

export const BOX_PRICE = 950;
export const BOX_MOVE = { min: 4, max: 7 };
export const BOX_POOL = ['smg', 'rifle', 'shotgun', 'sniper', 'magnum', 'burst', 'lmg', 'dmr', 'ray'];
export const BOX_WEIGHT = { ray: 0.35 };

export function rollBox(owned, rng = Math.random) {
  const pool = BOX_POOL.filter((id) => !owned.has(id));
  if (!pool.length) return null;
  const total = pool.reduce((a, id) => a + (BOX_WEIGHT[id] ?? 1), 0);
  let r = rng() * total;
  for (const id of pool) if ((r -= BOX_WEIGHT[id] ?? 1) < 0) return id;
  return pool[pool.length - 1];
}

export const BARRICADE = {
  boards: 6,
  tearEvery: 1.1,
  repairEvery: 0.55,
  repairPoints: 10,
  repairCapPerWave: 500,
  reach: 2.2,
};

export const DOORS = {
  plaza: { name: 'Plaza', price: 500 },
  iglesia: { name: 'Iglesia', price: 750 },
  mercado: { name: 'Mercado', price: 1000 },
  estacion: { name: 'Estación', price: 1000 },
  subestacion: { name: 'Subestación', price: 1250 },
  hospital: { name: 'Hospital', price: 1500 },
  'hospital-mercado': { name: 'Hospital', price: 1500, section: 'hospital' },
  feria: { name: 'Feria', price: 2000 },
  'feria-iglesia': { name: 'Feria', price: 2000, section: 'feria' },
};
export const doorSection = (id) => DOORS[id]?.section ?? id;

export const FORGE = { price: 5000, damage: 2, reserve: 1.5, magazine: 1.5, suffix: 'forjada' };

export const DIFFICULTIES = {
  facil: { name: 'Fácil', desc: 'Zombis lentos y frágiles que pegan la mitad. Para aprender el modo.', hp: 0.7, speed: 0.85, damage: 0.5, count: 0.75, alive: 0.8, spawn: 1.3, points: 0.8, regen: 1.5, runners: 0, brutesFrom: 7 },
  normal: { name: 'Normal', desc: 'La horda tal como fue pensada.', hp: 1, speed: 1, damage: 1, count: 1, alive: 1, spawn: 1, points: 1, regen: 1, runners: 0, brutesFrom: 5 },
  dificil: { name: 'Difícil', desc: 'Más zombis, más rápidos y resistentes. Cada golpe duele.', hp: 1.3, speed: 1.12, damage: 1.4, count: 1.25, alive: 1.08, spawn: 0.8, points: 1.25, regen: 0.8, runners: 0.08, brutesFrom: 4 },
  locura: { name: 'Locura', desc: 'Una marea: corredores desde el principio, brutos desde la ronda 3 y casi sin respiro.', hp: 1.7, speed: 1.25, damage: 2, count: 1.5, alive: 1.15, spawn: 0.6, points: 1.6, regen: 0.5, runners: 0.18, brutesFrom: 3 },
};
export const DIFFICULTY_ORDER = ['facil', 'normal', 'dificil', 'locura'];
export const difficultyOf = (id) => DIFFICULTIES[id] ?? DIFFICULTIES.normal;

export { FIRST_COUNTDOWN, INTERMISSION, ROUNDS };

export function waveConfig(n, difficulty = 'normal') {
  const d = difficultyOf(difficulty);
  const R = ROUNDS;
  const w = Math.max(1, Math.floor(n));
  const k = w - 1;
  const runnerNight = w % R.runnerNightEvery === 0;
  const lerpGap = (i) => Math.max(R.spawnGapMin[i], (R.spawnGapStart[i] + R.spawnGapPerRound[i] * w) * d.spawn);
  return {
    wave: w,
    difficulty: DIFFICULTIES[difficulty] ? difficulty : 'normal',
    runnerNight,
    count: Math.max(3, Math.round(Math.min(R.countMax, R.countBase + R.countPerRound * w + R.countCurve * w * w) * d.count)),
    maxAlive: Math.round(Math.min(R.aliveMax, R.aliveBase + R.alivePerRound * k) * d.alive),
    spawnGap: [lerpGap(0), lerpGap(1)],
    hp: Math.round(roundHp(w) * d.hp),
    hpMul: (roundHp(w) / roundHp(1)) * d.hp,
    speedMul: Math.min(R.speedMax, R.speedBase + R.speedPerRound * k) * d.speed,
    damageMul: Math.min(R.damageMax, R.damageBase + R.damagePerRound * k) * d.damage,
    diffSpeed: d.speed,
    runnerShare: runnerNight ? 0.7 : Math.min(0.5, (w >= R.runnersFrom ? Math.min(R.runnerMax, R.runnerPerRound * (w - R.runnersFrom + 1)) : 0) + d.runners),
    crawlerShare: w >= R.crawlersFrom ? Math.min(R.crawlerMax, R.crawlerPerRound * (w - R.crawlersFrom + 1)) : 0,
    brutes: w >= d.brutesFrom ? 1 + Math.floor((w - d.brutesFrom) / R.brutesEvery) : 0,
    boss: isBossRound(w) ? 1 : 0,
    clearBonus: Math.round(R.clearBonus * w * d.points),
    pointsMul: d.points,
    regenMul: d.regen,
  };
}

export function isBossRound(n) {
  const w = Math.floor(n);
  return w >= ROUNDS.bossFrom && (w - ROUNDS.bossFrom) % ROUNDS.bossEvery === 0;
}

export function waveRoster(cfg, rng = Math.random) {
  const list = [];
  const boss = cfg.boss ?? 0;
  const normal = Math.max(0, cfg.count - cfg.brutes - boss);
  for (let i = 0; i < normal; i++) {
    const r = rng();
    list.push(r < cfg.runnerShare ? 'runner' : r < cfg.runnerShare + cfg.crawlerShare ? 'crawler' : 'walker');
  }
  for (let b = 0; b < cfg.brutes; b++) {
    const at = Math.floor(normal * (0.5 + 0.5 * ((b + 1) / (cfg.brutes + 1))));
    list.splice(Math.min(list.length, at + b), 0, 'brute');
  }
  if (boss) list.splice(Math.floor(list.length * 0.55), 0, 'boss');
  return list;
}

export function zombieStats(type, cfg) {
  const t = ZOMBIE_TYPES[type];
  return {
    ...t,
    type,
    hp: Math.round((cfg.hp ?? roundHp(cfg.wave ?? 1)) * t.hpScale),
    speed: t.speed * (t.heavy ? cfg.diffSpeed ?? 1 : cfg.speedMul),
    damage: Math.round(t.damage * (cfg.damageMul ?? 1)),
  };
}

export const POINTS = { hit: 10, headHit: 20, headKill: 40, meleeKill: 50 };

export function pointsFor({ part, killed, type, melee = false }, double = false, mul = 1) {
  let p = part === 'head' ? POINTS.headHit : POINTS.hit;
  if (killed) {
    p += ZOMBIE_TYPES[type]?.points ?? 60;
    if (part === 'head') p += POINTS.headKill;
    if (melee) p += POINTS.meleeKill;
  }
  return Math.round((double ? p * 2 : p) * mul);
}

export const RESERVE = { pistol: null, smg: 180, shotgun: 36, rifle: 150, sniper: 30, magnum: 42, burst: 210, lmg: 300, dmr: 72, ray: 40 };

export const SHOP = [
  { id: 'ammo', kind: 'ammo', name: 'Munición', desc: 'Rellena la reserva de todas tus armas.', price: 500 },
  { id: 'medkit', kind: 'heal', name: 'Botiquín', desc: 'Recupera toda la vida.', price: 400 },
  { id: 'frag', kind: 'grenade', amount: 2, name: '+2 de fragmentación', desc: `Explotan a los 1.6 s. Llevas hasta ${GRENADE_MAX.frag}.`, price: 300 },
  { id: 'fire', kind: 'grenade', amount: 2, name: '+2 incendiarias', desc: 'Se rompen al caer y dejan fuego unos segundos: cierra un pasillo.', price: 500 },
  { id: 'stun', kind: 'grenade', amount: 2, name: '+2 aturdidoras', desc: 'Frenan a la horda unos segundos para que escapes o recargues.', price: 400 },
  { id: 'decoy', kind: 'grenade', amount: 1, name: '+1 señuelo', desc: 'Pita y atrae a los zombis; al final explota en medio de ellos.', price: 700 },
  { id: 'restock', kind: 'restock', name: 'Reponer licor', desc: 'Vuelven a la barra 8 botellas rotas.', price: 700, defenseOnly: true },
];

export const DEFENSE = {
  hpPerBottle: 30,
  aggroRange: 3.2,
  aggroTime: 4,
  aggroLeash: 12,
  restock: 8,
};

export function cannotBuy(item, state) {
  if (item.kind === 'weapon' && state.owned.has(item.id)) return 'Ya la tienes';
  if (item.kind === 'perk' && state.perks?.has(item.id)) return 'Ya la tienes';
  if (item.kind === 'grenade' && (state.bag?.[item.id] ?? 0) >= GRENADE_MAX[item.id]) return 'Al máximo';
  if (item.kind === 'heal' && state.health >= state.maxHealth) return 'Vida completa';
  if (item.kind === 'ammo' && state.reserveFull) return 'Reserva llena';
  if (item.kind === 'restock' && !(state.bottlesMissing > 0)) return 'Barra llena';
  if (state.points < item.price) return 'Faltan puntos';
  return null;
}

export const POWERUPS = {
  ammo: { name: 'Munición máxima', color: '#ffd166', duration: 0 },
  double: { name: 'Doble puntos', color: '#36d6ff', duration: 20 },
  instakill: { name: 'Muerte instantánea', color: '#ff4d5e', duration: 15 },
  nuke: { name: 'Bomba', color: '#ff9f43', duration: 0 },
  medkit: { name: 'Botiquín', color: '#00f5a0', duration: 0 },
};
export const DROP = { chance: 0.055, cooldown: 12, lifetime: 22, blinkFrom: 5, pickupRadius: 1.4, nukePoints: 400 };

export function rollDrop(sinceLast, rng = Math.random) {
  if (sinceLast < DROP.cooldown || rng() >= DROP.chance) return null;
  const ids = Object.keys(POWERUPS);
  return ids[Math.min(ids.length - 1, Math.floor(rng() * ids.length))];
}

export function emptyRecord() {
  return { bestWave: 0, bestScore: 0, bestKills: 0, totalRuns: 0, totalKills: 0, history: [], byDifficulty: {}, difficulty: 'normal' };
}

export function updateRecord(record, run) {
  const r = Object.assign(record, { ...emptyRecord(), ...record });
  let best = run.wave > r.bestWave || (run.wave === r.bestWave && run.score > r.bestScore);
  if (run.difficulty) {
    r.byDifficulty = { ...r.byDifficulty };
    const sub = (r.byDifficulty[run.difficulty] ??= { bestWave: 0, bestScore: 0, bestKills: 0, totalRuns: 0 });
    best = run.wave > sub.bestWave || (run.wave === sub.bestWave && run.score > sub.bestScore);
    sub.bestWave = Math.max(sub.bestWave, run.wave);
    sub.bestScore = Math.max(sub.bestScore, run.score);
    sub.bestKills = Math.max(sub.bestKills, run.kills);
    sub.totalRuns++;
  }
  r.bestWave = Math.max(r.bestWave, run.wave);
  r.bestScore = Math.max(r.bestScore, run.score);
  r.bestKills = Math.max(r.bestKills, run.kills);
  r.totalRuns++;
  r.totalKills += run.kills;
  r.history = [...r.history, run].slice(-30);
  return best;
}
