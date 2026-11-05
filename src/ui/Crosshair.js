// Mira: generación del SVG, presets, validación y códigos para compartir.
//
// config = { shape, color, size, thickness, gap, outline, opacity,
//            dot, dotSize, outlineThickness, outlineColor, dynamic }
// - shape: cross | cross-dot | dot | circle | t   (cross-dot = cruz con punto, se conserva por compatibilidad)
// - dot: punto central independiente de la forma
// - dynamic: los brazos se separan según la dispersión real del arma (variable CSS --xh-spread)

export const CROSSHAIR_SHAPES = ['cross', 'cross-dot', 'dot', 'circle', 't'];

// Rangos válidos de cada valor numérico [mínimo, máximo].
export const CROSSHAIR_LIMITS = {
  size: [0, 20],
  thickness: [1, 6],
  gap: [0, 14],
  opacity: [0.2, 1],
  dotSize: [1, 6],
  outlineThickness: [1, 3],
};

export const CROSSHAIR_DEFAULTS = {
  shape: 'cross',
  color: '#00ffa3',
  size: 6,
  thickness: 2,
  gap: 3,
  outline: true,
  opacity: 1,
  dot: false,
  dotSize: 2,
  outlineThickness: 1,
  outlineColor: '#000000',
  dynamic: false,
};

// Presets inspirados en estilos habituales (valores propios, no copias exactas de ningún juego).
export const CROSSHAIR_PRESETS = [
  { id: 'reticula', label: 'Retícula', config: { ...CROSSHAIR_DEFAULTS } },
  { id: 'tactica', label: 'Táctica clásica', config: { ...CROSSHAIR_DEFAULTS, color: '#4cff4c', size: 5, thickness: 1, gap: 2, outline: true } },
  { id: 'compacta', label: 'Compacta + punto', config: { ...CROSSHAIR_DEFAULTS, color: '#ffffff', size: 4, thickness: 2, gap: 2, dot: true, dotSize: 2 } },
  { id: 'punto', label: 'Solo punto', config: { ...CROSSHAIR_DEFAULTS, shape: 'dot', color: '#00e5ff', dotSize: 4 } },
  { id: 'precision', label: 'Precisión fina', config: { ...CROSSHAIR_DEFAULTS, color: '#ffe14d', size: 9, thickness: 1, gap: 4, outline: false } },
  { id: 'circulo', label: 'Círculo', config: { ...CROSSHAIR_DEFAULTS, shape: 'circle', color: '#ff4fd8', size: 6, gap: 4 } },
  { id: 'dinamica', label: 'Dinámica', config: { ...CROSSHAIR_DEFAULTS, color: '#36d6ff', size: 6, gap: 3, dot: true, dynamic: true } },
];

const HEX = /^#[0-9a-f]{6}$/i;
const clampTo = (v, [lo, hi], fallback) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback);

// Devuelve una configuración válida y completa (valores fuera de rango se ajustan; inválidos → defecto).
export function normalizeCrosshair(c = {}) {
  const d = CROSSHAIR_DEFAULTS;
  const out = { ...d };
  out.shape = CROSSHAIR_SHAPES.includes(c.shape) ? c.shape : d.shape;
  out.color = HEX.test(c.color ?? '') ? c.color.toLowerCase() : d.color;
  out.outlineColor = HEX.test(c.outlineColor ?? '') ? c.outlineColor.toLowerCase() : d.outlineColor;
  for (const [k, range] of Object.entries(CROSSHAIR_LIMITS)) out[k] = clampTo(Number(c[k]), range, d[k]);
  for (const k of ['outline', 'dot', 'dynamic']) out[k] = typeof c[k] === 'boolean' ? c[k] : d[k];
  return out;
}

// --- Códigos para compartir ------------------------------------------------------------------
// Formato legible y estable: RTC1;s=cross;c=00ffa3;l=6;t=2;g=3;o=1;ow=1;oc=000000;a=100;d=0;ds=2;y=0

const CODE_PREFIX = 'RTC1';

export function crosshairCode(config) {
  const c = normalizeCrosshair(config);
  const parts = [
    `s=${c.shape}`,
    `c=${c.color.slice(1)}`,
    `l=${c.size}`,
    `t=${c.thickness}`,
    `g=${c.gap}`,
    `o=${c.outline ? 1 : 0}`,
    `ow=${c.outlineThickness}`,
    `oc=${c.outlineColor.slice(1)}`,
    `a=${Math.round(c.opacity * 100)}`,
    `d=${c.dot ? 1 : 0}`,
    `ds=${c.dotSize}`,
    `y=${c.dynamic ? 1 : 0}`,
  ];
  return [CODE_PREFIX, ...parts].join(';');
}

