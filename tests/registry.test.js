import { describe, expect, it } from 'vitest';
import { PLANNED_MODES, getMode, listModes, registerMode, requiresRank } from '../src/modes/registry.js';

describe('registro de modos', () => {
  it('registra, ordena y aplica valores por defecto', () => {
    registerMode({ id: 't-b', title: 'B', order: 20, create: () => ({}) });
    registerMode({ id: 't-a', title: 'A', order: 10, create: () => ({}) });
    const ids = listModes().map((m) => m.id);
    expect(ids.indexOf('t-a')).toBeLessThan(ids.indexOf('t-b'));
    expect(getMode('t-a')).toMatchObject({ primary: false, desc: '', locked: null });
    expect(getMode('no-existe')).toBeNull();
  });

  it('rechaza ids repetidos y entradas incompletas', () => {
    registerMode({ id: 't-dup', title: 'X', create: () => ({}) });
    expect(() => registerMode({ id: 't-dup', title: 'X', create: () => ({}) })).toThrow();
    expect(() => registerMode({ id: 't-sin-create', title: 'X' })).toThrow();
    expect(() => registerMode(null)).toThrow();
  });

  it('requiresRank bloquea sin evaluación', () => {
    const game = (rank) => ({ store: { data: { profile: { rank } } } });
    expect(requiresRank(game(null))).toBe('Requiere evaluación');
    expect(requiresRank(game('oro'))).toBeNull();
  });

  it('los modos planeados tienen ids únicos', () => {
    const ids = PLANNED_MODES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
