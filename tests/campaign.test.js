import { describe, expect, it } from 'vitest';
import { RANKS } from '../src/config/ranks.js';
import { ALL_LEVELS, CAMPAIGN_MAPS, LEVELS_PER_MAP, botProfile, getLevel, getMap, levelsOf } from '../src/modes/campaign/campaignData.js';
import {
  DEMOTION_ATTEMPTS,
  MAX_RECENT,
  demotionSuggestion,
  emptyProgress,
  levelUnlocked,
  mapCompleted,
  mapState,
  missionRating,
  nextLevel,
  normalizeProgress,
  recommendedMap,
  recordAttempt,
  starsFor,
} from '../src/modes/campaign/progress.js';

const pass = (level, rating = 99) => ({ rating, stars: starsFor(rating, level.goals) });
const completeMap = (p, mapId) => levelsOf(mapId).forEach((l) => recordAttempt(p, l, pass(l)));

describe('datos de la campaña', () => {
  it('cada rango tiene exactamente un mapa recomendado', () => {
    for (const r of RANKS) expect(CAMPAIGN_MAPS.filter((m) => m.ranks.includes(r.id))).toHaveLength(1);
  });

  it(`${LEVELS_PER_MAP} niveles por mapa (entre 3 y 5), con ids únicos`, () => {
    for (const m of CAMPAIGN_MAPS) expect(levelsOf(m.id)).toHaveLength(LEVELS_PER_MAP);
    expect(LEVELS_PER_MAP).toBeGreaterThanOrEqual(3);
    expect(LEVELS_PER_MAP).toBeLessThanOrEqual(5);
    expect(new Set(ALL_LEVELS.map((l) => l.id)).size).toBe(ALL_LEVELS.length);
    expect(getLevel('ciudad-2').name).toBe(getMap('ciudad').levelNames[1]);
  });

  it('la dificultad sube nivel a nivel en toda la campaña', () => {
    ALL_LEVELS.forEach((l, i) => expect(l.difficulty).toBe(i));
  });

  it('las metas de estrellas suben, están ordenadas y son alcanzables', () => {
    for (const l of ALL_LEVELS) {
      expect(l.goals[0]).toBeLessThan(l.goals[1]);
      expect(l.goals[1]).toBeLessThan(l.goals[2]);
      expect(l.goals[2]).toBeLessThanOrEqual(97);
    }
    for (const m of CAMPAIGN_MAPS) {
      const goals = levelsOf(m.id).map((l) => l.goals[0]);
      for (let i = 1; i < goals.length; i++) expect(goals[i]).toBeGreaterThan(goals[i - 1]);
    }
    const firsts = CAMPAIGN_MAPS.map((m) => levelsOf(m.id)[0].goals[0]);
    for (let i = 1; i < firsts.length; i++) expect(firsts[i]).toBeGreaterThan(firsts[i - 1]);
  });

  it('los bots son más pequeños, rápidos e impredecibles con cada nivel', () => {
    for (let d = 1; d < ALL_LEVELS.length; d++) {
      const [a, b] = [botProfile(d - 1), botProfile(d)];
      expect(b.scale).toBeLessThanOrEqual(a.scale);
      expect(b.strafe.speed[1]).toBeGreaterThanOrEqual(a.strafe.speed[1]);
      expect(b.strafe.change[0]).toBeLessThanOrEqual(a.strafe.change[0]); // cambia de dirección más seguido
      expect(b.jiggleChance).toBeGreaterThanOrEqual(a.jiggleChance);
      expect(b.shooter.reaction).toBeLessThanOrEqual(a.shooter.reaction);
      expect(b.shooter.accuracy).toBeGreaterThanOrEqual(a.shooter.accuracy);
    }
    expect(botProfile(0).scale).toBe(1);
    expect(botProfile(11).scale).toBeLessThan(0.8);
  });
});

describe('puntuación de misión', () => {
  const base = { total: 10, kills: 10, shots: 20, hits: 15, head: 8, health: 100, died: false, time: 40, timeLimit: 80 };

  it('misión perfecta = 100 y vacía = 0', () => {
    expect(missionRating({ ...base, hits: 20, head: 20, time: 0 })).toBe(100);
    expect(missionRating({ total: 10, kills: 0, shots: 0, hits: 0, head: 0, health: 0, died: true, time: 80, timeLimit: 80 })).toBe(0);
  });

  it('dejar escapar enemigos, perder vida o morir baja la nota', () => {
    const full = missionRating(base);
    expect(missionRating({ ...base, kills: 6 })).toBeLessThan(full);
    expect(missionRating({ ...base, health: 20 })).toBeLessThan(full);
    expect(missionRating({ ...base, died: true })).toBeLessThan(full);
  });

  it('morir deja la misión sin estrellas', () => {
    expect(starsFor(99, [40, 60, 80], true)).toBe(0);
    expect(starsFor(65, [40, 60, 80])).toBe(2);
    expect(starsFor(39, [40, 60, 80])).toBe(0);
  });

  it('valores raros no rompen la nota', () => {
    expect(missionRating({ total: 0, kills: 0, shots: 0, hits: 0, head: 0, health: Number.NaN, time: 0, timeLimit: 0 })).toBe(0);
  });
});

