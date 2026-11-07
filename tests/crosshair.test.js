import { describe, expect, it } from 'vitest';
import {
  CROSSHAIR_DEFAULTS,
  CROSSHAIR_PRESETS,
  crosshairCode,
  crosshairSVG,
  isLegacyCrosshair,
  normalizeCrosshair,
  parseCrosshairCode,
  spreadToPixels,
  upgradeCrosshair,
} from '../src/ui/Crosshair.js';
import { DEFAULT_SETTINGS } from '../src/config/defaults.js';
import { WEAPONS, WEAPON_ORDER } from '../src/combat/weapons.js';

const rects = (svg) => (svg.match(/<rect/g) ?? []).length;
const circles = (svg) => (svg.match(/<circle/g) ?? []).length;
const plain = { ...CROSSHAIR_DEFAULTS, outline: false };

describe('mira: modelo y validación', () => {
  it('los valores por defecto del juego y de la mira coinciden', () => {
    expect(normalizeCrosshair(DEFAULT_SETTINGS.crosshair)).toEqual(CROSSHAIR_DEFAULTS);
  });

  it('normaliza valores fuera de rango o inválidos', () => {
    const c = normalizeCrosshair({ lines: true, color: 'rojo', size: 99, thickness: 0, opacity: 5, dot: 'sí', dotSize: Number.NaN, rotation: 90, ringRadius: -4 });
    expect(c).toMatchObject({ color: '#00ffa3', size: 20, thickness: 1, opacity: 1, dot: false, dotSize: 2, rotation: 45, ringRadius: 3 });
  });

  it('una mira sin piezas visibles queda al menos con el punto', () => {
    expect(normalizeCrosshair({ lines: false, outer: false, ring: false, dot: false }).dot).toBe(true);
  });

  it('las miras de antes (por forma) se traducen a piezas equivalentes', () => {
    expect(isLegacyCrosshair({ shape: 'dot' })).toBe(true);
    expect(isLegacyCrosshair(CROSSHAIR_DEFAULTS)).toBe(false);
    expect(normalizeCrosshair({ shape: 'dot', dotSize: 1 })).toMatchObject({ lines: false, dot: true, dotSize: 2, shape: 'dot' });
    expect(normalizeCrosshair({ shape: 't' })).toMatchObject({ lines: true, tShape: true, shape: 't' });
    expect(normalizeCrosshair({ shape: 'cross-dot' })).toMatchObject({ lines: true, dot: true, shape: 'cross-dot' });
    expect(normalizeCrosshair({ shape: 'circle', gap: 6, size: 10, thickness: 2 })).toMatchObject({ lines: false, ring: true, ringRadius: 13, ringThickness: 2, shape: 'circle' });
    expect(normalizeCrosshair({ shape: 'estrella' }).shape).toBe('cross');
  });

  it('migrar un guardado viejo ignora las piezas que vinieron de los valores por defecto', () => {
    const merged = { ...CROSSHAIR_DEFAULTS, shape: 'circle', gap: 6, size: 10, thickness: 2 }; // lines: true (por defecto)
    upgradeCrosshair(merged);
    expect(merged).toMatchObject({ lines: false, ring: true, ringRadius: 13 });
  });

  it('las miras por defecto de cada arma son las de siempre', () => {
    expect(WEAPONS.shotgun.crosshair).toMatchObject({ ring: true, dot: true, lines: false });
    expect(WEAPONS.sniper.crosshair).toMatchObject({ lines: false, dot: true });
    expect(WEAPONS.smg.crosshair).toMatchObject({ lines: true, dot: true, dynamic: true });
    for (const id of WEAPON_ORDER) expect(normalizeCrosshair(WEAPONS[id].crosshair)).toEqual(WEAPONS[id].crosshair);
  });
});

