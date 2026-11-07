/*
  Datos del modo zombi: tipos de zombi, oleadas, economía (puntos y armería) y potenciadores.
  Todo son funciones puras (sin Three.js ni DOM): ver tests/zombieData.test.js.
*/

// --- Tipos de zombi -----------------------------------------------------------------------------
// model: modelo animado (zombieSkin.js) · height: altura en m · hpScale: vida respecto a la de la
// ronda (roundHp) · speed: m/s · damage: daño por golpe · attackRange: m · attackEvery: s entre golpes
// points: puntos al matarlo · low: se arrastra (hitboxes cerca del suelo)
// Inspirado en los modos de supervivencia clásicos: un caminante tiene 150 de vida en la ronda 1 y
// 100 más por ronda; tres golpes de caminante (45) tumban a un jugador sin bebidas.
export const ZOMBIE_TYPES = {
  walker: { name: 'Caminante', model: 'walker', height: 1.78, hpScale: 1, speed: 1.6, damage: 45, attackRange: 1.3, attackEvery: 1.35, points: 60 },
  runner: { name: 'Corredor', model: 'runner', height: 1.74, hpScale: 0.7, speed: 4.1, damage: 34, attackRange: 1.25, attackEvery: 0.95, points: 80 },
  crawler: { name: 'Reptante', model: 'walker', height: 1.78, hpScale: 0.6, speed: 2.2, damage: 38, attackRange: 1.15, attackEvery: 1.1, points: 90, low: true },
  brute: { name: 'Bruto', model: 'walker', height: 2.35, hpScale: 3, speed: 1.45, damage: 80, attackRange: 1.75, attackEvery: 1.8, points: 300, tint: '#6e7f63' },
};

/** Vida de un caminante en la ronda n: 150, 250, 350… hasta la 9; desde la 10, ×1.1 por ronda. */
export function roundHp(n) {
  const w = Math.max(1, Math.floor(n));
  return w < 10 ? 150 + 100 * (w - 1) : Math.round(950 * 1.1 ** (w - 9));
}

// Cuchillo en este modo: daño fijo de 150 (mata de un golpe en la ronda 1, de dos en la 2…). Las
// bebidas de daño no lo afectan.
export const KNIFE_DAMAGE = 150;

export const PLAYER = {
  maxHealth: 100,
  regenDelay: 5, // s sin recibir daño antes de regenerar
  regenRate: 9, // vida por segundo (de casi muerto a entero en ~11 s)
  startPoints: 500,
  startGrenades: 2,
  maxGrenades: 6, // de fragmentación
};

// Máximo de cada tipo de granada que se puede llevar (combat/Grenades.js).
export const GRENADE_MAX = { frag: PLAYER.maxGrenades, fire: 4, stun: 4, decoy: 2 };

// --- Bebidas (máquinas del mapa) --------------------------------------------------------------------
// Mejoras permanentes durante la partida (se pierden al morir). Nombres propios del juego.
export const PERKS = {
  coraza: { name: 'Coraza', desc: 'Vida máxima 100 → 250: aguantas más del doble de golpes.', price: 2500, color: '#ff5a3d' },
  plomo: { name: 'Doble Plomo', desc: '+50 % de daño y +25 % de cadencia con todas las armas.', price: 2000, color: '#ffb020' },
  mano: { name: 'Mano Rápida', desc: 'Recargas el doble de rápido.', price: 3000, color: '#36d6ff' },
  pies: { name: 'Pies Ligeros', desc: 'Corres un 15 % más rápido.', price: 2000, color: '#8aff5a' },
  aire: { name: 'Segundo Aire', desc: 'Empiezas a recuperar vida a los 2.5 s (no a los 5) y el doble de rápido.', price: 1500, color: '#c86bff' },
};
export const PERK_EFFECTS = {
  coraza: { maxHealth: 250 },
  plomo: { damage: 1.5, rate: 1.25 },
  mano: { reload: 0.5 },
  pies: { speed: 1.15 },
  aire: { regenDelay: 2.5, regenRate: 20 },
};

/** Valores del jugador con las bebidas que tiene (Set de ids). */
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

