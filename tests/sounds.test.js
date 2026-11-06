import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { WEAPONS, WEAPON_ORDER } from '../src/combat/weapons.js';

const DIR = path.resolve(__dirname, '../public/sounds');

describe('disparos grabados', () => {
  it('cada arma tiene su grabación y los enemigos la suya', () => {
    const files = [...new Set(WEAPON_ORDER.map((id) => WEAPONS[id].sound)), 'enemy'];
    for (const f of files) {
      const p = path.join(DIR, `${f}.mp3`);
      expect(fs.existsSync(p), f).toBe(true);
      expect(fs.statSync(p).size, f).toBeGreaterThan(2000);
    }
  });

  it('todas son CC0 y están documentadas', () => {
    const credits = JSON.parse(fs.readFileSync(path.join(DIR, 'credits.json'), 'utf8'));
    expect(credits.license).toBe('CC0 1.0');
    for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith('.mp3'))) {
      expect(Object.values(credits).some((c) => c?.file === f), f).toBe(true);
    }
  });

  it('pesan poco (se descargan al iniciar el audio)', () => {
    const total = fs.readdirSync(DIR).filter((x) => x.endsWith('.mp3')).reduce((s, f) => s + fs.statSync(path.join(DIR, f)).size, 0);
    expect(total).toBeLessThan(200 * 1024);
  });
});
