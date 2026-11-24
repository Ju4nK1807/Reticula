import { getRank } from '../config/ranks.js';
import { getLevel, getMap, CAMPAIGN_MAPS, levelsOf } from '../modes/campaign/campaignData.js';
import { WEIGHTS } from '../modes/evaluation/scoring.js';

export const MODE_LABELS = {
  evaluation: 'Evaluación',
  campaign: 'Campaña',
  coordination: 'Coordinación',
  endless: 'Infinito',
};

export const VARIANT_LABELS = { targets: 'Dianas', bots: 'Enemigos' };

export const DRILL_LABELS = { sequence: 'Secuencia', color: 'Color objetivo', peripheral: 'Periferia', dual: 'Doble tarea' };

export const PHASE_LABELS = {
  targets: { flick: 'Flicking', tracking: 'Tracking', reaction: 'Reacción', multi: 'Multi-objetivo', precision: 'Precisión' },
  bots: { flick: 'Flicks', tracking: 'Tracking', peek: 'Peeks', precision: 'Precisión a la cabeza', combat: 'Combate' },
};

const time = (iso) => {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
};
const pct = (v) => (Number.isFinite(v) ? `${Math.round(v * 100)}%` : '—');

export function evaluationSeries(data) {
  const out = { targets: [], bots: [] };
  for (const e of data.profile?.evaluations ?? []) {
    const t = time(e.date);
    if (t === null || !out[e.variant] || !Number.isFinite(e.total)) continue;
    out[e.variant].push({ t, v: e.total });
  }
  return out;
}

export function phaseSeries(data, variant) {
  const ids = Object.keys(WEIGHTS[variant] ?? {});
  const out = Object.fromEntries(ids.map((id) => [id, []]));
  for (const e of data.profile?.evaluations ?? []) {
    if (e.variant !== variant) continue;
    const t = time(e.date);
    if (t === null) continue;
    for (const id of ids) if (Number.isFinite(e.subscores?.[id])) out[id].push({ t, v: e.subscores[id] });
  }
  return out;
}

export function endlessSeries(data) {
  const runs = data.records?.endless?.runs ?? [];
  return runs.map((r) => ({ t: time(r.date), v: r.wave, score: r.score })).filter((p) => p.t !== null && Number.isFinite(p.v));
}

export function coordinationSeries(data) {
  const rec = data.records?.coordination ?? {};
  const pts = (list) => (list ?? []).map((h) => ({ t: time(h.date), v: h.score })).filter((p) => p.t !== null && Number.isFinite(p.v));
  return {
    circuit: pts(rec.circuit?.history),
    drills: Object.fromEntries(Object.keys(DRILL_LABELS).map((id) => [id, pts(rec.drills?.[id]?.history)])),
  };
}

export function campaignSummary(data) {
  const best = data.campaign?.best ?? {};
  return CAMPAIGN_MAPS.map((m) => {
    const levels = levelsOf(m.id);
    const stars = levels.reduce((s, l) => s + (best[l.id]?.stars ?? 0), 0);
    return { id: m.id, name: m.name, stars, max: levels.length * 3, completed: levels.every((l) => (best[l.id]?.stars ?? 0) >= 1) };
  });
}

export function sessions(data) {
  const out = [];
  const push = (date, mode, title, result, detail = '') => {
    const t = time(date);
    if (t !== null) out.push({ t, date, mode, title, result, detail });
  };

  for (const e of data.profile?.evaluations ?? []) {
    const rank = getRank(e.rank);
    push(e.date, 'evaluation', `Evaluación · ${VARIANT_LABELS[e.variant] ?? e.variant}`, `${e.total}/100${rank ? ` · ${rank.name}` : ''}`);
  }

  for (const r of data.records?.endless?.runs ?? []) {
    push(r.date, 'endless', 'Modo infinito', `Oleada ${r.wave} · ${r.score} pts`, `${r.kills ?? 0} bajas · ${pct(r.accuracy)} precisión`);
  }

  const coord = data.records?.coordination ?? {};
  const circuitDates = new Set((coord.circuit?.history ?? []).map((h) => h.date));
  for (const h of coord.circuit?.history ?? []) {
    const parts = h.detail ? Object.entries(h.detail).map(([id, v]) => `${DRILL_LABELS[id] ?? id} ${v}`).join(' · ') : '';
    push(h.date, 'coordination', 'Coordinación · Circuito', `${h.score}/100`, parts);
  }
  for (const [id, entry] of Object.entries(coord.drills ?? {})) {
    for (const h of entry?.history ?? []) {
      if (circuitDates.has(h.date)) continue;
      push(h.date, 'coordination', `Coordinación · ${DRILL_LABELS[id] ?? id}`, `${h.score}/100`);
    }
  }

  for (const a of data.campaign?.recent ?? []) {
    const level = getLevel(a.levelId);
    const map = getMap(a.mapId);
    const title = level && map ? `Campaña · ${map.name} ${level.number} · ${level.name}` : 'Campaña';
    const stars = a.stars > 0 ? '★'.repeat(a.stars) : 'sin estrellas';
    push(a.date, 'campaign', title, `${a.rating}/100 · ${stars}`);
  }

  return out.sort((a, b) => b.t - a.t);
}

export function overview(data) {
  const evals = data.profile?.evaluations ?? [];
  const variants = data.profile?.variants ?? {};
  const endless = data.records?.endless ?? {};
  const coord = data.records?.coordination ?? {};
  const camp = campaignSummary(data);
  const all = sessions(data);
  return {
    sessions: all.length,
    trainingDays: new Set(all.map((s) => new Date(s.t).toDateString())).size,
    evaluations: evals.length,
    bestEvaluation: Math.max(0, ...Object.values(variants).map((v) => v?.best ?? 0)),
    endlessBestWave: endless.bestWave ?? 0,
    coordinationBest: coord.circuit?.best ?? 0,
    campaignStars: camp.reduce((s, m) => s + m.stars, 0),
    campaignMaxStars: camp.reduce((s, m) => s + m.max, 0),
  };
}