// --- Armas de la pared --------------------------------------------------------------------------------
// Precio del arma; con el arma ya comprada, el mismo puesto vende su munición a mitad de precio.
export const WALL_BUYS = { magnum: 900, smg: 1000, rifle: 1600, shotgun: 1500, burst: 1800, dmr: 2000, lmg: 2500, sniper: 2500 };
export const wallAmmoPrice = (id) => Math.round((WALL_BUYS[id] ?? 1000) / 2 / 50) * 50;

// --- Puertas entre secciones del mapa ------------------------------------------------------------------
export const DOORS = {
  mercado: { name: 'Mercado', price: 750 },
  estacion: { name: 'Estación', price: 1000 },
  iglesia: { name: 'Iglesia', price: 1250 },
};

// --- Oleadas ------------------------------------------------------------------------------------
export const FIRST_COUNTDOWN = 6; // s antes de la primera oleada
export const INTERMISSION = 14; // s de descanso (armería abierta)

/** Configuración de la oleada n (1, 2, …). */
export function waveConfig(n) {
  const w = Math.max(1, Math.floor(n));
  const runnerNight = w % 6 === 0; // cada 6 oleadas: noche de corredores
  return {
    wave: w,
    runnerNight,
    count: Math.round(6 + 2.6 * w + 0.08 * w * w),
    maxAlive: Math.min(24, 8 + 2 * w),
    spawnGap: [Math.max(0.35, 1.8 - 0.12 * w), Math.max(0.6, 2.6 - 0.15 * w)],
    hp: roundHp(w), // vida de un caminante en esta ronda
    hpMul: roundHp(w) / roundHp(1),
    speedMul: Math.min(1.5, 1 + 0.04 * (w - 1)),
    runnerShare: runnerNight ? 0.7 : w >= 3 ? Math.min(0.4, 0.06 * (w - 2)) : 0,
    crawlerShare: w >= 4 ? Math.min(0.2, 0.04 * (w - 3)) : 0,
    brutes: w >= 5 ? 1 + Math.floor((w - 5) / 3) : 0,
    clearBonus: 100 * w,
  };
}

/**
 * Lista de tipos de la oleada en orden de aparición (los brutos, repartidos en la segunda mitad).
 * @param {ReturnType<typeof waveConfig>} cfg
 * @param {() => number} rng
 */
export function waveRoster(cfg, rng = Math.random) {
  const list = [];
  const normal = cfg.count - cfg.brutes;
  for (let i = 0; i < normal; i++) {
    const r = rng();
    list.push(r < cfg.runnerShare ? 'runner' : r < cfg.runnerShare + cfg.crawlerShare ? 'crawler' : 'walker');
  }
  for (let b = 0; b < cfg.brutes; b++) {
    const at = Math.floor(normal * (0.5 + 0.5 * ((b + 1) / (cfg.brutes + 1))));
    list.splice(Math.min(list.length, at + b), 0, 'brute');
  }
  return list;
}

/** Estadísticas de un zombi de `type` en la oleada `cfg`. */
export function zombieStats(type, cfg) {
  const t = ZOMBIE_TYPES[type];
  return {
    ...t,
    type,
    hp: Math.round((cfg.hp ?? roundHp(cfg.wave ?? 1)) * t.hpScale),
    speed: t.speed * (type === 'brute' ? 1 : cfg.speedMul),
  };
}

// --- Puntos -------------------------------------------------------------------------------------
export const POINTS = { hit: 10, headHit: 20, headKill: 40, meleeKill: 50 };

/** Puntos por un impacto o una baja (con doble puntos activo, el doble). */
export function pointsFor({ part, killed, type, melee = false }, double = false) {
  let p = part === 'head' ? POINTS.headHit : POINTS.hit;
  if (killed) {
    p += ZOMBIE_TYPES[type]?.points ?? 60;
    if (part === 'head') p += POINTS.headKill;
    if (melee) p += POINTS.meleeKill;
  }
  return double ? p * 2 : p;
}

// --- Armería (entre oleadas): suministros y granadas ----------------------------------------------------
// Las armas ya no se compran aquí: están en las paredes del mapa (WALL_BUYS), como en los modos de
// supervivencia clásicos; las mejoras son las bebidas de las máquinas (PERKS).
// Munición de reserva al comprar el arma o rellenarla (la pistola es infinita: nunca te quedas sin nada).
export const RESERVE = { pistol: null, smg: 180, shotgun: 36, rifle: 150, sniper: 30, magnum: 42, burst: 210, lmg: 300, dmr: 72 };

