export const CROSSHAIR_SHAPES = ['cross', 'cross-dot', 'dot', 'circle', 't'];

export const CROSSHAIR_LIMITS = {
  size: [0, 20],
  thickness: [1, 6],
  gap: [0, 14],
  opacity: [0.2, 1],
  dotSize: [1, 8],
  dotOpacity: [0.1, 1],
  outlineThickness: [1, 3],
  outlineOpacity: [0.1, 1],
  outerSize: [0, 20],
  outerThickness: [1, 6],
  outerGap: [2, 30],
  outerOpacity: [0.1, 1],
  ringRadius: [3, 30],
  ringThickness: [1, 4],
  ringOpacity: [0.1, 1],
  rotation: [0, 45],
};

const BOOLEANS = ['lines', 'tShape', 'outer', 'dot', 'dotRound', 'ring', 'outline', 'dynamic'];

export const CROSSHAIR_DEFAULTS = {
  shape: 'cross',
  color: '#00ffa3',
  opacity: 1,
  lines: true,
  tShape: false,
  size: 6,
  thickness: 2,
  gap: 3,
  outer: false,
  outerSize: 4,
  outerThickness: 2,
  outerGap: 10,
  outerOpacity: 0.6,
  dot: false,
  dotSize: 2,
  dotOpacity: 1,
  dotRound: false,
  ring: false,
  ringRadius: 10,
  ringThickness: 1,
  ringOpacity: 1,
  outline: true,
  outlineThickness: 1,
  outlineColor: '#000000',
  outlineOpacity: 0.85,
  rotation: 0,
  dynamic: false,
};

export const CROSSHAIR_COLORS = ['#00ffa3', '#ffffff', '#4cff4c', '#c8ff2e', '#ffe14d', '#36d6ff', '#ff4fd8', '#ff3b4f'];

const C = (over) => ({ ...CROSSHAIR_DEFAULTS, ...over });

export const CROSSHAIR_PRESETS = [
  { id: 'reticula', label: 'Retícula', config: C({}) },
  { id: 'tactica', label: 'Táctica clásica', config: C({ color: '#4cff4c', size: 5, thickness: 1, gap: 2 }) },
  { id: 'compacta', label: 'Compacta + punto', config: C({ color: '#ffffff', size: 4, gap: 2, dot: true }) },
  { id: 'punto', label: 'Solo punto', config: C({ lines: false, dot: true, dotSize: 4, dotRound: true, color: '#36d6ff' }) },
  { id: 'precision', label: 'Precisión fina', config: C({ color: '#ffe14d', size: 9, thickness: 1, gap: 4, outline: false }) },
  { id: 'circulo', label: 'Anillo y punto', config: C({ lines: false, ring: true, ringRadius: 9, ringThickness: 1, dot: true, dotRound: true, color: '#ff4fd8' }) },
  { id: 'dinamica', label: 'Dinámica', config: C({ color: '#36d6ff', size: 6, gap: 3, dot: true, dynamic: true }) },
  { id: 'doble', label: 'Doble línea', config: C({ color: '#c8ff2e', size: 3, gap: 2, outer: true, outerSize: 4, outerGap: 9, outerOpacity: 0.55 }) },
  { id: 'equis', label: 'Cruz en X', config: C({ color: '#ffffff', size: 5, gap: 3, rotation: 45, dot: true, dotSize: 2 }) },
  { id: 't', label: 'T táctica', config: C({ color: '#ffe14d', tShape: true, size: 6, gap: 3, dot: true }) },
  { id: 'mira', label: 'Mira de cañón', config: C({ color: '#ff3b4f', size: 7, gap: 6, ring: true, ringRadius: 13, ringThickness: 1, ringOpacity: 0.8 }) },
  { id: 'minima', label: 'Mínima', config: C({ color: '#ffffff', size: 2, thickness: 1, gap: 1, outline: true }) },
];

const HEX = /^#[0-9a-f]{6}$/i;
const clampTo = (v, [lo, hi], fallback) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback);
const num = (v) => (v === undefined || v === null || v === '' ? undefined : Number(v));

function fromLegacy(c) {
  const shape = CROSSHAIR_SHAPES.includes(c.shape) ? c.shape : 'cross';
  const out = {
    lines: shape === 'cross' || shape === 'cross-dot' || shape === 't',
    tShape: shape === 't',
    dot: shape === 'dot' || shape === 'cross-dot' || c.dot === true,
    ring: shape === 'circle',
  };
  if (shape === 'circle') {
    const gap = clampTo(num(c.gap), CROSSHAIR_LIMITS.gap, CROSSHAIR_DEFAULTS.gap);
    const size = clampTo(num(c.size), CROSSHAIR_LIMITS.size, CROSSHAIR_DEFAULTS.size);
    out.ringRadius = Math.round(gap + size / 2 + 2);
    out.ringThickness = clampTo(num(c.thickness), CROSSHAIR_LIMITS.ringThickness, 2);
  }
  if (shape === 'dot') out.dotSize = Math.max(2, clampTo(num(c.dotSize), CROSSHAIR_LIMITS.dotSize, 2));
  return out;
}