describe('progreso y desbloqueos', () => {
  it('mapa recomendado por rango', () => {
    expect(recommendedMap('bronce').id).toBe('bodega');
    expect(recommendedMap('plata').id).toBe('bodega');
    expect(recommendedMap('oro').id).toBe('ciudad');
    expect(recommendedMap('diamante').id).toBe('ciudad');
    expect(recommendedMap('elite').id).toBe('arena');
  });

  it('se abren el mapa del rango y los inferiores; los superiores no', () => {
    const p = emptyProgress();
    const [bodega, ciudad, arena] = CAMPAIGN_MAPS;
    expect(mapState(p, bodega, 'bronce').unlocked).toBe(true);
    expect(mapState(p, ciudad, 'bronce').unlocked).toBe(false);
    expect(mapState(p, ciudad, 'bronce').reason).toMatch(/Bodega/);
    expect(mapState(p, bodega, 'oro').unlocked).toBe(true);
    expect(mapState(p, ciudad, 'oro').unlocked).toBe(true);
    expect(mapState(p, arena, 'oro').unlocked).toBe(false);
    expect(mapState(p, arena, 'elite').unlocked).toBe(true);
  });

  it('completar un mapa abre el siguiente aunque el rango no llegue', () => {
    const p = emptyProgress();
    completeMap(p, 'bodega');
    expect(mapCompleted(p, CAMPAIGN_MAPS[0])).toBe(true);
    expect(mapState(p, CAMPAIGN_MAPS[1], 'bronce').unlocked).toBe(true);
    expect(mapState(p, CAMPAIGN_MAPS[2], 'bronce').unlocked).toBe(false);
  });

  it('un nivel se abre al conseguir la meta (1 estrella) del anterior', () => {
    const p = emptyProgress();
    const [l1, l2] = levelsOf('bodega');
    expect(levelUnlocked(p, l1, 'bronce')).toBe(true);
    expect(levelUnlocked(p, l2, 'bronce')).toBe(false);
    const fail = recordAttempt(p, l1, { rating: l1.goals[0] - 1, stars: 0 });
    expect(fail.unlockedLevel).toBeNull();
    expect(levelUnlocked(p, l2, 'bronce')).toBe(false);
    const ok = recordAttempt(p, l1, pass(l1, l1.goals[0]));
    expect(ok.unlockedLevel).toBe(l2.id);
    expect(levelUnlocked(p, l2, 'bronce')).toBe(true);
  });

  it('el mejor resultado y las estrellas no bajan', () => {
    const p = emptyProgress();
    const l = levelsOf('bodega')[0];
    recordAttempt(p, l, { rating: 90, stars: 3 });
    const r = recordAttempt(p, l, { rating: 30, stars: 0 });
    expect(r.isBest).toBe(false);
    expect(p.best[l.id]).toMatchObject({ rating: 90, stars: 3, plays: 2, last: 30 });
  });

  it('avisa al completar un mapa por primera vez y encadena con el siguiente', () => {
    const p = emptyProgress();
    const levels = levelsOf('bodega');
    let last = null;
    for (const l of levels) last = recordAttempt(p, l, pass(l));
    expect(last.completedMap).toBe('bodega');
    expect(last.unlockedLevel).toBe('ciudad-1');
    expect(recordAttempt(p, levels[0], pass(levels[0])).completedMap).toBeNull();
    expect(nextLevel(getLevel('arena-4'))).toBeNull();
  });

  it(`guarda solo los últimos ${MAX_RECENT} intentos y completa guardados viejos`, () => {
    const p = normalizeProgress({ unlocked: {}, best: {} });
    const l = levelsOf('bodega')[0];
    for (let i = 0; i < MAX_RECENT + 4; i++) recordAttempt(p, l, { rating: i, stars: 0 });
    expect(p.recent).toHaveLength(MAX_RECENT);
  });
});

describe('sugerencia de bajar de mapa', () => {
  const ciudad = CAMPAIGN_MAPS[1];
  const c1 = levelsOf('ciudad')[0];

  it(`tras ${DEMOTION_ATTEMPTS} intentos seguidos muy por debajo de la meta`, () => {
    const p = emptyProgress();
    for (let i = 0; i < DEMOTION_ATTEMPTS; i++) recordAttempt(p, c1, { rating: 20, stars: 0 });
    expect(demotionSuggestion(p, ciudad).id).toBe('bodega');
  });

  it('no sugiere si un intento consiguió estrella, si son pocos o si la nota está cerca de la meta', () => {
    const p1 = emptyProgress();
    recordAttempt(p1, c1, { rating: 20, stars: 0 });
    recordAttempt(p1, c1, { rating: 20, stars: 0 });
    expect(demotionSuggestion(p1, ciudad)).toBeNull();
    recordAttempt(p1, c1, pass(c1));
    expect(demotionSuggestion(p1, ciudad)).toBeNull();

    const p2 = emptyProgress();
    for (let i = 0; i < DEMOTION_ATTEMPTS; i++) recordAttempt(p2, c1, { rating: c1.goals[0] - 3, stars: 0 });
    expect(demotionSuggestion(p2, ciudad)).toBeNull();
  });

  it('en el primer mapa nunca sugiere bajar', () => {
    const p = emptyProgress();
    const b1 = levelsOf('bodega')[0];
    for (let i = 0; i < 5; i++) recordAttempt(p, b1, { rating: 0, stars: 0 });
    expect(demotionSuggestion(p, CAMPAIGN_MAPS[0])).toBeNull();
  });
});
