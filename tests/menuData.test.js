import { describe, expect, it } from 'vitest';
import { DEFAULT_SAVE } from '../src/config/defaults.js';
import { STALE_EVALUATION_DAYS, modeSummary, nextStep } from '../src/ui/menuData.js';

const NOW = Date.UTC(2026, 10, 10);
const daysAgo = (n) => new Date(NOW - n * 864e5).toISOString();
const save = (over = {}) => ({ ...structuredClone(DEFAULT_SAVE), ...over });
const evaluated = (days = 1, extra = {}) =>
  save({ profile: { ...DEFAULT_SAVE.profile, rank: 'plata', variants: { targets: { rank: 'plata', score: 40, best: 40, date: daysAgo(days) }, bots: { rank: 'plata', score: 32, best: 32, date: daysAgo(days) } } }, ...extra });

describe('siguiente paso del menú', () => {
  it('un jugador nuevo empieza por la evaluación con dianas', () => {
    expect(nextStep(save(), NOW)).toMatchObject({ modeId: 'evaluation-targets', title: 'Descubre tu rango' });
  });

  it('si falta una variante, propone completarla', () => {
    const d = save({ profile: { ...DEFAULT_SAVE.profile, variants: { targets: { rank: 'oro', score: 50, best: 50, date: daysAgo(1) } } } });
    expect(nextStep(d, NOW).modeId).toBe('evaluation-bots');
  });

  it(`si la evaluación tiene más de ${STALE_EVALUATION_DAYS} días, propone reevaluar`, () => {
    const s = nextStep(evaluated(STALE_EVALUATION_DAYS + 3), NOW);
    expect(s.modeId).toBe('evaluation-targets');
    expect(s.desc).toMatch(/10 días/);
  });

  it('luego, el siguiente nivel de campaña empezando por el mapa de su rango', () => {
    expect(nextStep(evaluated(), NOW)).toMatchObject({ modeId: 'campaign', title: 'Nivel 1: Turno de noche' });
    const d = evaluated(1, { campaign: { unlocked: {}, best: { 'bodega-1': { rating: 80, stars: 2 } }, recent: [] } });
    expect(nextStep(d, NOW).title).toBe('Nivel 2: Pasillos');
    const oro = evaluated();
    oro.profile.rank = 'oro';
    expect(nextStep(oro, NOW).eyebrow).toBe('Campaña · Ciudad');
  });

  it('con la campaña completa, propone el modo infinito con su récord', () => {
    const best = {};
    for (const m of ['bodega', 'ciudad', 'arena']) for (let i = 1; i <= 4; i++) best[`${m}-${i}`] = { rating: 90, stars: 3 };
    const d = evaluated(1, { campaign: { unlocked: {}, best, recent: [] }, records: { endless: { bestWave: 12 } } });
    expect(nextStep(d, NOW)).toMatchObject({ modeId: 'endless', title: 'Supera la oleada 12' });
  });
});

describe('dato de cada modo', () => {
  it('evaluaciones, campaña, coordinación e infinito', () => {
    const d = evaluated(1, {
      campaign: { unlocked: {}, best: { 'bodega-1': { stars: 3 } }, recent: [] },
      records: { coordination: { circuit: { best: 61, plays: 2 } }, endless: { bestWave: 7, bestScore: 9000, totalRuns: 3 } },
    });
    expect(modeSummary('evaluation-targets', d).text).toBe('Plata · 40');
    expect(modeSummary('campaign', d).text).toBe('★ 3/36');
    expect(modeSummary('coordination', d).text).toBe('Índice 61');
    expect(modeSummary('endless', d).text).toBe('Oleada 7');
    expect(modeSummary('evaluation-bots', save()).text).toBe('Sin evaluar');
    expect(modeSummary('desconocido', d)).toBeNull();
  });
});
