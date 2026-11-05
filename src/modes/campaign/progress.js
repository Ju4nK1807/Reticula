// Progreso de la campaña: puntuación de una misión, estrellas, desbloqueos y sugerencia de bajar de
// mapa. Funciones puras sobre `progress` (= store.data.campaign), probadas en tests/campaign.test.js.
import { clamp, norm } from '../../utils/math.js';
import { CAMPAIGN_MAPS, levelsOf } from './campaignData.js';

export const MAX_RECENT = 30;
export const DEMOTION_ATTEMPTS = 3; // intentos seguidos sin estrella en un mapa
export const DEMOTION_MARGIN = 10; // y con nota media al menos 10 puntos bajo la meta del 1er nivel
export const DIED_FACTOR = 0.6;

/*
  Puntuación 0-100 de una misión. r = { total, kills, shots, hits, head, health, died, time, timeLimit }
  - 45 % enemigos eliminados (los que escapan o no llegan a salir cuentan como no eliminados)
  - 20 % precisión, 15 % tiros a la cabeza, 12 % vida restante, 8 % rapidez
  Morir multiplica por 0.6 y además deja la misión sin estrellas.
*/
export function missionRating(r) {
  const killRatio = r.total ? r.kills / r.total : 0;
  const accuracy = r.shots ? r.hits / r.shots : 0;
  const hsRate = r.hits ? r.head / r.hits : 0;
  const speed = r.timeLimit ? norm(r.timeLimit - r.time, 0, r.timeLimit * 0.4) : 0;
  let v = 100 * (0.45 * killRatio + 0.2 * norm(accuracy, 0.25, 0.75) + 0.15 * norm(hsRate, 0.1, 0.55) + 0.12 * clamp(r.health / 100, 0, 1) + 0.08 * speed);
  if (r.died) v *= DIED_FACTOR;
  return Math.round(clamp(Number.isFinite(v) ? v : 0, 0, 100));
}

export function starsFor(rating, goals, died = false) {
  if (died) return 0;
  return goals.filter((g) => rating >= g).length;
}

export function emptyProgress() {
  return { unlocked: {}, best: {}, recent: [] };
}

// Completa un progreso guardado (versiones anteriores no tenían `recent`).
export function normalizeProgress(progress) {
  const p = progress ?? {};
  p.unlocked ??= {};
  p.best ??= {};
  p.recent ??= [];
  return p;
}

export function levelStars(progress, levelId) {
  return progress.best[levelId]?.stars ?? 0;
}

export function mapCompleted(progress, map) {
  return levelsOf(map.id).every((l) => levelStars(progress, l.id) >= 1);
}

export function mapStars(progress, map) {
  return levelsOf(map.id).reduce((s, l) => s + levelStars(progress, l.id), 0);
}

// Mapa recomendado para un rango (el primero si no hay rango).
export function recommendedMap(rankId) {
  return CAMPAIGN_MAPS.find((m) => m.ranks.includes(rankId)) ?? CAMPAIGN_MAPS[0];
}

/*
  Un mapa está abierto si:
  - es el del rango del jugador o uno inferior (siempre se puede practicar más fácil), o
  - el jugador completó el mapa anterior (la campaña permite "ascender" jugando).
*/
export function mapState(progress, map, rankId) {
  const rec = recommendedMap(rankId);
  const byRank = rankId !== null && rankId !== undefined && map.tier <= rec.tier;
  const prev = CAMPAIGN_MAPS[CAMPAIGN_MAPS.indexOf(map) - 1];
  const byProgress = !!prev && mapCompleted(progress, prev);
  const unlocked = map.tier === 0 || byRank || byProgress;
  let reason = null;
  if (!unlocked) reason = prev ? `Completa ${prev.name} o sube a ${capitalize(map.ranks[0])}` : 'Requiere evaluación';
  return { unlocked, recommended: map.id === rec.id, completed: mapCompleted(progress, map), reason };
}

const capitalize = (s) => (s === 'elite' ? 'Élite' : s.charAt(0).toUpperCase() + s.slice(1));

// Un nivel está abierto si su mapa lo está y el nivel anterior tiene al menos una estrella.
export function levelUnlocked(progress, level, rankId) {
  const map = CAMPAIGN_MAPS.find((m) => m.id === level.mapId);
  if (!mapState(progress, map, rankId).unlocked) return false;
  if (level.index === 0) return true;
  const prev = levelsOf(level.mapId)[level.index - 1];
  return levelStars(progress, prev.id) >= 1 || !!progress.unlocked[level.id];
}

export function nextLevel(level) {
  const levels = levelsOf(level.mapId);
  if (level.index + 1 < levels.length) return levels[level.index + 1];
  const map = CAMPAIGN_MAPS.find((m) => m.id === level.mapId);
  const nextMap = CAMPAIGN_MAPS[CAMPAIGN_MAPS.indexOf(map) + 1];
  return nextMap ? levelsOf(nextMap.id)[0] : null;
}

/*
  Registra un intento. result = { rating, stars, ...métricas }. Muta `progress`.
  Devuelve { isBest, unlockedLevel (id o null), completedMap (id o null) }.
*/
export function recordAttempt(progress, level, result, date = new Date().toISOString()) {
  normalizeProgress(progress);
  const map = CAMPAIGN_MAPS.find((m) => m.id === level.mapId);
  const wasCompleted = mapCompleted(progress, map);
  const prev = progress.best[level.id];
  const isBest = !prev || result.rating > prev.rating;
  progress.best[level.id] = {
    rating: Math.max(prev?.rating ?? 0, result.rating),
    stars: Math.max(prev?.stars ?? 0, result.stars),
    plays: (prev?.plays ?? 0) + 1,
    last: result.rating,
    date,
  };
  progress.recent = [...progress.recent, { levelId: level.id, mapId: level.mapId, rating: result.rating, stars: result.stars, date }].slice(-MAX_RECENT);

  let unlockedLevel = null;
  const next = nextLevel(level);
  if (result.stars >= 1 && next && !progress.unlocked[next.id]) {
    progress.unlocked[next.id] = true;
    unlockedLevel = next.id;
  }
  const completedMap = !wasCompleted && mapCompleted(progress, map) ? map.id : null;
  return { isBest, unlockedLevel, completedMap };
}

/*
  Sugerencia de bajar de mapa: los últimos DEMOTION_ATTEMPTS intentos en este mapa fueron sin estrellas
  y con nota media claramente por debajo de la meta del primer nivel del mapa. Devuelve el mapa
  inferior recomendado o null. Es solo una sugerencia: el jugador decide.
*/
export function demotionSuggestion(progress, map) {
  const idx = CAMPAIGN_MAPS.indexOf(map);
  if (idx <= 0) return null;
  const attempts = (progress.recent ?? []).filter((a) => a.mapId === map.id).slice(-DEMOTION_ATTEMPTS);
  if (attempts.length < DEMOTION_ATTEMPTS || attempts.some((a) => a.stars > 0)) return null;
  const avg = attempts.reduce((s, a) => s + a.rating, 0) / attempts.length;
  const firstGoal = levelsOf(map.id)[0].goals[0];
  return avg <= firstGoal - DEMOTION_MARGIN ? CAMPAIGN_MAPS[idx - 1] : null;
}
