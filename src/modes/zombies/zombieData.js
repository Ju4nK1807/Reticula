/*
  Datos del modo zombi: tipos de zombi, oleadas, economía (puntos y armería) y potenciadores.
  Todo son funciones puras (sin Three.js ni DOM): ver tests/zombieData.test.js.
*/

// --- Tipos de zombi -----------------------------------------------------------------------------
// height: altura en m · hpScale: vida respecto a la de la ronda (roundHp) · speed: m/s · damage: daño
// por golpe · attackRange: m · attackEvery: s entre golpes · points: puntos al matarlo · low: se
// arrastra (hitboxes cerca del suelo) · look: aspecto (zombieLook.js: ojos y tonos) · bulk: corpulencia
// Todos usan el mismo modelo realista (zombieSkin.js); cambian su tamaño, su aspecto y su animación.
// Inspirado en los modos de supervivencia clásicos: un caminante tiene 150 de vida en la ronda 1 y
// 100 más por ronda; tres golpes de caminante (45) tumban a un jugador sin bebidas.
export const ZOMBIE_TYPES = {
  walker: { name: 'Caminante', height: 1.78, hpScale: 1, speed: 1.6, damage: 45, attackRange: 1.3, attackEvery: 1.35, points: 60, look: 'normal', bulk: 1 },
  runner: { name: 'Corredor', height: 1.74, hpScale: 0.7, speed: 4.1, damage: 34, attackRange: 1.25, attackEvery: 0.95, points: 80, look: 'runner', bulk: 0.94 },
  crawler: { name: 'Reptante', height: 1.78, hpScale: 0.6, speed: 2.2, damage: 38, attackRange: 1.15, attackEvery: 1.1, points: 90, low: true, look: 'normal', bulk: 0.96 },
  brute: { name: 'Bruto', height: 2.35, hpScale: 3, speed: 1.45, damage: 80, attackRange: 1.75, attackEvery: 1.8, points: 300, look: 'brute', bulk: 1.18 },
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
// Las máquinas necesitan la electricidad del generador (Subestación), salvo las de power: false.
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

// --- Caja misteriosa y barricadas ------------------------------------------------------------------------
export const BOX_PRICE = 950; // un arma al azar de las que no tienes
// Cada tantas tiradas (entre min y max, al azar) la caja se muda a otro lugar del mapa.
export const BOX_MOVE = { min: 4, max: 7 };
export const BOX_POOL = ['smg', 'rifle', 'shotgun', 'sniper', 'magnum', 'burst', 'lmg', 'dmr'];

/** Arma de la caja: una al azar entre las que no se tienen (null si ya se tienen todas). */
export function rollBox(owned, rng = Math.random) {
  const pool = BOX_POOL.filter((id) => !owned.has(id));
  return pool.length ? pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))] : null;
}

// Barricadas en las entradas de zombis: tablones que arrancan para entrar y que el jugador repara.
export const BARRICADE = {
  boards: 6,
  tearEvery: 1.1, // s que tarda un zombi en arrancar un tablón
  repairEvery: 0.55, // s por tablón al mantener la tecla de usar
  repairPoints: 10, // puntos por tablón reparado
  repairCapPerWave: 500, // tope de puntos por reparar en cada oleada
  reach: 2.2, // m: distancia para reparar (desde dentro)
};

// --- Puertas entre secciones del mapa ------------------------------------------------------------------
// section: la sección que abre (por defecto, la de su mismo id). Más caras cuanto más lejos del circo
// (el inicio) y cuanto mejor la zona: la plaza es la más barata y la Feria (con el segundo piso) la más
// cara. El Hospital y la Feria tienen dos puertas cada uno (el mapa forma circuitos).
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

// --- Forja (mejora de armas) ------------------------------------------------------------------------------
// En el quirófano del Hospital; necesita la electricidad. Forja el arma que tienes en la mano: doble
// de daño, cargador y reserva más grandes y un brillo propio. Cada arma se forja una vez.
export const FORGE = { price: 5000, damage: 2, reserve: 1.5, magazine: 1.5, suffix: 'forjada' };

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
    hp: Math.round(roundHp(w) * d.hp), // vida de un caminante en esta ronda (y dificultad)
    hpMul: (roundHp(w) / roundHp(1)) * d.hp,
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
    hp: Math.round((cfg.hp ?? roundHp(cfg.wave ?? 1)) * t.hpScale),
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
 * state = { points, owned: Set, perks: Set, bag: { frag, fire, stun, decoy }, health, maxHealth, reserveFull }
 */
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
