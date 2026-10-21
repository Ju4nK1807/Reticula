import { rankForScore } from '../../config/ranks.js';
import { clamp, clamp01, norm } from '../../utils/math.js';
import { fixed, ms, pct } from '../../utils/format.js';

// Peso de cada fase en la puntuación global de cada variante (suman 1).
export const WEIGHTS = {
  targets: { flick: 0.22, tracking: 0.2, reaction: 0.18, multi: 0.2, precision: 0.2 },
  bots: { flick: 0.22, tracking: 0.2, peek: 0.2, precision: 0.2, combat: 0.18 },
};

// Sub-puntuaciones 0-100 por fase. Los umbrales son exigentes: 100 pts ≈ nivel profesional.
function targetSubscores({ flick: f, tracking: t, reaction: re, multi: m, precision: p }) {
  return {
    flick: 100 * (0.5 * norm(f.accuracy, 0.55, 0.95) + 0.5 * norm(f.kps, 0.45, 1.4)) - 3 * f.escaped,
    tracking: 100 * (0.65 * norm(t.onTarget, 0.3, 0.85) + 0.35 * (t.shots >= 20 ? norm(t.accuracy, 0.25, 0.75) : 0)),
    reaction:
      re.avgMs === null
        ? 0
        : 100 * norm(600 - re.avgMs, 0, 380) * clamp01(1 - 0.08 * re.early - 0.12 * re.escaped),
    multi: 100 * (0.5 * norm(m.kps, 0.8, 2.4) + 0.5 * norm(m.accuracy, 0.55, 0.95)),
    precision: 100 * (0.6 * norm(p.accuracy, 0.4, 0.92) + 0.4 * norm(p.kps, 0.35, 1.2)),
  };
}

function botSubscores({ flick: f, tracking: t, peek: p, precision: pr, combat: c }) {
  return {
    flick:
      100 * (0.35 * norm(f.accuracy, 0.5, 0.9) + 0.35 * norm(f.kps, 0.4, 1.1) + 0.3 * norm(f.hsRate, 0.15, 0.6)) -
      3 * f.escaped,
    tracking: 100 * (0.6 * norm(t.onTarget, 0.25, 0.8) + 0.4 * (t.shots >= 20 ? norm(t.accuracy, 0.2, 0.65) : 0)),
    peek:
      p.avgMs === null
        ? 0
        : 100 *
          (0.45 * norm(700 - p.avgMs, 0, 420) + 0.3 * (p.kills / p.peeks) + 0.25 * norm(p.accuracy, 0.35, 0.85)) *
          (1 - Math.min(0.4, p.damageTaken / 250)),
    precision: 100 * (0.7 * norm(pr.headAcc, 0.25, 0.75) + 0.3 * norm(pr.kps, 0.2, 0.8)),
    combat:
      100 *
      (0.35 * norm(c.kills, 4, 16) + 0.25 * norm(c.accuracy, 0.2, 0.6) + 0.2 * norm(c.hsRate, 0.1, 0.45) + 0.2 * (c.health / 100)) *
      (c.died ? 0.75 : 1),
  };
}

function totals(results) {
  const all = Object.values(results);
  const sum = (key) => all.reduce((s, x) => s + (x[key] ?? 0), 0);
  return { shots: sum('shots'), hits: sum('hits'), head: sum('head'), kills: sum('kills') };
}

// Métricas destacadas que se muestran en la pantalla de resultados.
function targetTiles(r) {
  const t = totals(r);
  return [
    { label: 'Precisión', value: pct(t.shots ? t.hits / t.shots : 0), sub: 'todas las fases' },
    { label: 'Reacción', value: ms(r.reaction.avgMs), sub: 'promedio' },
    { label: 'Objetivos / s', value: fixed((r.flick.kills + r.multi.kills + r.precision.kills) / 90), sub: 'flick + multi + precisión' },
    { label: 'Sobre objetivo', value: pct(r.tracking.onTarget), sub: 'tracking' },
    { label: 'Destruidos', value: String(t.kills) },
    { label: 'Escapados', value: String(r.flick.escaped + r.reaction.escaped) },
  ];
}

function botTiles(r) {
  const t = totals(r);
  return [
    { label: 'Precisión', value: pct(t.shots ? t.hits / t.shots : 0), sub: 'todas las fases' },
    { label: 'Headshots', value: pct(t.hits ? t.head / t.hits : 0), sub: 'de los impactos' },
    { label: 'Reacción', value: ms(r.peek.avgMs), sub: 'desde que es visible' },
    { label: 'Sobre objetivo', value: pct(r.tracking.onTarget), sub: 'tracking' },
    { label: 'Bajas', value: String(t.kills) },
    { label: 'Daño recibido', value: String(r.peek.damageTaken + r.combat.damageTaken) },
  ];
}

export function scoreEvaluation(variant, results) {
  const subscores = variant === 'bots' ? botSubscores(results) : targetSubscores(results);
  for (const k of Object.keys(subscores)) subscores[k] = Math.round(clamp(subscores[k], 0, 100));
  const total = Math.round(Object.entries(WEIGHTS[variant]).reduce((sum, [k, w]) => sum + subscores[k] * w, 0));
  const tiles = variant === 'bots' ? botTiles(results) : targetTiles(results);
  return { variant, total, subscores, tiles, rank: rankForScore(total).id };
}
