// Caja fuerte (código del Jefe), rondas del Jefe y acabados de las armas.
import { describe, expect, it } from 'vitest';
import { SAFE, SafeLock, makeSafeCode } from '../src/modes/zombies/safe.js';
import { isBossRound, waveConfig, waveRoster } from '../src/modes/zombies/zombieData.js';
import { ROUNDS } from '../src/modes/zombies/roundConfig.js';
import { FINISHES, WEAPON_MODELS, finishOf, materialRole } from '../src/combat/weaponModels.js';
import { ALL_WEAPONS } from '../src/combat/weapons.js';

describe('código de la caja fuerte', () => {
  it('tiene SAFE.digits cifras y cambia con el azar', () => {
    const codes = new Set();
    for (let i = 0; i < 20; i++) {
      const c = makeSafeCode();
      expect(c).toMatch(new RegExp(`^[0-9]{${SAFE.digits}}$`));
      codes.add(c);
    }
    expect(codes.size).toBeGreaterThan(10);
    expect(makeSafeCode(() => 0)).toBe('0'.repeat(SAFE.digits));
    expect(makeSafeCode(() => 0.9999)).toBe('9'.repeat(SAFE.digits));
  });

  it('se escribe, se borra y solo abre con el código correcto', () => {
    const s = new SafeLock('4817');
    expect(s.submit()).toBe('short');
    for (const d of '48') s.press(d);
    s.back();
    expect(s.entry).toBe('4');
    for (const d of '81799') s.press(d); // no pasa de 4 cifras
    expect(s.entry).toBe('4817');
    expect(s.submit()).toBe('open');
    expect(s.unlocked).toBe(true);
    expect(s.submit()).toBe('already');
  });

  it('un código equivocado bloquea el teclado SAFE.lockout segundos', () => {
    const s = new SafeLock('1234');
    for (const d of '9999') s.press(d);
    expect(s.submit()).toBe('wrong');
    expect(s.entry).toBe('');
    expect(s.press('1')).toBe(false);
    expect(s.submit()).toBe('locked');
    s.update(SAFE.lockout + 0.01);
    for (const d of '1234') s.press(d);
    expect(s.submit()).toBe('open');
    expect(s.fails).toBe(1);
  });

  it('el Jefe lo revela', () => {
    const s = new SafeLock('0042');
    expect(s.known).toBe(false);
    expect(s.reveal()).toBe('0042');
    expect(s.known).toBe(true);
  });
});

describe('rondas del Jefe', () => {
  it(`llega en la ronda ${ROUNDS.bossFrom} y luego cada ${ROUNDS.bossEvery}`, () => {
    const rounds = Array.from({ length: 20 }, (_, i) => i + 1).filter(isBossRound);
    expect(rounds[0]).toBe(ROUNDS.bossFrom);
    for (let i = 1; i < rounds.length; i++) expect(rounds[i] - rounds[i - 1]).toBe(ROUNDS.bossEvery);
  });

  it('su ronda trae exactamente un Jefe y la cantidad total no cambia', () => {
    for (const diff of ['facil', 'normal', 'dificil', 'locura']) {
      for (let w = 1; w <= 12; w++) {
        const cfg = waveConfig(w, diff);
        const roster = waveRoster(cfg, () => 0.5);
        expect(roster.length, `${diff} ${w}`).toBe(cfg.count);
        expect(roster.filter((t) => t === 'boss').length, `${diff} ${w}`).toBe(isBossRound(w) ? 1 : 0);
      }
    }
  });
});

describe('acabados de las armas', () => {
  it('cada arma tiene su propio acabado, con colores distintos', () => {
    const frames = new Set();
    for (const id of ALL_WEAPONS) {
      expect(WEAPON_MODELS[id].finish, id).toBe(id);
      const f = FINISHES[id];
      expect(f, id).toBeTruthy();
      expect(f.hud, id).toMatch(/^#[0-9a-f]{6}$/i);
      frames.add(`${f.frame.color}|${f.metal.color}|${f.wood.color}`);
    }
    expect(frames.size).toBe(ALL_WEAPONS.length);
  });

  it('las armas que comparten modelo no comparten color', () => {
    const byFile = {};
    for (const id of ALL_WEAPONS) (byFile[WEAPON_MODELS[id].file] ??= []).push(finishOf(id).frame.color);
    for (const [file, colors] of Object.entries(byFile)) expect(new Set(colors).size, file).toBe(colors.length);
  });

  it('reconoce el papel de cada material del modelo (el negro claro es armazón, no un detalle)', () => {
    expect(materialRole('M_PCL_Flat_Black_Lighter')).toBe('frame');
    expect(materialRole('M_PCL_Flat_Black')).toBe('frame');
    expect(materialRole('M_PCL_Flat_Grey_Darker')).toBe('metal');
    expect(materialRole('M_PCL_Flat_Grey_Dark')).toBe('metal');
    expect(materialRole('M_PCL_Flat_Grey_Light')).toBe('light');
    expect(materialRole('M_PCL_Flat_White')).toBe('light');
    expect(materialRole('M_PCL_Flat_Brown.Chestnut')).toBe('wood');
    expect(materialRole('M_PCL_Flat_Yellow.Brass')).toBe('brass');
    expect(materialRole('M_PCL_Flat_Red.Brick')).toBe('red');
  });
});
