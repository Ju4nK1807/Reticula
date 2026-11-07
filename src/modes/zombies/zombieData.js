/*
  Datos del modo zombi: tipos de zombi, oleadas, economía (puntos y armería) y potenciadores.
  Todo son funciones puras (sin Three.js ni DOM): ver tests/zombieData.test.js.
*/

// --- Tipos de zombi -----------------------------------------------------------------------------
// model: modelo animado (zombieSkin.js) · height: altura en m · hp: vida en la oleada 1
// speed: m/s · damage: daño por golpe · attackRange: m · attackEvery: s entre golpes
// points: puntos al matarlo · low: se arrastra (hitboxes cerca del suelo)
// Calibrado para un entrenador de puntería: en la oleada 1 un tiro a la cabeza con la pistola (110)
// mata a un caminante; al cuerpo hacen falta 4. La vida sube un 10 % por oleada.
export const ZOMBIE_TYPES = {
  walker: { name: 'Caminante', model: 'walker', height: 1.78, hp: 110, speed: 1.6, damage: 18, attackRange: 1.3, attackEvery: 1.35, points: 60 },
  runner: { name: 'Corredor', model: 'runner', height: 1.74, hp: 75, speed: 4.1, damage: 12, attackRange: 1.25, attackEvery: 0.95, points: 80 },
  crawler: { name: 'Reptante', model: 'walker', height: 1.78, hp: 60, speed: 2.2, damage: 14, attackRange: 1.15, attackEvery: 1.1, points: 90, low: true },
  brute: { name: 'Bruto', model: 'walker', height: 2.35, hp: 700, speed: 1.15, damage: 40, attackRange: 1.75, attackEvery: 1.8, points: 300, tint: '#6e7f63' },
};

export const PLAYER = {
  maxHealth: 100,
  armoredHealth: 150, // con el blindaje de la armería
  regenDelay: 4, // s sin recibir daño antes de regenerar
  regenRate: 15, // vida por segundo
  startPoints: 500,
  startGrenades: 2,
  maxGrenades: 6,
};

// --- Dificultad ---------------------------------------------------------------------------------
// Multiplicadores sobre la oleada: vida, velocidad y daño de los zombis, cuántos son, cuántos a la vez,
// cada cuánto aparecen (spawn > 1 = más espaciados), puntos que dan y regeneración del jugador.
// runners: corredores extra · brutesFrom: oleada desde la que llegan los brutos.
export const DIFFICULTIES = {
  facil: { name: 'Fácil', desc: 'Zombis lentos y frágiles que pegan la mitad. Para aprender el modo.', hp: 0.7, speed: 0.85, damage: 0.5, count: 0.75, alive: 0.8, spawn: 1.3, points: 0.8, regen: 1.5, runners: 0, brutesFrom: 7 },
  normal: { name: 'Normal', desc: 'La horda tal como fue pensada.', hp: 1, speed: 1, damage: 1, count: 1, alive: 1, spawn: 1, points: 1, regen: 1, runners: 0, brutesFrom: 5 },
  dificil: { name: 'Difícil', desc: 'Más zombis, más rápidos y resistentes. Cada golpe duele.', hp: 1.3, speed: 1.12, damage: 1.4, count: 1.25, alive: 1.08, spawn: 0.8, points: 1.25, regen: 0.8, runners: 0.08, brutesFrom: 4 },
  locura: { name: 'Locura', desc: 'Una marea: corredores desde el principio, brutos desde la oleada 3 y casi sin respiro.', hp: 1.7, speed: 1.25, damage: 2, count: 1.5, alive: 1.15, spawn: 0.6, points: 1.6, regen: 0.5, runners: 0.18, brutesFrom: 3 },
};
export const DIFFICULTY_ORDER = ['facil', 'normal', 'dificil', 'locura'];
export const difficultyOf = (id) => DIFFICULTIES[id] ?? DIFFICULTIES.normal;

// --- Oleadas ------------------------------------------------------------------------------------
export const FIRST_COUNTDOWN = 6; // s antes de la primera oleada
export const INTERMISSION = 14; // s de descanso (armería abierta)

/** Configuración de la oleada n (1, 2, …) en una dificultad ('facil' | 'normal' | 'dificil' | 'locura'). */
export function waveConfig(n, difficulty = 'normal') {
  const d = difficultyOf(difficulty);
  const w = Math.max(1, Math.floor(n));
  const runnerNight = w % 6 === 0; // cada 6 oleadas: noche de corredores
  return {
    wave: w,
    difficulty: DIFFICULTIES[difficulty] ? difficulty : 'normal',
    runnerNight,
    count: Math.max(3, Math.round((6 + 2.6 * w + 0.08 * w * w) * d.count)),
    maxAlive: Math.round(Math.min(24, 8 + 2 * w) * d.alive),
    spawnGap: [Math.max(0.25, (1.8 - 0.12 * w) * d.spawn), Math.max(0.45, (2.6 - 0.15 * w) * d.spawn)],
    hpMul: (1 + 0.1 * (w - 1)) * d.hp,
    speedMul: Math.min(1.5, 1 + 0.04 * (w - 1)) * d.speed,
    damageMul: d.damage,
    diffSpeed: d.speed, // el bruto no acelera con las oleadas, solo con la dificultad
    runnerShare: runnerNight ? 0.7 : Math.min(0.5, (w >= 3 ? Math.min(0.4, 0.06 * (w - 2)) : 0) + d.runners),
    crawlerShare: w >= 4 ? Math.min(0.2, 0.04 * (w - 3)) : 0,
    brutes: w >= d.brutesFrom ? 1 + Math.floor((w - d.brutesFrom) / 3) : 0,
    clearBonus: Math.round(100 * w * d.points),
    pointsMul: d.points,
    regenMul: d.regen,
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
    hp: Math.round(t.hp * cfg.hpMul),
    speed: t.speed * (type === 'brute' ? cfg.diffSpeed ?? 1 : cfg.speedMul),
    damage: Math.round(t.damage * (cfg.damageMul ?? 1)),
  };
}

