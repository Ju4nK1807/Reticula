import { describe, expect, it } from 'vitest';
import { VOICES } from '../src/audio/zombieVoices.js';
import { DEFAULT_SAVE } from '../src/config/defaults.js';

describe('voces de zombi', () => {
  it('cada tipo de zombi tiene su voz, más mordida, muerte y rugido al aparecer', () => {
    for (const k of ['groan', 'moan', 'shriek', 'brute', 'roar', 'gurgle', 'snarl', 'death']) expect(VOICES[k], k).toBeTruthy();
  });

  it('los perfiles están completos y en rangos que suenan (sin ceros que rompan las rampas)', () => {
    for (const [k, v] of Object.entries(VOICES)) {
      expect(v.f[0], k).toBeGreaterThan(20);
      expect(v.f[1], k).toBeGreaterThanOrEqual(v.f[0]);
      expect(v.dur[0], k).toBeGreaterThan(0.2);
      expect(v.bend.length, k).toBeGreaterThanOrEqual(2);
      expect(v.bend.every((b) => b > 0), k).toBe(true);
      expect(v.formants.length, k).toBeGreaterThanOrEqual(2);
      expect(v.formants.every((f) => f.length === 3 && f.every((hz) => hz > 100 && hz < 5000)), k).toBe(true);
      expect(v.q, k).toHaveLength(3);
      expect(v.fryDepth, k).toBeGreaterThanOrEqual(0);
      expect(v.fryDepth, k).toBeLessThanOrEqual(1);
      expect(v.attack, k).toBeGreaterThan(0);
      expect(v.attack, k).toBeLessThan(0.6);
      expect(v.gain, k).toBeGreaterThan(0);
      expect(v.gain, k).toBeLessThanOrEqual(1);
    }
  });

  it('el bruto suena más grave que el caminante, y el corredor más agudo', () => {
    expect(VOICES.brute.f[1]).toBeLessThan(VOICES.groan.f[0]);
    expect(VOICES.shriek.f[0]).toBeGreaterThan(VOICES.moan.f[1]);
  });
});

describe('música', () => {
  it('tiene su propio volumen en los ajustes (a la mitad por defecto)', () => {
    expect(DEFAULT_SAVE.settings?.audio?.music ?? DEFAULT_SAVE.audio?.music).toBe(0.5);
  });
});
