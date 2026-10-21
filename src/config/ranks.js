// Rangos ordenados de menor a mayor. `min` = puntuación global mínima (0-100).

export const RANKS = [
  { id: 'bronce', name: 'Bronce', min: 0, color: '#c8814f' },
  { id: 'plata', name: 'Plata', min: 30, color: '#b9c6d3' },
  { id: 'oro', name: 'Oro', min: 48, color: '#f2c14e' },
  { id: 'diamante', name: 'Diamante', min: 64, color: '#6ad3ff' },
  { id: 'elite', name: 'Élite', min: 80, color: '#ff4d6d' },
];

export function rankForScore(score) {
  let rank = RANKS[0];
  for (const r of RANKS) if (score >= r.min) rank = r;
  return rank;
}

export function getRank(id) {
  return RANKS.find((r) => r.id === id) ?? null;
}

export function rankIndex(id) {
  return RANKS.findIndex((r) => r.id === id);
}
