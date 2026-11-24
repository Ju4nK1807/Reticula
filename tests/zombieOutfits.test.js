import { describe, expect, it } from 'vitest';
import { OUTFITS, createZombieMaterial } from '../src/modes/zombies/zombieLook.js';

function seeded(seed = 7) {
  let s = seed;
  return () => ((s = (s * 9301 + 49297) % 233280) / 233280);
}

describe('atuendos de los zombis', () => {
  it('la horda mezcla payasos con ciudadanos de varios oficios', () => {
    const look = createZombieMaterial().look;
    const rng = seeded();
    const seen = new Map();
    for (let i = 0; i < 400; i++) {
      const o = look.randomize('normal', rng);
      seen.set(o, (seen.get(o) ?? 0) + 1);
    }
    for (const id of Object.keys(OUTFITS)) expect(seen.get(id) ?? 0).toBeGreaterThan(0);
    expect(seen.get('clown') / 400).toBeLessThan(0.5);
  });

  it('los ciudadanos no llevan traje ni cara de payaso y tienen su ropa', () => {
    const look = createZombieMaterial().look;
    const rng = seeded(3);
    for (let i = 0; i < 200; i++) {
      const o = look.randomize('normal', rng);
      const u = look.u;
      expect(u.uOutfit.value.x).toBe(OUTFITS[o].id);
      if (o === 'clown') {
        expect(u.uClown.value.x).toBe(1);
      } else {
        expect(u.uClown.value.x).toBe(0);
        expect(u.uClown.value.z).toBe(0);
      }
      if (OUTFITS[o].id >= 2) {
        expect(u.uOutfit.value.y).toBeGreaterThanOrEqual(36);
        expect(u.uOutfit.value.w).toBeGreaterThan(0);
      }
    }
  });

  it('El Jefe sigue siendo el payaso oscuro; los corredores suelen ser deportistas', () => {
    const look = createZombieMaterial().look;
    const rng = seeded(11);
    for (let i = 0; i < 20; i++) expect(look.randomize('boss', rng)).toBe('clown');
    let joggers = 0;
    for (let i = 0; i < 300; i++) if (look.randomize('runner', rng) === 'jogger') joggers++;
    expect(joggers).toBeGreaterThan(60);
    for (let i = 0; i < 200; i++) expect(look.randomize('brute', rng)).not.toBe('jogger');
  });

  it('el médico con bata lleva pantalón distinto; con pijama, del mismo color', () => {
    const look = createZombieMaterial().look;
    const rng = seeded(5);
    let coat = 0;
    let scrubs = 0;
    for (let i = 0; i < 600; i++) {
      if (look.randomize('normal', rng) !== 'medic') continue;
      const { uOutA, uOutB, uOutfit } = look.u;
      if (uOutfit.value.z > 0.5) {
        coat++;
        expect(uOutA.value.equals(uOutB.value)).toBe(false);
      } else {
        scrubs++;
        expect(uOutA.value.equals(uOutB.value)).toBe(true);
      }
    }
    expect(coat).toBeGreaterThan(0);
    expect(scrubs).toBeGreaterThan(0);
  });
});
