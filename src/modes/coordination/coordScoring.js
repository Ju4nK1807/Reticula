import { clamp, norm } from '../../utils/math.js';

export const DRILL_IDS = ['sequence', 'color', 'peripheral', 'dual'];
export const MAX_HISTORY = 20;

export const LEVELS = [
  { min: 0, name: 'Inicial', color: '#8a97a8' },
  { min: 30, name: 'Intermedio', color: '#36d6ff' },
  { min: 50, name: 'Avanzado', color: '#00ffa3' },
  { min: 70, name: 'Experto', color: '#f2c14e' },
  { min: 85, name: 'Élite', color: '#ff4d6d' },
];

export function levelFor(score) {
  let level = LEVELS[0];
  for (const l of LEVELS) if (score >= l.min) level = l;
  return level;
}

export const SEQUENCE_SIZE = { start: 4, min: 4, max: 9 };

export function nextSetSize(size, orderErrors) {
  const next = orderErrors === 0 ? size + 1 : orderErrors >= 2 ? size - 1 : size;
  return clamp(next, SEQUENCE_SIZE.min, SEQUENCE_SIZE.max);
}

export const PERIPHERAL_WINDOW = { start: 1.2, min: 0.45, max: 1.6, onHit: 0.95, onMiss: 1.166 };
export const PERIPHERAL_TARGET_RATE = Math.log(1.166) / (Math.log(1.166) - Math.log(0.95));

export function nextWindow(window, hit) {
  const w = PERIPHERAL_WINDOW;
  return clamp(window * (hit ? w.onHit : w.onMiss), w.min, w.max);
}

const reactionTerm = (ms, worst, best) => (ms === null || ms === undefined ? 0 : norm(worst - ms, 0, worst - best));

export function sequenceScore(r) {
  const errorRate = r.shots ? r.orderErrors / r.shots : 0;
  return 100 * (0.5 * norm(r.tps, 0.5, 1.6) + 0.3 * norm(r.accuracy, 0.6, 0.95) + 0.2 * (1 - Math.min(1, errorRate * 5)));
}

export function colorScore(r) {
  return 100 * (0.4 * norm(r.cps, 0.3, 1.2) + 0.35 * (1 - Math.min(1, r.commissionRate * 4)) + 0.25 * reactionTerm(r.switchMs, 1500, 400));
}

export function peripheralScore(r) {
  return 100 * (0.4 * norm(r.hitRate, 0.5, 0.95) + 0.35 * norm(1.4 - r.window, 0, 0.9) + 0.25 * reactionTerm(r.avgMs, 900, 350));
}

export function dualScore(r) {
  return 100 * (0.45 * norm(r.onTarget, 0.3, 0.85) + 0.3 * norm(r.hitRate, 0.5, 1) + 0.25 * reactionTerm(r.avgMs, 1000, 400));
}

const SCORERS = { sequence: sequenceScore, color: colorScore, peripheral: peripheralScore, dual: dualScore };

export function drillScore(id, results) {
  const scorer = SCORERS[id];
  if (!scorer) throw new Error(`Ejercicio desconocido: ${id}`);
  const v = scorer(results);
  return Math.round(clamp(Number.isFinite(v) ? v : 0, 0, 100));
}

export function circuitScore(scores) {
  const values = DRILL_IDS.map((id) => scores[id]).filter((v) => Number.isFinite(v));
  return values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : 0;
}

const emptyEntry = () => ({ best: 0, last: null, plays: 0, history: [] });

export function emptyCoordRecord() {
  return { drills: Object.fromEntries(DRILL_IDS.map((id) => [id, emptyEntry()])), circuit: emptyEntry() };
}

export function normalizeRecord(record) {
  const base = emptyCoordRecord();
  const src = record ?? {};
  for (const id of DRILL_IDS) base.drills[id] = { ...base.drills[id], ...src.drills?.[id] };
  base.circuit = { ...base.circuit, ...src.circuit };
  return base;
}

export function recordScore(record, { kind, id = null, score, date = new Date().toISOString(), detail = null }) {
  const normalized = normalizeRecord(record);
  Object.assign(record, normalized);
  const entry = kind === 'circuit' ? record.circuit : record.drills[id];
  if (!entry) throw new Error(`Ejercicio desconocido: ${id}`);
  const isBest = score > entry.best;
  entry.best = Math.max(entry.best, score);
  entry.last = score;
  entry.plays++;
  entry.history = [...entry.history, { date, score, ...(detail ? { detail } : {}) }].slice(-MAX_HISTORY);
  return isBest;
}
