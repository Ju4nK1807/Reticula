import { describe, expect, it } from 'vitest';
import { JOYSTICK_DEADZONE, JOYSTICK_RADIUS, TOUCH_DEG_PER_PX, joystickAxis, resolveTouchMode, touchLookCounts } from '../src/core/TouchControls.js';

describe('joystick táctil', () => {
  it('centro y zona muerta = quieto', () => {
    expect(joystickAxis(0, 0)).toEqual({ x: 0, y: 0, mag: 0 });
    expect(joystickAxis(JOYSTICK_RADIUS * JOYSTICK_DEADZONE * 0.9, 0).mag).toBe(0);
  });

  it('empujar hasta el borde = velocidad máxima, y más allá no suma', () => {
    expect(joystickAxis(JOYSTICK_RADIUS, 0)).toMatchObject({ x: 1, mag: 1 });
    expect(joystickAxis(JOYSTICK_RADIUS * 3, 0).mag).toBe(1);
  });

  it('arriba en pantalla = adelante; analógico entre medias', () => {
    const up = joystickAxis(0, -JOYSTICK_RADIUS);
    expect(up.y).toBeCloseTo(1);
    expect(up.x).toBeCloseTo(0);
    const half = joystickAxis(JOYSTICK_RADIUS * 0.57, 0).mag;
    expect(half).toBeGreaterThan(0.4);
    expect(half).toBeLessThan(0.6);
  });

  it('sin saltos al salir de la zona muerta', () => {
    expect(joystickAxis(JOYSTICK_RADIUS * (JOYSTICK_DEADZONE + 0.001), 0).mag).toBeLessThan(0.01);
  });
});

describe('mirada táctil', () => {
  it('gira lo mismo sea cual sea la sensibilidad del mouse', () => {
    const deg = (counts, rad) => (counts * rad * 180) / Math.PI;
    for (const rad of [0.0002, 0.0005, 0.002]) expect(deg(touchLookCounts(100, 1, rad), rad)).toBeCloseTo(100 * TOUCH_DEG_PER_PX);
  });

  it('la sensibilidad táctil escala el giro', () => {
    expect(touchLookCounts(50, 2, 0.001)).toBeCloseTo(touchLookCounts(50, 1, 0.001) * 2);
  });
});

describe('modo táctil', () => {
  const media = (coarse, fine) => (q) => ({ matches: q.includes('coarse') ? coarse : fine });
  it('automático: solo si hay pantalla táctil y no hay mouse', () => {
    expect(resolveTouchMode('auto', media(true, false))).toBe(true);
    expect(resolveTouchMode('auto', media(true, true))).toBe(false); // portátil táctil con mouse
    expect(resolveTouchMode('auto', media(false, true))).toBe(false);
  });
  it('se puede forzar', () => {
    expect(resolveTouchMode('on', media(false, true))).toBe(true);
    expect(resolveTouchMode('off', media(true, false))).toBe(false);
    expect(resolveTouchMode('auto', undefined)).toBe(false);
  });
});