describe('mira: códigos para compartir', () => {
  it('el código ida y vuelta conserva la mira (todos los presets)', () => {
    for (const p of CROSSHAIR_PRESETS) expect(parseCrosshairCode(crosshairCode(p.config)), p.id).toEqual(normalizeCrosshair(p.config));
  });

  it('conserva también las piezas nuevas', () => {
    const c = normalizeCrosshair({ ...CROSSHAIR_DEFAULTS, outer: true, outerGap: 14, outerOpacity: 0.4, ring: true, ringRadius: 18, dotRound: true, dot: true, rotation: 45, outlineOpacity: 0.5 });
    const code = crosshairCode(c);
    expect(code.startsWith('RTC2;')).toBe(true);
    expect(parseCrosshairCode(code)).toEqual(c);
  });

  it('códigos ajenos o rotos se rechazan; los incompletos se completan', () => {
    expect(parseCrosshairCode('CSGO-abc')).toBeNull();
    expect(parseCrosshairCode('')).toBeNull();
    expect(parseCrosshairCode('RTC1')).toBeNull();
    expect(parseCrosshairCode('RTC2')).toBeNull();
    expect(parseCrosshairCode('RTC2;c=ff0000;l=10')).toMatchObject({ color: '#ff0000', size: 10, lines: true });
  });

  it('los códigos RTC1 (versión anterior) se siguen leyendo', () => {
    expect(parseCrosshairCode('RTC1;c=ff0000;l=10')).toMatchObject({ color: '#ff0000', size: 10, shape: 'cross', lines: true });
    expect(parseCrosshairCode('  RTC1;s=dot  ')).toMatchObject({ shape: 'dot', lines: false, dot: true });
    expect(parseCrosshairCode('RTC1;s=circle;g=6;l=10;t=2')).toMatchObject({ ring: true, ringRadius: 13, lines: false });
  });
});

describe('mira: dibujo', () => {
  it('cada pieza aparece solo si está activada', () => {
    expect(rects(crosshairSVG(plain))).toBe(4); // cruz: 4 brazos
    expect(rects(crosshairSVG({ ...plain, tShape: true }))).toBe(3); // T: sin brazo superior
    expect(rects(crosshairSVG({ ...plain, dot: true }))).toBe(5); // + punto cuadrado
    expect(rects(crosshairSVG({ ...plain, outline: true }))).toBe(8); // + contornos
    expect(rects(crosshairSVG({ ...plain, outer: true }))).toBe(8); // + líneas exteriores
    expect(circles(crosshairSVG({ ...plain, lines: false, ring: true }))).toBe(1); // anillo
    expect(circles(crosshairSVG({ ...plain, dot: true, dotRound: true }))).toBe(1); // punto redondo
    expect(rects(crosshairSVG({ ...plain, lines: false, dot: true }))).toBe(1);
  });

  it('gira, se mueve con la dispersión y respeta las opacidades', () => {
    expect(crosshairSVG({ ...plain, rotation: 45 })).toContain('rotate(45');
    expect(crosshairSVG(plain)).not.toContain('rotate(');
    expect(crosshairSVG({ ...plain, dynamic: true })).toContain('--xh-spread');
    expect(crosshairSVG(plain)).not.toContain('--xh-spread');
    expect(crosshairSVG({ ...plain, outer: true, outerOpacity: 0.4 })).toContain('opacity="0.4"');
    expect(crosshairSVG({ ...plain, opacity: 0.5 })).toContain('opacity:0.5');
  });

  it('el lienzo alcanza para la pieza más lejana (también girada)', () => {
    const size = (c) => Number(crosshairSVG(c).match(/width="(\d+)"/)[1]);
    expect(size({ ...plain, ring: true, ringRadius: 30 })).toBeGreaterThanOrEqual(60);
    expect(size({ ...plain, outer: true, outerGap: 30, outerSize: 20 })).toBeGreaterThanOrEqual(100);
    expect(size({ ...plain, rotation: 45 })).toBeGreaterThan(size(plain));
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
