import { describe, expect, it } from 'vitest';
import { PerfMeter, summarize } from '../src/core/PerfMeter.js';

describe('medidor de rendimiento', () => {
  it('60 FPS estables', () => {
    const r = summarize(new Float32Array(100).fill(1000 / 60), 100);
    expect(r.fps).toBe(60);
    expect(r.ms).toBeCloseTo(16.7, 1);
    expect(r.low1).toBe(60);
  });

  it('el 1 % low detecta los tirones aunque el promedio sea alto', () => {
    const t = new Float32Array(200).fill(1000 / 144);
    t[10] = 50; // dos tirones de 50 ms
    t[90] = 50;
    const r = summarize(t, 200);
    expect(r.fps).toBeGreaterThan(130);
    expect(r.low1).toBe(20);
  });

  it('informa cada medio segundo e ignora pausas largas', () => {
    const m = new PerfMeter();
    let now = 0;
    let reports = 0;
    m.tick(now);
    for (let i = 0; i < 120; i++) {
      now += 1000 / 60;
      if (m.tick(now)) reports++;
    }
    expect(reports).toBe(3); // 2 s de cuadros → informes a los 0.5, 1 y 1.5 s (el reloj arranca en el 1er cuadro)
    now += 5000; // pestaña oculta
    expect(m.tick(now)).toBeNull();
    expect(m.report.fps).toBe(60);
  });
});
