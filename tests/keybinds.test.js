import { describe, expect, it } from 'vitest';
import { ACTIONS, DEFAULT_KEYS, actionFor, codeLabel, isReservedCode, keyLabel, normalizeKeys, rebind } from '../src/config/keybinds.js';
import { shadowSizeFor } from '../src/gfx/lighting.js';

describe('controles reasignables', () => {
  it('cada acción tiene su tecla por defecto y no se repiten', () => {
    const codes = ACTIONS.map((a) => DEFAULT_KEYS[a.id]);
    expect(new Set(codes).size).toBe(codes.length);
    expect(actionFor(DEFAULT_KEYS, 'KeyR')).toBe('reload');
    expect(actionFor(DEFAULT_KEYS, 'KeyP')).toBeNull();
  });

  it('asignar una tecla usada intercambia las dos acciones', () => {
    const keys = { ...DEFAULT_KEYS };
    expect(rebind(keys, 'crouch', 'KeyR')).toBe('reload');
    expect(keys.crouch).toBe('KeyR');
    expect(keys.reload).toBe('KeyC');
    expect(rebind(keys, 'jump', 'KeyX')).toBeNull();
    expect(actionFor(keys, 'KeyX')).toBe('jump');
  });

  it('Esc y 1-9 están reservadas', () => {
    expect(isReservedCode('Escape')).toBe(true);
    expect(isReservedCode('Digit3')).toBe(true);
    expect(isReservedCode('KeyQ')).toBe(false);
    expect(() => rebind({ ...DEFAULT_KEYS }, 'reload', 'Digit1')).toThrow();
  });

  it('normaliza guardados viejos o corruptos', () => {
    expect(normalizeKeys(undefined)).toEqual(DEFAULT_KEYS);
    const fixed = normalizeKeys({ reload: 'KeyW', forward: 'KeyW', jump: 'Escape', melee: 42 });
    // Dos acciones con la misma tecla: la que va primero se la queda y la otra vuelve a la suya.
    expect(fixed.forward).toBe('KeyW');
    expect(fixed.reload).toBe('KeyR');
    expect(fixed.jump).toBe('Space'); // reservada → por defecto
    expect(fixed.melee).toBe('KeyV');
    expect(new Set(Object.values(fixed)).size).toBe(Object.keys(fixed).length);
  });

  it('Shift es correr; un guardado viejo con Shift en "caminar" pasa a correr y caminar vuelve a Z', () => {
    expect(DEFAULT_KEYS.sprint).toBe('ShiftLeft');
    const fixed = normalizeKeys({ walk: 'ShiftLeft' });
    expect(fixed.sprint).toBe('ShiftLeft');
    expect(fixed.walk).toBe('KeyZ');
  });

  it('nombres legibles de las teclas', () => {
    expect(codeLabel('KeyW')).toBe('W');
    expect(codeLabel('Space')).toBe('Espacio');
    expect(codeLabel('ShiftLeft')).toBe('Shift');
    expect(keyLabel(DEFAULT_KEYS, 'restart')).toBe('Retroceso');
  });
});

describe('opción de sombras', () => {
  it('auto sigue al detalle, on las fuerza y off las quita', () => {
    expect(shadowSizeFor('alta', 'auto')).toBe(2048);
    expect(shadowSizeFor('baja', 'auto')).toBe(0);
    expect(shadowSizeFor('baja', 'on')).toBe(1024);
    expect(shadowSizeFor('alta', 'off')).toBe(0);
  });
});
