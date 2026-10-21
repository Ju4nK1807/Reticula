const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

export const pct = (v, decimals = 0) => (isNum(v) ? `${(v * 100).toFixed(decimals)}%` : '—');
export const ms = (v) => (isNum(v) ? `${Math.round(v)} ms` : '—');
export const fixed = (v, decimals = 2) => (isNum(v) ? v.toFixed(decimals) : '—');

export function clock(seconds) {
  if (!isNum(seconds)) return '—';
  const t = Math.ceil(seconds);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

export function shortDate(iso) {
  try {
    return new Date(iso).toLocaleDateString('es', { day: 'numeric', month: 'short' });
  } catch {
    return '';
  }
}