export const isLegacyCrosshair = (c) => !!c && typeof c === 'object' && typeof c.lines !== 'boolean';

function shapeOf(c) {
  if (c.lines) return c.tShape ? 't' : c.dot ? 'cross-dot' : 'cross';
  if (c.ring) return 'circle';
  return 'dot';
}

export function normalizeCrosshair(c = {}) {
  const src = c && typeof c === 'object' ? c : {};
  const pieces = isLegacyCrosshair(src) ? { ...src, ...fromLegacy(src) } : src;
  const d = CROSSHAIR_DEFAULTS;
  const out = { ...d };
  out.color = HEX.test(pieces.color ?? '') ? pieces.color.toLowerCase() : d.color;
  out.outlineColor = HEX.test(pieces.outlineColor ?? '') ? pieces.outlineColor.toLowerCase() : d.outlineColor;
  for (const [k, range] of Object.entries(CROSSHAIR_LIMITS)) out[k] = clampTo(num(pieces[k]), range, d[k]);
  for (const k of BOOLEANS) out[k] = typeof pieces[k] === 'boolean' ? pieces[k] : d[k];
  if (!out.lines && !out.outer && !out.ring && !out.dot) out.dot = true;
  out.shape = shapeOf(out);
  return out;
}

const CODE_V1 = 'RTC1';
const CODE_V2 = 'RTC2';
const pct = (v) => Math.round(v * 100);
const FIELDS = [
  ['c', 'color', 'h'],
  ['a', 'opacity', 'p'],
  ['ln', 'lines', 'b'],
  ['l', 'size', 'n'],
  ['t', 'thickness', 'n'],
  ['g', 'gap', 'n'],
  ['tt', 'tShape', 'b'],
  ['x', 'outer', 'b'],
  ['xl', 'outerSize', 'n'],
  ['xt', 'outerThickness', 'n'],
  ['xg', 'outerGap', 'n'],
  ['xa', 'outerOpacity', 'p'],
  ['d', 'dot', 'b'],
  ['ds', 'dotSize', 'n'],
  ['da', 'dotOpacity', 'p'],
  ['dr', 'dotRound', 'b'],
  ['r', 'ring', 'b'],
  ['rr', 'ringRadius', 'n'],
  ['rt', 'ringThickness', 'n'],
  ['ra', 'ringOpacity', 'p'],
  ['o', 'outline', 'b'],
  ['ow', 'outlineThickness', 'n'],
  ['oc', 'outlineColor', 'h'],
  ['oa', 'outlineOpacity', 'p'],
  ['rot', 'rotation', 'n'],
  ['y', 'dynamic', 'b'],
];

export function crosshairCode(config) {
  const c = normalizeCrosshair(config);
  const parts = FIELDS.map(([key, field, type]) => {
    const v = c[field];
    const text = type === 'b' ? (v ? 1 : 0) : type === 'p' ? pct(v) : type === 'h' ? v.slice(1) : v;
    return `${key}=${text}`;
  });
  return [CODE_V2, ...parts].join(';');
}

export function parseCrosshairCode(code) {
  const text = String(code ?? '').trim();
  const [prefix, ...parts] = text.split(';');
  if ((prefix !== CODE_V1 && prefix !== CODE_V2) || !parts.length) return null;
  const kv = Object.fromEntries(parts.map((p) => p.split('=')).filter((p) => p.length === 2 && p[0]));
  const bool = (k) => (kv[k] === undefined ? undefined : kv[k] === '1');
  if (prefix === CODE_V1) {
    return normalizeCrosshair({
      shape: kv.s,
      color: kv.c ? `#${kv.c}` : undefined,
      size: num(kv.l),
      thickness: num(kv.t),
      gap: num(kv.g),
      outline: bool('o'),
      outlineThickness: num(kv.ow),
      outlineColor: kv.oc ? `#${kv.oc}` : undefined,
      opacity: kv.a === undefined ? undefined : Number(kv.a) / 100,
      dot: bool('d'),
      dotSize: num(kv.ds),
      dynamic: bool('y'),
    });
  }
  const c = { lines: kv.ln === undefined ? true : kv.ln === '1' };
  for (const [key, field, type] of FIELDS) {
    if (kv[key] === undefined) continue;
    if (type === 'b') c[field] = kv[key] === '1';
    else if (type === 'p') c[field] = Number(kv[key]) / 100;
    else if (type === 'h') c[field] = `#${kv[key]}`;
    else c[field] = Number(kv[key]);
  }
  return normalizeCrosshair(c);
}

const round1 = (v) => Math.round(v * 10) / 10;

