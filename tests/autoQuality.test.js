import { describe, expect, it } from 'vitest';
import { AUTO_SCALE, AutoQuality, guessDetail } from '../src/gfx/AutoQuality.js';

// Alimenta `seconds` de cuadros de `ms` y devuelve los cambios que pidió.
function feed(aq, ms, seconds) {
  const changes = [];
  const n = Math.round((seconds * 1000) / ms);
  for (let i = 0; i < n; i++) {
    const c = aq.sample(ms);
    if (c) changes.push(c);
  }
  return changes;
}

describe('calidad automática (resolución dinámica)', () => {
  it('si va lento baja la escala de a poco; si va muy lento, más rápido', () => {
    const aq = new AutoQuality({ detail: 'alta', scale: 1 });
    const [first] = feed(aq, 19.5, 0.8); // ~51 FPS: algo lento
    expect(first).toEqual({ detail: 'alta', scale: 0.95 });
    const aq2 = new AutoQuality({ detail: 'alta', scale: 1 });
    const [big] = feed(aq2, 30, 0.8); // ~33 FPS: muy lento
    expect(big.scale).toBeCloseTo(0.9);
  });

  it('en la escala mínima baja el detalle y recupera algo de escala', () => {
    const aq = new AutoQuality({ detail: 'alta', scale: AUTO_SCALE.min });
    const [c] = feed(aq, 25, 0.8);
    expect(c.detail).toBe('media');
    expect(c.scale).toBeCloseTo(AUTO_SCALE.min + 0.15);
  });

  it('con todo al mínimo no pide más cambios', () => {
    const aq = new AutoQuality({ detail: 'baja', scale: AUTO_SCALE.min });
    expect(feed(aq, 40, 3)).toEqual([]);
  });

  it('estable en el objetivo, prueba a subir la escala; si empeora lo deshace y espera el doble', () => {
    const aq = new AutoQuality({ detail: 'media', scale: 0.8 });
    const up = feed(aq, 16.7, 4.6);
    expect(up.at(-1)).toEqual({ detail: 'media', scale: 0.85 });
    // Tras subir va lento: vuelve a 0.8.
    const back = feed(aq, 20, 0.8);
    expect(back[0]).toEqual({ detail: 'media', scale: 0.8 });
    // Ahora necesita 8 s estables (no 4) para volver a probar.
    expect(feed(aq, 16.7, 5)).toEqual([]);
    expect(feed(aq, 16.7, 3.5).at(-1)?.scale).toBeCloseTo(0.85);
  });

  it('una subida que sale bien se queda', () => {
    const aq = new AutoQuality({ detail: 'alta', scale: 0.9 });
    feed(aq, 16.7, 4.6);
    expect(aq.scale).toBeCloseTo(0.95);
    expect(feed(aq, 16.7, 0.8)).toEqual([]);
    expect(aq.scale).toBeCloseTo(0.95);
  });

  it('nunca sube el detalle por su cuenta ni pasa de la escala máxima', () => {
    const aq = new AutoQuality({ detail: 'media', scale: 1 });
    const changes = feed(aq, 10, 30);
    expect(changes).toEqual([]);
    expect(aq.detail).toBe('media');
  });

  it('ignora los tirones aislados (cargas, cambio de pestaña)', () => {
    const aq = new AutoQuality({ detail: 'alta', scale: 1 });
    for (let i = 0; i < 10; i++) expect(aq.sample(900)).toBeNull();
    expect(feed(aq, 16.7, 1)).toEqual([]);
  });

  it('elige el detalle inicial según la GPU', () => {
    expect(guessDetail('ANGLE (NVIDIA, NVIDIA GeForce RTX 4050 Laptop GPU Direct3D11)')).toBe('alta');
    expect(guessDetail('ANGLE (AMD, AMD Radeon RX 6600 Direct3D11)')).toBe('alta');
    expect(guessDetail('ANGLE (Intel, Intel(R) UHD Graphics (0x0000A7A8) Direct3D11)')).toBe('media');
    expect(guessDetail('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device))')).toBe('baja');
    expect(guessDetail('Adreno (TM) 640', { touch: true })).toBe('baja');
    expect(guessDetail('Adreno (TM) 740', { touch: true })).toBe('media');
    expect(guessDetail('')).toBe('media');
  });
});
