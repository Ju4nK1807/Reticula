import { describe, expect, it } from 'vitest';
import {
  DRILL_IDS,
  MAX_HISTORY,
  PERIPHERAL_TARGET_RATE,
  PERIPHERAL_WINDOW,
  SEQUENCE_SIZE,
  circuitScore,
  colorScore,
  drillScore,
  dualScore,
  emptyCoordRecord,
  levelFor,
  nextSetSize,
  nextWindow,
  normalizeRecord,
  peripheralScore,
  recordScore,
  sequenceScore,
} from '../src/modes/coordination/coordScoring.js';

describe('dificultad adaptativa', () => {
  it('secuencia: serie limpia suma, dos errores restan, con límites', () => {
    expect(nextSetSize(5, 0)).toBe(6);
    expect(nextSetSize(5, 1)).toBe(5);
    expect(nextSetSize(5, 3)).toBe(4);
    expect(nextSetSize(SEQUENCE_SIZE.max, 0)).toBe(SEQUENCE_SIZE.max);
    expect(nextSetSize(SEQUENCE_SIZE.min, 4)).toBe(SEQUENCE_SIZE.min);
  });

  it('periferia: la ventana baja al acertar, sube al fallar y respeta los límites', () => {
    const w = PERIPHERAL_WINDOW.start;
    expect(nextWindow(w, true)).toBeLessThan(w);
    expect(nextWindow(w, false)).toBeGreaterThan(w);
    let low = w;
    for (let i = 0; i < 100; i++) low = nextWindow(low, true);
    expect(low).toBe(PERIPHERAL_WINDOW.min);
    let high = w;
    for (let i = 0; i < 100; i++) high = nextWindow(high, false);
    expect(high).toBe(PERIPHERAL_WINDOW.max);
  });

  it('periferia: la escalera converge al 75 % de aciertos', () => {
    expect(PERIPHERAL_TARGET_RATE).toBeCloseTo(0.75, 2);
    const run = (pattern) => {
      let w = PERIPHERAL_WINDOW.start;
      for (let i = 0; i < 400; i++) w = nextWindow(w, pattern(i));
      return w;
    };
    // 3 de cada 4: se mantiene estable cerca del inicio.
    expect(run((i) => i % 4 !== 3)).toBeCloseTo(PERIPHERAL_WINDOW.start, 1);
    // Por debajo del 75 % la ventana se alarga; por encima, se acorta.
    expect(run((i) => i % 2 === 0)).toBe(PERIPHERAL_WINDOW.max);
    expect(run((i) => i % 10 !== 9)).toBeLessThan(PERIPHERAL_WINDOW.min * PERIPHERAL_WINDOW.onMiss + 1e-9);
  });
});

describe('puntuación por ejercicio', () => {
  const perfect = {
    sequence: { tps: 2, accuracy: 1, orderErrors: 0, shots: 80 },
    color: { cps: 1.5, commissionRate: 0, switchMs: 300 },
    peripheral: { hitRate: 1, window: 0.45, avgMs: 300 },
    dual: { onTarget: 0.9, hitRate: 1, avgMs: 350 },
  };
  const awful = {
    sequence: { tps: 0, accuracy: 0, orderErrors: 30, shots: 40 },
    color: { cps: 0, commissionRate: 1, switchMs: null },
    peripheral: { hitRate: 0, window: 1.6, avgMs: null },
    dual: { onTarget: 0, hitRate: 0, avgMs: null },
  };

  it.each(DRILL_IDS)('%s: rendimiento profesional = 100 y nulo = 0', (id) => {
    expect(drillScore(id, perfect[id])).toBe(100);
    expect(drillScore(id, awful[id])).toBe(0);
  });

  it('más errores de orden bajan la secuencia', () => {
    const base = { tps: 1, accuracy: 0.8, shots: 50 };
    expect(sequenceScore({ ...base, orderErrors: 0 })).toBeGreaterThan(sequenceScore({ ...base, orderErrors: 5 }));
  });

  it('disparar a la figura prohibida baja el color', () => {
    const base = { cps: 0.8, switchMs: 700 };
    expect(colorScore({ ...base, commissionRate: 0 })).toBeGreaterThan(colorScore({ ...base, commissionRate: 0.1 }));
  });

  it('una ventana más corta sube la periferia', () => {
    const base = { hitRate: 0.8, avgMs: 600 };
    expect(peripheralScore({ ...base, window: 0.6 })).toBeGreaterThan(peripheralScore({ ...base, window: 1.2 }));
  });

  it('más tiempo sobre la esfera sube la doble tarea', () => {
    const base = { hitRate: 0.8, avgMs: 600 };
    expect(dualScore({ ...base, onTarget: 0.7 })).toBeGreaterThan(dualScore({ ...base, onTarget: 0.4 }));
  });

  it('valores inválidos no rompen la puntuación', () => {
    expect(drillScore('sequence', { tps: Number.NaN, accuracy: 0.5, orderErrors: 0, shots: 0 })).toBe(0);
    expect(() => drillScore('inexistente', {})).toThrow();
  });

  it('el circuito promedia los ejercicios completados', () => {
    expect(circuitScore({ sequence: 80, color: 60, peripheral: 40, dual: 20 })).toBe(50);
    expect(circuitScore({ sequence: 70 })).toBe(70);
    expect(circuitScore({})).toBe(0);
  });

  it('niveles por puntuación', () => {
    expect(levelFor(0).name).toBe('Inicial');
    expect(levelFor(30).name).toBe('Intermedio');
    expect(levelFor(69).name).toBe('Avanzado');
    expect(levelFor(70).name).toBe('Experto');
    expect(levelFor(100).name).toBe('Élite');
  });
});

describe('récords', () => {
  it('registra ejercicio y circuito, y avisa del récord', () => {
    const r = emptyCoordRecord();
    expect(recordScore(r, { kind: 'drill', id: 'color', score: 40 })).toBe(true);
    expect(recordScore(r, { kind: 'drill', id: 'color', score: 30 })).toBe(false);
    expect(r.drills.color).toMatchObject({ best: 40, last: 30, plays: 2 });
    expect(recordScore(r, { kind: 'circuit', score: 55 })).toBe(true);
    expect(r.circuit.best).toBe(55);
  });

  it('completa récords viejos o vacíos', () => {
    const r = { drills: { sequence: { best: 12 } } };
    recordScore(r, { kind: 'drill', id: 'dual', score: 5 });
    expect(r.drills.sequence.best).toBe(12);
    expect(r.drills.dual.plays).toBe(1);
    expect(normalizeRecord(undefined)).toEqual(emptyCoordRecord());
  });

  it(`guarda solo las últimas ${MAX_HISTORY} puntuaciones`, () => {
    const r = emptyCoordRecord();
    for (let i = 0; i < MAX_HISTORY + 5; i++) recordScore(r, { kind: 'drill', id: 'sequence', score: i });
    expect(r.drills.sequence.history).toHaveLength(MAX_HISTORY);
    expect(r.drills.sequence.history[0].score).toBe(5);
  });

  it('rechaza ejercicios desconocidos', () => {
    expect(() => recordScore(emptyCoordRecord(), { kind: 'drill', id: 'x', score: 1 })).toThrow();
  });
});