function arms(cx, gap, len, t, tShape) {
  if (len <= 0) return [];
  const list = [];
  if (!tShape) list.push([cx - t / 2, cx - gap - len, t, len, 0, -1]);
  list.push([cx - t / 2, cx + gap, t, len, 0, 1]);
  list.push([cx - gap - len, cx - t / 2, len, t, -1, 0]);
  list.push([cx + gap, cx - t / 2, len, t, 1, 0]);
  return list;
}

export function crosshairSVG(config) {
  const c = normalizeCrosshair(config);
  const o = c.outline ? Math.round(c.outlineThickness) : 0;
  const t = Math.round(c.thickness);
  const gap = Math.round(c.gap);
  const len = Math.round(c.size);
  const ot = Math.round(c.outerThickness);
  const og = Math.round(c.outerGap);
  const ol = Math.round(c.outerSize);
  const ds = Math.round(c.dotSize);
  const rr = Math.round(c.ringRadius);
  const rt = Math.round(c.ringThickness);
  const rotated = c.rotation > 0.5;
  const reach = Math.max(
    c.lines ? gap + len : 0,
    c.outer ? og + ol : 0,
    ds / 2 + 1,
    t / 2,
  );
  const ext = Math.ceil(Math.max(reach * (rotated ? Math.SQRT2 : 1), c.ring ? rr + rt / 2 : 0) + o + 2);
  const S = ext * 2;
  const cx = ext;

  const rect = ([x, y, w, h], fill, grow = 0) =>
    `<rect x="${round1(x - grow)}" y="${round1(y - grow)}" width="${round1(w + grow * 2)}" height="${round1(h + grow * 2)}" fill="${fill}"/>`;
  const moving = ([, , , , dx, dy], inner, factor = 1) =>
    c.dynamic
      ? `<g style="transform:translate(calc(var(--xh-spread, 0px) * ${dx * factor}), calc(var(--xh-spread, 0px) * ${dy * factor}))">${inner}</g>`
      : inner;
  const lineSet = (list, alpha, factor) => {
    if (!list.length) return '';
    const under = o ? `<g fill-opacity="${c.outlineOpacity}">${list.map((r) => moving(r, rect(r, c.outlineColor, o), factor)).join('')}</g>` : '';
    const over = list.map((r) => moving(r, rect(r, c.color), factor)).join('');
    return `<g opacity="${alpha}">${under}<g${rotated ? '' : ' shape-rendering="crispEdges"'}>${over}</g></g>`;
  };

  let body = '';
  if (c.ring) {
    const ring = (stroke, width, alpha) => `<circle cx="${cx}" cy="${cx}" r="${rr}" fill="none" stroke="${stroke}" stroke-width="${width}" opacity="${alpha}"/>`;
    if (o) body += ring(c.outlineColor, rt + o * 2, c.outlineOpacity * c.ringOpacity);
    body += ring(c.color, rt, c.ringOpacity);
  }
  let lines = '';
  if (c.outer) lines += lineSet(arms(cx, og, ol, ot, c.tShape), c.outerOpacity, 1.35);
  if (c.lines) lines += lineSet(arms(cx, gap, len, t, c.tShape), 1, 1);
  if (lines) body += rotated ? `<g transform="rotate(${round1(c.rotation)} ${cx} ${cx})">${lines}</g>` : lines;
  if (c.dot) {
    const half = ds / 2;
    let dot = '';
    if (c.dotRound) {
      if (o) dot += `<circle cx="${cx}" cy="${cx}" r="${half + o}" fill="${c.outlineColor}" opacity="${c.outlineOpacity}"/>`;
      dot += `<circle cx="${cx}" cy="${cx}" r="${Math.max(0.75, half)}" fill="${c.color}"/>`;
    } else {
      const r = [cx - half, cx - half, ds, ds];
      if (o) dot += `<g fill-opacity="${c.outlineOpacity}">${rect(r, c.outlineColor, o)}</g>`;
      dot += `<g shape-rendering="crispEdges">${rect(r, c.color)}</g>`;
    }
    body += `<g opacity="${c.dotOpacity}">${dot}</g>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}" style="opacity:${c.opacity};overflow:visible">${body}</svg>`;
}

export function spreadToPixels(spreadDeg, vFovDeg, screenHeight) {
  if (!(spreadDeg > 0)) return 0;
  const rad = Math.PI / 180;
  return (screenHeight / 2) * (Math.tan(spreadDeg * rad) / Math.tan((vFovDeg * rad) / 2));
}

export function upgradeCrosshair(c) {
  if (!c || typeof c !== 'object') return c;
  const legacy = { ...c };
  for (const k of BOOLEANS) if (k !== 'outline' && k !== 'dynamic' && k !== 'dot') delete legacy[k];
  delete legacy.ringRadius;
  delete legacy.ringThickness;
  const pieces = normalizeCrosshair(legacy);
  return Object.assign(c, pieces);
}