// --- Puntos -------------------------------------------------------------------------------------
export const POINTS = { hit: 10, headHit: 20, headKill: 40, meleeKill: 50 };

/** Puntos por un impacto o una baja (con doble puntos activo, el doble; `mul` = dificultad). */
export function pointsFor({ part, killed, type, melee = false }, double = false, mul = 1) {
  let p = part === 'head' ? POINTS.headHit : POINTS.hit;
  if (killed) {
    p += ZOMBIE_TYPES[type]?.points ?? 60;
    if (part === 'head') p += POINTS.headKill;
    if (melee) p += POINTS.meleeKill;
  }
  return Math.round((double ? p * 2 : p) * mul);
}

// --- Armería ------------------------------------------------------------------------------------
// Munición de reserva al comprar el arma o rellenarla (la pistola es infinita: nunca te quedas sin nada).
export const RESERVE = { pistol: null, smg: 180, shotgun: 36, rifle: 150, sniper: 30 };

export const SHOP = [
  { id: 'smg', kind: 'weapon', name: 'Subfusil', desc: 'Cadencia altísima: limpia grupos de cerca.', price: 1000 },
  { id: 'shotgun', kind: 'weapon', name: 'Escopeta', desc: 'Nueve perdigones: detiene a cualquiera de cerca.', price: 1500 },
  { id: 'rifle', kind: 'weapon', name: 'Rifle', desc: 'Preciso y potente a media distancia.', price: 2000 },
  { id: 'sniper', kind: 'weapon', name: 'Francotirador', desc: 'Atraviesa la horda desde lejos (y mata brutos).', price: 2500 },
  { id: 'ammo', kind: 'ammo', name: 'Munición', desc: 'Rellena la reserva de todas tus armas.', price: 500 },
  { id: 'grenades', kind: 'grenades', name: '+2 granadas', desc: `Llevas hasta ${PLAYER.maxGrenades} a la vez.`, price: 300 },
  { id: 'medkit', kind: 'heal', name: 'Botiquín', desc: 'Recupera toda la vida.', price: 400 },
  { id: 'armor', kind: 'upgrade', name: 'Blindaje', desc: `Vida máxima ${PLAYER.maxHealth} → ${PLAYER.armoredHealth}.`, price: 1500 },
  { id: 'reload', kind: 'upgrade', name: 'Recarga rápida', desc: 'Recargas un 35 % más rápido.', price: 1800 },
  { id: 'damage', kind: 'upgrade', name: 'Munición expansiva', desc: '+25 % de daño con todas las armas.', price: 3000 },
  { id: 'restock', kind: 'restock', name: 'Reponer licor', desc: 'Vuelven a la barra 8 botellas rotas.', price: 700, defenseOnly: true },
];

// --- Defensa de la barra -------------------------------------------------------------------------
// La fuente de la plaza es una barra llena de botellas: los zombis van primero por ella.
export const DEFENSE = {
  hpPerBottle: 30, // daño de zombi que rompe una botella (un caminante rompe una cada dos golpes)
  aggroRange: 3.2, // m: más cerca que esto, el zombi deja la barra y va por el jugador
  aggroTime: 4, // s que persigue al jugador después de recibir un disparo
  aggroLeash: 12, // m: si el jugador se aleja más que esto, vuelve a la barra
  restock: 8, // botellas que repone la armería
};

/**
 * ¿Se puede comprar? Devuelve null si sí o el motivo si no.
 * state = { points, owned: Set, upgrades: Set, grenades, health, maxHealth, reserveFull }
 */
export function cannotBuy(item, state) {
  if (item.kind === 'weapon' && state.owned.has(item.id)) return 'Ya la tienes';
  if (item.kind === 'upgrade' && state.upgrades.has(item.id)) return 'Ya la tienes';
  if (item.kind === 'grenades' && state.grenades >= PLAYER.maxGrenades) return 'Al máximo';
  if (item.kind === 'heal' && state.health >= state.maxHealth) return 'Vida completa';
  if (item.kind === 'ammo' && state.reserveFull) return 'Reserva llena';
  if (item.kind === 'restock' && !(state.bottlesMissing > 0)) return 'Barra llena';
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
  return { bestWave: 0, bestScore: 0, bestKills: 0, totalRuns: 0, totalKills: 0, history: [], byDifficulty: {}, difficulty: 'normal' };
}

/**
 * Actualiza el récord con una partida terminada (y el de su dificultad, si la trae). Devuelve true si
 * es la mejor oleada (de esa dificultad, cuando la hay).
 */
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
