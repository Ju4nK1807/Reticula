import { describe, expect, it } from 'vitest';
import { DEFAULT_SAVE } from '../src/config/defaults.js';
import { SaveStore } from '../src/storage/SaveStore.js';
import { campaignSummary, coordinationSeries, endlessSeries, evaluationSeries, overview, phaseSeries, sessions } from '../src/stats/history.js';
import { memoryStorage } from './helpers.js';

const day = (d, h = 12) => new Date(Date.UTC(2026, 10, d, h)).toISOString();

function sampleData() {
  const data = structuredClone(DEFAULT_SAVE);
  data.profile.evaluations = [
    { date: day(1), variant: 'targets', total: 40, rank: 'plata', subscores: { flick: 50, tracking: 30, reaction: 40, multi: 45, precision: 35 } },
    { date: day(2), variant: 'bots', total: 30, rank: 'plata', subscores: { flick: 20, tracking: 30, peek: 40, precision: 25, combat: 35 } },
    { date: day(3), variant: 'targets', total: 52, rank: 'oro', subscores: { flick: 60, tracking: 50, reaction: 55, multi: 50, precision: 45 } },
    { date: 'fecha rota', variant: 'targets', total: 99 },
  ];
  data.profile.variants = { targets: { rank: 'oro', score: 52, best: 52 }, bots: { rank: 'plata', score: 30, best: 30 } };
  data.records.endless = { bestWave: 7, runs: [{ date: day(4), wave: 5, score: 9000, kills: 30, accuracy: 0.5 }, { date: day(5), wave: 7, score: 15000, kills: 50, accuracy: 0.6 }] };
  data.records.coordination = {
    circuit: { best: 60, history: [{ date: day(6), score: 60, detail: { sequence: 70, color: 50, peripheral: 60, dual: 60 } }] },
    drills: {
      sequence: { history: [{ date: day(6), score: 70 }, { date: day(7), score: 75 }] },
      color: { history: [{ date: day(6), score: 50 }] },
    },
  };
  data.campaign = {
    unlocked: {},
    best: { 'bodega-1': { rating: 80, stars: 3 }, 'bodega-2': { rating: 50, stars: 1 } },
    recent: [{ levelId: 'bodega-2', mapId: 'bodega', rating: 50, stars: 1, date: day(8) }],
  };
  return data;
}

describe('series de progreso', () => {
  it('evaluaciones por variante, ignorando fechas rotas', () => {
    const s = evaluationSeries(sampleData());
    expect(s.targets.map((p) => p.v)).toEqual([40, 52]);
    expect(s.bots.map((p) => p.v)).toEqual([30]);
  });

  it('sub-puntuación de cada fase en el orden de la evaluación', () => {
    const s = phaseSeries(sampleData(), 'bots');
    expect(Object.keys(s)).toEqual(['flick', 'tracking', 'peek', 'precision', 'combat']);
    expect(s.peek).toEqual([{ t: Date.parse(day(2)), v: 40 }]);
  });

  it('modo infinito, coordinación y campaña', () => {
    const d = sampleData();
    expect(endlessSeries(d).map((p) => p.v)).toEqual([5, 7]);
    const c = coordinationSeries(d);
    expect(c.circuit).toHaveLength(1);
    expect(c.drills.sequence.map((p) => p.v)).toEqual([70, 75]);
    expect(c.drills.dual).toEqual([]);
    const b = campaignSummary(d).find((m) => m.id === 'bodega');
    expect(b).toMatchObject({ stars: 4, max: 12, completed: false });
  });

  it('funciona con un guardado vacío', () => {
    const d = structuredClone(DEFAULT_SAVE);
    expect(sessions(d)).toEqual([]);
    expect(overview(d)).toMatchObject({ sessions: 0, trainingDays: 0, bestEvaluation: 0, campaignStars: 0, campaignMaxStars: 36 });
  });
});

describe('historial unificado', () => {
  const list = sessions(sampleData());

  it('ordena de la más reciente a la más antigua', () => {
    for (let i = 1; i < list.length; i++) expect(list[i - 1].t).toBeGreaterThanOrEqual(list[i].t);
    expect(list[0].mode).toBe('campaign');
  });

  it('incluye cada modo con un resultado legible', () => {
    const modes = new Set(list.map((s) => s.mode));
    expect([...modes].sort()).toEqual(['campaign', 'coordination', 'endless', 'evaluation']);
    expect(list.find((s) => s.mode === 'endless').result).toBe('Oleada 7 · 15000 pts');
    expect(list.find((s) => s.mode === 'campaign').title).toMatch(/Bodega 2/);
  });

  it('un circuito no se duplica con sus ejercicios del mismo momento', () => {
    const coord = list.filter((s) => s.mode === 'coordination');
    expect(coord.map((s) => s.title)).toEqual(['Coordinación · Secuencia', 'Coordinación · Circuito']);
  });

  it('cuenta los días entrenados', () => {
    expect(overview(sampleData()).trainingDays).toBe(8);
  });
});

describe('copia de seguridad', () => {
  it('exportar e importar conserva progreso y configuración', () => {
    const a = new SaveStore(memoryStorage());
    Object.assign(a.data, sampleData());
    a.data.settings.fov = 95;
    const json = a.exportData();
    const b = new SaveStore(memoryStorage());
    expect(b.importData(json)).toBe(true);
    expect(b.data.settings.fov).toBe(95);
    expect(b.data.records.endless.bestWave).toBe(7);
    expect(b.data.app).toBeUndefined();
  });

  it('rechaza archivos que no son de Retícula sin tocar nada', () => {
    const s = new SaveStore(memoryStorage());
    s.data.settings.fov = 88;
    expect(s.importData('no es json')).toBe(false);
    expect(s.importData('{"hola": 1}')).toBe(false);
    expect(s.importData('[1,2]')).toBe(false);
    expect(s.data.settings.fov).toBe(88);
  });

  it('una copia antigua se migra al importarla', () => {
    const s = new SaveStore(memoryStorage());
    const ok = s.importData({ version: 2, profile: { rank: 'bronce', variants: { targets: { rank: 'oro', score: 50, best: 55 } }, evaluations: [] } });
    expect(ok).toBe(true);
    expect(s.data.version).toBe(DEFAULT_SAVE.version);
    expect(s.data.profile.rank).toBe('oro');
  });
});
