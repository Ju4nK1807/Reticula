import { describe, expect, it } from 'vitest';
import {
  BASE_POINTS,
  MAX_RUNS,
  MEDKIT_CHANCE,
  MEDKIT_CHANCE_LOW,
  PERFECT_WAVE_BONUS,
  WAVE_CLEAR_BONUS,
  emptyRecord,
  medkitChance,
  streakBonus,
  updateRecord,
  waveClearBonus,
  waveConfig,
  wavePoints,
} from '../src/modes/endless/waves.js';

const waves = Array.from({ length: 60 }, (_, i) => waveConfig(i + 1));

describe('curva de dificultad', () => {
  it('la oleada 1 es accesible: pocos bots, de tamaño real y lentos', () => {
    const w = waves[0];
    expect(w.count).toBe(4);
    expect(w.maxAlive).toBe(2);
    expect(w.bot.scale).toBe(1);
    expect(w.bot.shooter.reaction).toBeGreaterThanOrEqual(0.75);
  });

  it('cada oleada es igual o más difícil que la anterior', () => {
    for (let i = 1; i < waves.length; i++) {
      const [a, b] = [waves[i - 1], waves[i]];
      expect(b.count).toBeGreaterThanOrEqual(a.count);
      expect(b.maxAlive).toBeGreaterThanOrEqual(a.maxAlive);
      expect(b.bot.scale).toBeLessThanOrEqual(a.bot.scale);
      expect(b.bot.walkSpeed).toBeGreaterThanOrEqual(a.bot.walkSpeed);
      expect(b.bot.strafe.speed[1]).toBeGreaterThanOrEqual(a.bot.strafe.speed[1]);
      expect(b.bot.shooter.reaction).toBeLessThanOrEqual(a.bot.shooter.reaction);
      expect(b.bot.shooter.accuracy).toBeGreaterThanOrEqual(a.bot.shooter.accuracy);
      expect(b.spawnGap[0]).toBeLessThanOrEqual(a.spawnGap[0]);
    }
  });

  it('todo tiene un tope: el juego sigue siendo jugable en oleadas altas', () => {
    const w = waves.at(-1);
    expect(w.count).toBe(40);
    expect(w.maxAlive).toBe(8);
    expect(w.bot.scale).toBe(0.62);
    expect(w.bot.shooter.reaction).toBe(0.28);
    expect(w.bot.shooter.accuracy).toBe(0.5);
    expect(w.bot.shooter.damage).toBe(14);
    expect(w.spawnGap[0]).toBeLessThanOrEqual(w.spawnGap[1]);
  });

  it('acepta valores raros sin romperse', () => {
    expect(waveConfig(0).wave).toBe(1);
    expect(waveConfig(-3).count).toBe(4);
    expect(waveConfig(2.7).wave).toBe(2);
  });
});

describe('puntuación', () => {
  it('los puntos positivos se multiplican por oleada y el fallo no', () => {
    const p1 = wavePoints(waveConfig(1));
    const p11 = wavePoints(waveConfig(11));
    expect(p1).toEqual(BASE_POINTS);
    expect(p11.kill).toBe(BASE_POINTS.kill * 2);
    expect(p11.miss).toBe(BASE_POINTS.miss);
  });

  it('la racha suma desde 2 bajas y tiene tope', () => {
    expect(streakBonus(0)).toBe(0);
    expect(streakBonus(1)).toBe(0);
    expect(streakBonus(2)).toBe(20);
    expect(streakBonus(50)).toBe(streakBonus(10));
  });

  it('una oleada perfecta da bonificación extra', () => {
    expect(waveClearBonus(3, 10)).toBe(WAVE_CLEAR_BONUS * 3);
    expect(waveClearBonus(3, 0)).toBe((WAVE_CLEAR_BONUS + PERFECT_WAVE_BONUS) * 3);
  });

  it('con poca vida es más probable que caiga un botiquín', () => {
    expect(medkitChance(100)).toBe(MEDKIT_CHANCE);
    expect(medkitChance(20)).toBe(MEDKIT_CHANCE_LOW);
  });
});

describe('récords', () => {
  const run = (wave, score, kills = 0, bestStreak = 0) => ({ wave, score, kills, bestStreak });

  it('marca los récords superados y los conserva', () => {
    const r = emptyRecord();
    expect(updateRecord(r, run(3, 1500, 10, 4))).toEqual({ wave: true, score: true, kills: true, streak: true });
    expect(updateRecord(r, run(2, 2000, 5, 1))).toEqual({ wave: false, score: true, kills: false, streak: false });
    expect(r).toMatchObject({ bestWave: 3, bestScore: 2000, bestKills: 10, bestStreak: 4, totalRuns: 2 });
  });

  it('completa récords guardados con una versión anterior', () => {
    const r = { bestWave: 5 };
    updateRecord(r, run(1, 10));
    expect(r).toMatchObject({ bestWave: 5, bestScore: 10, totalRuns: 1 });
    expect(r.runs).toHaveLength(1);
  });

  it(`guarda solo las últimas ${MAX_RUNS} partidas`, () => {
    const r = emptyRecord();
    for (let i = 1; i <= MAX_RUNS + 7; i++) updateRecord(r, run(i, i));
    expect(r.runs).toHaveLength(MAX_RUNS);
    expect(r.runs[0].wave).toBe(8);
    expect(r.totalRuns).toBe(MAX_RUNS + 7);
  });
});