// Lee un código. Devuelve la configuración (normalizada) o null si no es un código de Retícula.
export function parseCrosshairCode(code) {
  const text = String(code ?? '').trim();
  const [prefix, ...parts] = text.split(';');
  if (prefix !== CODE_PREFIX || !parts.length) return null;
  const kv = Object.fromEntries(parts.map((p) => p.split('=')).filter((p) => p.length === 2));
  const num = (k) => (kv[k] === undefined ? undefined : Number(kv[k]));
  const bool = (k) => (kv[k] === undefined ? undefined : kv[k] === '1');
  return normalizeCrosshair({
    shape: kv.s,
    color: kv.c ? `#${kv.c}` : undefined,
    size: num('l'),
    thickness: num('t'),
    gap: num('g'),
    outline: bool('o'),
    outlineThickness: num('ow'),
    outlineColor: kv.oc ? `#${kv.oc}` : undefined,
    opacity: kv.a === undefined ? undefined : Number(kv.a) / 100,
    dot: bool('d'),
    dotSize: num('ds'),
    dynamic: bool('y'),
  });
}

// --- SVG ----------------------------------------------------------------------------------------

export function crosshairSVG(config) {
  const c = normalizeCrosshair(config);
  const t = Math.round(c.thickness);
  const gap = Math.round(c.gap);
  const len = Math.round(c.size);
  const o = c.outline ? Math.round(c.outlineThickness) : 0;
  const shape = c.shape;
  const arms = ['cross', 'cross-dot', 't'].includes(shape) && len > 0;
  const hasDot = shape === 'dot' || shape === 'cross-dot' || c.dot;
  const dotSize = shape === 'dot' ? Math.max(2, Math.round(c.dotSize)) : Math.round(c.dotSize);
  const circleR = gap + len / 2 + 2;
  const ext = Math.ceil(Math.max(gap + len, shape === 'circle' ? circleR + t : 0, dotSize) + o + 2);
  const S = ext * 2;
  const cx = ext;

  // Brazos: [x, y, w, h, dx, dy] — (dx, dy) = hacia dónde se separan con la mira dinámica.
  const armRects = [];
  if (arms) {
    if (shape !== 't') armRects.push([cx - t / 2, cx - gap - len, t, len, 0, -1]);
    armRects.push([cx - t / 2, cx + gap, t, len, 0, 1]);
    armRects.push([cx - gap - len, cx - t / 2, len, t, -1, 0]);
    armRects.push([cx + gap, cx - t / 2, len, t, 1, 0]);
  }
  const dotRect = hasDot ? [cx - dotSize / 2, cx - dotSize / 2, dotSize, dotSize] : null;

  const rect = ([x, y, w, h], fill, grow = 0) =>
    `<rect x="${x - grow}" y="${y - grow}" width="${w + grow * 2}" height="${h + grow * 2}" fill="${fill}"/>`;
  const moving = ([, , , , dx, dy], inner) =>
    c.dynamic
      ? `<g style="transform:translate(calc(var(--xh-spread, 0px) * ${dx}), calc(var(--xh-spread, 0px) * ${dy}))">${inner}</g>`
      : inner;
  const circle = (stroke, width) => `<circle cx="${cx}" cy="${cx}" r="${circleR}" fill="none" stroke="${stroke}" stroke-width="${width}"/>`;

  let body = '';
  if (o) {
    body += `<g fill-opacity="0.85">${armRects.map((r) => moving(r, rect(r, c.outlineColor, o))).join('')}${dotRect ? rect(dotRect, c.outlineColor, o) : ''}</g>`;
    if (shape === 'circle') body += circle(c.outlineColor, t + o * 2);
  }
  if (shape === 'circle') body += circle(c.color, t);
  body += `<g shape-rendering="crispEdges">${armRects.map((r) => moving(r, rect(r, c.color))).join('')}${dotRect ? rect(dotRect, c.color) : ''}</g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}" style="opacity:${c.opacity};overflow:visible">${body}</svg>`;
}

// Separación extra (px) de la mira dinámica para una dispersión en grados, según el FOV vertical
// (grados) y la altura de la pantalla (px). Es la distancia real en pantalla del desvío de la bala.
export function spreadToPixels(spreadDeg, vFovDeg, screenHeight) {
  if (!(spreadDeg > 0)) return 0;
  const rad = Math.PI / 180;
  return (screenHeight / 2) * (Math.tan(spreadDeg * rad) / Math.tan((vFovDeg * rad) / 2));
}
