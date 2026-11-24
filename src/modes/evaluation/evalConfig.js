import { EVALUATION_WEAPON, WEAPONS, WEAPON_ORDER } from '../../combat/weapons.js';

/*
  Configuración de las evaluaciones (Dianas y Enemigos): arma, colores, cuántos objetivos a la vez,
  tamaño, velocidad, duración, intentos y qué fases se juegan. Lógica pura (sin DOM): ver
  tests/evalConfig.test.js.

  Con los valores estándar (EVAL_DEFAULTS) la evaluación da rango y se guarda. Si cambia algo que
  afecta la dificultad (arma, cantidad, tamaño, velocidad, duración, intentos, fases o el daño
  enemigo), la partida es una PRÁCTICA: se ven los resultados de cada fase, pero no cambia el rango
  (así los rangos siguen siendo comparables). Los colores son solo estética: no cambian nada.
*/

export const EVAL_DEFAULTS = {
  weapon: EVALUATION_WEAPON,
  targetColor: 'auto', // 'auto' = el color propio de cada fase
  duration: 30, // s de cada fase con tiempo (el combate dura 4/3 de esto)
  count: 3, // dianas o enemigos a la vez (multi-objetivo, precisión y combate)
  size: 1, // tamaño de las dianas y de los enemigos
  speed: 1, // velocidad de dianas y enemigos (y lo que tardan en escaparse)
  reactionTrials: 8, // intentos de la fase de reacción
  peeks: 10, // asomadas de la fase de peeks
  enemyFire: 1, // puntería y daño de los enemigos que disparan (0 = no disparan)
  skip: { targets: [], bots: [] }, // fases que no se juegan (por id)
};

// [mínimo, máximo, paso]
export const EVAL_LIMITS = {
  duration: [10, 120, 5],
  count: [1, 8, 1],
  size: [0.5, 2, 0.25],
  speed: [0.5, 2, 0.25],
  reactionTrials: [3, 20, 1],
  peeks: [4, 20, 1],
  enemyFire: [0, 2, 0.25],
};

export const TARGET_COLORS = {
  auto: 'Según la fase',
  '#ff3d5a': 'Rojo',
  '#ffb020': 'Naranja',
  '#ffe14d': 'Amarillo',
  '#00e0a0': 'Verde',
  '#36d6ff': 'Celeste',
  '#3d6bff': 'Azul',
  '#b46cff': 'Violeta',
  '#ff5ad1': 'Rosa',
  '#ffffff': 'Blanco',
};

/** Armas que se pueden elegir (las del arsenal). */
export const EVAL_WEAPONS = WEAPON_ORDER.filter((id) => WEAPONS[id]);

const clampStep = (v, [min, max, step], fallback) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  const c = Math.min(max, Math.max(min, n));
  return Math.round((c - min) / step) * step + min;
};

/** Configuración válida a partir de la guardada (lo que falte o no sirva, por defecto). */
export function evalConfig(saved = {}) {
  const s = saved ?? {};
  const cfg = { ...EVAL_DEFAULTS, skip: { targets: [], bots: [] } };
  cfg.weapon = EVAL_WEAPONS.includes(s.weapon) ? s.weapon : EVAL_DEFAULTS.weapon;
  cfg.targetColor = s.targetColor in TARGET_COLORS ? s.targetColor : 'auto';
  for (const [k, lim] of Object.entries(EVAL_LIMITS)) cfg[k] = clampStep(s[k] ?? EVAL_DEFAULTS[k], lim, EVAL_DEFAULTS[k]);
  for (const v of ['targets', 'bots']) {
    const list = s.skip?.[v];
    cfg.skip[v] = Array.isArray(list) ? [...new Set(list.filter((x) => typeof x === 'string'))] : [];
  }
  return cfg;
}

/** Fases que se juegan de una variante (al menos una: si se quitan todas, se juegan todas). */
export function stagesFor(variant, cfg) {
  const skip = new Set(cfg.skip?.[variant.id] ?? []);
  const list = variant.stages.filter((S) => !skip.has(S.info.id));
  return list.length ? list : variant.stages;
}

/** Qué cambió respecto al estándar (lo que convierte la partida en práctica). Vacío = da rango. */
export function customChanges(variant, cfg) {
  const out = [];
  const d = EVAL_DEFAULTS;
  if (cfg.weapon !== d.weapon) out.push(`arma: ${WEAPONS[cfg.weapon].name}`);
  if (cfg.duration !== d.duration) out.push(`${cfg.duration} s por fase`);
  if (cfg.count !== d.count) out.push(`${cfg.count} a la vez`);
  if (cfg.size !== d.size) out.push(`tamaño ×${cfg.size}`);
  if (cfg.speed !== d.speed) out.push(`velocidad ×${cfg.speed}`);
  if (variant.id === 'targets' && cfg.reactionTrials !== d.reactionTrials) out.push(`${cfg.reactionTrials} intentos de reacción`);
  if (variant.id === 'bots' && cfg.peeks !== d.peeks) out.push(`${cfg.peeks} peeks`);
  if (variant.id === 'bots' && cfg.enemyFire !== d.enemyFire) out.push(cfg.enemyFire ? `disparos enemigos ×${cfg.enemyFire}` : 'enemigos sin disparar');
  if (stagesFor(variant, cfg).length !== variant.stages.length) out.push('fases elegidas');
  return out;
}

/** ¿Da rango? (configuración estándar en todo lo que afecta la dificultad). */
export function isRanked(variant, cfg) {
  return customChanges(variant, cfg).length === 0;
}

/** Multiplica las velocidades de un comportamiento de bot (rangos [min, max] o números). */
export function scaleBehavior(behavior, k) {
  if (!behavior || k === 1) return behavior;
  const sc = (v) => (Array.isArray(v) ? v.map((x) => x * k) : typeof v === 'number' ? v * k : v);
  const out = { ...behavior };
  if (out.speed !== undefined) out.speed = sc(out.speed);
  if (out.outSpeed !== undefined) out.outSpeed = sc(out.outSpeed);
  if (out.hold) out.hold = out.hold.map((x) => x / k);
  if (out.strafe) out.strafe = scaleBehavior(out.strafe, k);
  return out;
}
