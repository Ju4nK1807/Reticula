import { describe, expect, it } from 'vitest';
import {
  CROSSHAIR_DEFAULTS,
  CROSSHAIR_PRESETS,
  crosshairCode,
  crosshairSVG,
  normalizeCrosshair,
  parseCrosshairCode,
  spreadToPixels,
} from '../src/ui/Crosshair.js';
import { DEFAULT_SETTINGS } from '../src/config/defaults.js';

describe('mira', () => {
  it('los valores por defecto del juego y de la mira coinciden', () => {
    expect(normalizeCrosshair(DEFAULT_SETTINGS.crosshair)).toEqual(CROSSHAIR_DEFAULTS);
  });

  it('normaliza valores fuera de rango o inválidos', () => {
    const c = normalizeCrosshair({ shape: 'estrella', color: 'rojo', size: 99, thickness: 0, opacity: 5, dot: 'sí', dotSize: Number.NaN });
    expect(c).toMatchObject({ shape: 'cross', color: '#00ffa3', size: 20, thickness: 1, opacity: 1, dot: false, dotSize: 2 });
  });

  it('el código ida y vuelta conserva la mira (todos los presets)', () => {
    for (const p of CROSSHAIR_PRESETS) expect(parseCrosshairCode(crosshairCode(p.config))).toEqual(normalizeCrosshair(p.config));
  });

  it('códigos ajenos o rotos se rechazan; los incompletos se completan', () => {
    expect(parseCrosshairCode('CSGO-abc')).toBeNull();
    expect(parseCrosshairCode('')).toBeNull();
    expect(parseCrosshairCode('RTC1')).toBeNull();
    expect(parseCrosshairCode('RTC1;c=ff0000;l=10')).toMatchObject({ color: '#ff0000', size: 10, shape: 'cross' });
    expect(parseCrosshairCode('  RTC1;s=dot  ').shape).toBe('dot');
  });

  it('el SVG dibuja lo configurado', () => {
    const rects = (svg) => (svg.match(/<rect/g) ?? []).length;
    const plain = { ...CROSSHAIR_DEFAULTS, outline: false };
    expect(rects(crosshairSVG(plain))).toBe(4); // cruz: 4 brazos
    expect(rects(crosshairSVG({ ...plain, shape: 't' }))).toBe(3); // T: sin brazo superior
    expect(rects(crosshairSVG({ ...plain, dot: true }))).toBe(5); // + punto
    expect(rects(crosshairSVG({ ...plain, outline: true }))).toBe(8); // + contornos
    expect(crosshairSVG({ ...plain, shape: 'circle' })).toContain('<circle');
    expect(crosshairSVG({ ...plain, dynamic: true })).toContain('--xh-spread');
    expect(crosshairSVG(plain)).not.toContain('--xh-spread');
  });

  it('la mira dinámica se abre según la dispersión real', () => {
    expect(spreadToPixels(0, 70, 1080)).toBe(0);
    const small = spreadToPixels(1, 70, 1080);
    expect(small).toBeGreaterThan(0);
    expect(spreadToPixels(4, 70, 1080)).toBeGreaterThan(small * 3.9);
    // Con más FOV la misma dispersión ocupa menos píxeles.
    expect(spreadToPixels(2, 100, 1080)).toBeLessThan(spreadToPixels(2, 60, 1080));
  });
});
