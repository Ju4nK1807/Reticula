// Diseño del modo infinito: curva de dificultad por oleada, puntuación y récords.
// Funciones puras (sin Three.js ni DOM) para poder probarlas en tests/endless.test.js.

export const MAX_HEALTH = 100;
export const WAVE_HEAL = 25; // vida recuperada al superar una oleada
export const FIRST_COUNTDOWN = 3; // s antes de la primera oleada
export const INTERMISSION = 6; // s de descanso entre oleadas
export const GATE_WARNING = 0.9; // s de aviso (lámpara roja + sonido) antes de que entre un bot
export const MAX_RUNS = 20; // partidas guardadas en el historial

// Botiquines: probabilidad de que un bot lo suelte al morir (más alta con poca vida).
export const MEDKIT_HEAL = 20;
export const MEDKIT_CHANCE = 0.12;
export const MEDKIT_CHANCE_LOW = 0.3;
export const MEDKIT_LOW_HEALTH = 40;
export const MEDKIT_MAX = 3;

// Puntuación base (se multiplica por oleada). Fallar resta poco: aquí se premia sobrevivir.
export const BASE_POINTS = { head: 30, body: 15, legs: 10, kill: 100, miss: -10, escaped: 0 };
export const HEADSHOT_KILL_BONUS = 50;
export const STREAK_STEP = 10; // puntos extra por baja en racha (racha = bajas sin recibir daño)
export const STREAK_CAP = 10;
export const WAVE_CLEAR_BONUS = 200;
export const PERFECT_WAVE_BONUS = 300; // oleada superada sin recibir daño

// Crece linealmente desde `start` y se detiene en `limit` (sirve para subir o bajar).
function ramp(start, perWave, limit, d) {
  const v = start + perWave * d;
  return perWave >= 0 ? Math.min(limit, v) : Math.max(limit, v);
}

const round2 = (v) => Math.round(v * 100) / 100;

// Configuración de la oleada `n` (1, 2, 3…). d = oleadas superadas.
// Ritmo: las primeras oleadas enseñan (pocos bots, lentos, de tamaño real); hacia la 15 los bots son
// ~40 % más pequeños, el doble de rápidos, reaccionan en menos de 0.3 s y llegan varios a la vez.
export function waveConfig(n) {
  const wave = Math.max(1, Math.floor(n));
  const d = wave - 1;
  return {
    wave,
    count: Math.min(4 + 2 * d, 40),
    maxAlive: Math.min(2 + Math.floor(d / 2), 8),
    spawnGap: [round2(ramp(2.4, -0.12, 0.6, d)), round2(ramp(4, -0.2, 1.2, d))],
    pointsMultiplier: round2(1 + 0.1 * d),
    bot: {
      scale: round2(ramp(1, -0.025, 0.62, d)),
      walkSpeed: round2(ramp(2.6, 0.2, 5.5, d)),
      strafe: {
        range: round2(ramp(1.6, 0.1, 3, d)),
        speed: [round2(ramp(1.8, 0.2, 5, d)), round2(ramp(3.2, 0.3, 7.5, d))],
        change: [round2(ramp(0.6, -0.03, 0.2, d)), round2(ramp(1.4, -0.06, 0.5, d))],
        crouchChance: round2(ramp(0.05, 0.02, 0.35, d)),
        jumpChance: round2(ramp(0, 0.02, 0.25, d)),
        stopChance: round2(ramp(0.25, -0.01, 0.08, d)),
      },
      engageTime: [round2(ramp(4, -0.15, 1.5, d)), round2(ramp(7, -0.25, 3, d))],
      shooter: {
        reaction: round2(ramp(0.8, -0.035, 0.28, d)),
        interval: round2(ramp(0.5, -0.02, 0.22, d)),
        accuracy: round2(ramp(0.2, 0.02, 0.5, d)),
        damage: Math.round(ramp(7, 0.5, 14, d)),
      },
    },
  };
}

// Puntos por impacto de la oleada (Phase.handleShot los usa directamente).
export function wavePoints(cfg) {
  const m = cfg.pointsMultiplier;
  const out = {};
  for (const [k, v] of Object.entries(BASE_POINTS)) out[k] = v < 0 ? v : Math.round(v * m);
  return out;
}

export function streakBonus(streak) {
  return streak >= 2 ? Math.min(streak, STREAK_CAP) * STREAK_STEP : 0;
}

export function waveClearBonus(wave, damageTaken) {
  return WAVE_CLEAR_BONUS * wave + (damageTaken === 0 ? PERFECT_WAVE_BONUS * wave : 0);
}

export function medkitChance(health) {
  return health < MEDKIT_LOW_HEALTH ? MEDKIT_CHANCE_LOW : MEDKIT_CHANCE;
}

export function emptyRecord() {
  return { bestWave: 0, bestScore: 0, bestKills: 0, bestStreak: 0, totalRuns: 0, runs: [] };
}

// Actualiza el récord con una partida terminada. `run` = { wave, score, kills, bestStreak, ... }.
// Devuelve qué marcas se superaron. Muta `record` (completando campos que falten en guardados viejos).
export function updateRecord(record, run) {
  Object.assign(record, { ...emptyRecord(), ...record });
  const isBest = {
    wave: run.wave > record.bestWave,
    score: run.score > record.bestScore,
    kills: run.kills > record.bestKills,
    streak: run.bestStreak > record.bestStreak,
  };
  record.bestWave = Math.max(record.bestWave, run.wave);
  record.bestScore = Math.max(record.bestScore, run.score);
  record.bestKills = Math.max(record.bestKills, run.kills);
  record.bestStreak = Math.max(record.bestStreak, run.bestStreak);
  record.totalRuns++;
  record.runs = [...record.runs, run].slice(-MAX_RUNS);
  return isBest;
}
