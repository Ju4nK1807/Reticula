import { describe, expect, it } from 'vitest';
import { RANKS, rankForScore } from '../src/config/ranks.js';
import { GAMES, cmPer360, convertSens, valueForCm } from '../src/config/sensitivity.js';
import { WEIGHTS } from '../src/modes/evaluation/scoring.js';

describe('rangos', () => {
  it('umbrales: Bronce 0, Plata 30, Oro 48, Diamante 64, Élite 80', () => {
    expect(RANKS.map((r) => [r.id, r.min])).toEqual([
      ['bronce', 0],
      ['plata', 30],
      ['oro', 48],
      ['diamante', 64],
      ['elite', 80],
    ]);
  });

  it.each([
    [0, 'bronce'],
    [29, 'bronce'],
    [30, 'plata'],
    [47, 'plata'],
    [48, 'oro'],
    [63, 'oro'],
    [64, 'diamante'],
    [79, 'diamante'],
    [80, 'elite'],
    [100, 'elite'],
    [-5, 'bronce'],
  ])('%i puntos → %s', (score, id) => {
    expect(rankForScore(score).id).toBe(id);
  });
});

describe('sensibilidad', () => {
  it('CS2 1.0 a 800 DPI ≈ 51.95 cm/360', () => {
    expect(cmPer360('cs2', 1, 800)).toBeCloseTo(51.95, 1);
  });

  it('Valorant = CS2 / 3.1818', () => {
    expect(convertSens('cs2', 2, 'valorant')).toBeCloseTo(2 / (0.07 / 0.022), 9);
  });

  it('convertir ida y vuelta conserva el valor entre todos los juegos', () => {
    for (const from of Object.keys(GAMES)) {
      for (const to of Object.keys(GAMES)) {
        expect(convertSens(to, convertSens(from, 1.7, to), from)).toBeCloseTo(1.7, 9);
      }
    }
  });

  it('valueForCm es la inversa de cmPer360', () => {
    for (const game of Object.keys(GAMES)) {
      const v = valueForCm(game, 34.6, 1600);
      expect(cmPer360(game, v, 1600)).toBeCloseTo(34.6, 6);
    }
  });

  it('un juego desconocido usa la escala Source', () => {
    expect(cmPer360('desconocido', 1, 800)).toBeCloseTo(cmPer360('reticula', 1, 800), 9);
  });
});

describe('puntuación', () => {
  it('los pesos de cada variante suman 1', () => {
    for (const weights of Object.values(WEIGHTS)) {
      expect(Object.values(weights).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
    }
  });
});
