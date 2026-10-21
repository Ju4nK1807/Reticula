export const DEG = Math.PI / 180;

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const clamp01 = (v) => clamp(v, 0, 1);
export const rand = (a, b) => a + Math.random() * (b - a);
export const randSign = () => (Math.random() < 0.5 ? -1 : 1);

export function average(values) {
  return values.length ? values.reduce((s, v) => s + v, 0) / values.length : null;
}

// Normaliza v al rango [0, 1] entre lo (0) y hi (1).
export const norm = (v, lo, hi) => clamp01((v - lo) / (hi - lo));