export const SHOP = [
  { id: 'ammo', kind: 'ammo', name: 'Munición', desc: 'Rellena la reserva de todas tus armas.', price: 500 },
  { id: 'medkit', kind: 'heal', name: 'Botiquín', desc: 'Recupera toda la vida.', price: 400 },
  { id: 'frag', kind: 'grenade', amount: 2, name: '+2 de fragmentación', desc: `Explotan a los 1.6 s. Llevas hasta ${GRENADE_MAX.frag}.`, price: 300 },
  { id: 'fire', kind: 'grenade', amount: 2, name: '+2 incendiarias', desc: 'Se rompen al caer y dejan fuego unos segundos: cierra un pasillo.', price: 500 },
  { id: 'stun', kind: 'grenade', amount: 2, name: '+2 aturdidoras', desc: 'Frenan a la horda unos segundos para que escapes o recargues.', price: 400 },
  { id: 'decoy', kind: 'grenade', amount: 1, name: '+1 señuelo', desc: 'Pita y atrae a los zombis; al final explota en medio de ellos.', price: 700 },
];

/**
 * ¿Se puede comprar? Devuelve null si sí o el motivo si no.
 * state = { points, owned: Set, perks: Set, bag: { frag, fire, stun, decoy }, health, maxHealth, reserveFull }
 */
export function cannotBuy(item, state) {
  if (item.kind === 'weapon' && state.owned.has(item.id)) return 'Ya la tienes';
  if (item.kind === 'perk' && state.perks?.has(item.id)) return 'Ya la tienes';
  if (item.kind === 'grenade' && (state.bag?.[item.id] ?? 0) >= GRENADE_MAX[item.id]) return 'Al máximo';
  if (item.kind === 'heal' && state.health >= state.maxHealth) return 'Vida completa';
  if (item.kind === 'ammo' && state.reserveFull) return 'Reserva llena';
  if (state.points < item.price) return 'Faltan puntos';
  return null;
}

// --- Potenciadores ------------------------------------------------------------------------------
export const POWERUPS = {
  ammo: { name: 'Munición máxima', color: '#ffd166', duration: 0 },
  double: { name: 'Doble puntos', color: '#36d6ff', duration: 20 },
  instakill: { name: 'Muerte instantánea', color: '#ff4d5e', duration: 15 },
  nuke: { name: 'Bomba', color: '#ff9f43', duration: 0 },
  medkit: { name: 'Botiquín', color: '#00f5a0', duration: 0 },
};
export const DROP = { chance: 0.055, cooldown: 12, lifetime: 22, blinkFrom: 5, pickupRadius: 1.4, nukePoints: 400 };

/**
 * ¿Suelta un potenciador esta baja? Devuelve su id o null.
 * @param {number} sinceLast s desde el último · @param {() => number} rng
 */
export function rollDrop(sinceLast, rng = Math.random) {
  if (sinceLast < DROP.cooldown || rng() >= DROP.chance) return null;
  const ids = Object.keys(POWERUPS);
  return ids[Math.min(ids.length - 1, Math.floor(rng() * ids.length))];
}

// --- Récords ------------------------------------------------------------------------------------
export function emptyRecord() {
  return { bestWave: 0, bestScore: 0, bestKills: 0, totalRuns: 0, totalKills: 0, history: [] };
}

/** Actualiza el récord con una partida terminada. Devuelve true si es la mejor oleada. */
export function updateRecord(record, run) {
  const r = Object.assign(record, { ...emptyRecord(), ...record });
  const best = run.wave > r.bestWave || (run.wave === r.bestWave && run.score > r.bestScore);
  r.bestWave = Math.max(r.bestWave, run.wave);
  r.bestScore = Math.max(r.bestScore, run.score);
  r.bestKills = Math.max(r.bestKills, run.kills);
  r.totalRuns++;
  r.totalKills += run.kills;
  r.history = [...r.history, run].slice(-30);
  return best;
}
