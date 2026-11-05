import { getRank, rankIndex } from '../config/ranks.js';

export const MAX_HISTORY_PER_VARIANT = 40;

// Rango general del perfil: el mejor rango actual entre las variantes evaluadas (o null).
// Cada variante conserva su propio rango en profile.variants[id].rank.
export function overallRank(variants = {}) {
  let best = null;
  for (const v of Object.values(variants)) {
    const rank = getRank(v?.rank);
    if (rank && (!best || rankIndex(rank.id) > rankIndex(best.id))) best = rank;
  }
  return best;
}

// Recalcula los campos derivados del perfil (rank, score, bestScore) a partir de las variantes.
export function refreshProfile(profile) {
  const variants = Object.values(profile.variants ?? {}).filter((v) => getRank(v?.rank));
  const rank = overallRank(profile.variants);
  const top = rank
    ? variants.filter((v) => v.rank === rank.id).reduce((a, b) => (b.score > a.score ? b : a))
    : null;
  profile.rank = rank?.id ?? null;
  profile.score = top?.score ?? null;
  profile.bestScore = variants.length ? Math.max(...variants.map((v) => v.best ?? v.score ?? 0)) : null;
  return profile;
}

// Registra el resultado de una evaluación: historial (limitado por variante), datos de la variante
// y campos derivados. Devuelve la evaluación anterior de esa variante (o null).
export function recordEvaluation(profile, variantId, summary, results, date = new Date().toISOString()) {
  const history = profile.evaluations;
  const previous = history.filter((e) => e.variant === variantId).at(-1) ?? null;
  history.push({ date, ...summary, results });
  // Recorta solo el historial de esta variante, para que una no borre el de la otra.
  let excess = history.filter((e) => e.variant === variantId).length - MAX_HISTORY_PER_VARIANT;
  for (let i = 0; i < history.length && excess > 0; ) {
    if (history[i].variant === variantId) {
      history.splice(i, 1);
      excess--;
    } else i++;
  }
  const v = profile.variants[variantId] ?? {};
  profile.variants[variantId] = {
    rank: summary.rank,
    score: summary.total,
    best: Math.max(v.best ?? 0, summary.total),
    date,
  };
  refreshProfile(profile);
  return previous;
}
