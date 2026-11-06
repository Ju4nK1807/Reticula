// Íconos de la interfaz: trazo de 1.75 px en una cuadrícula de 24, mismo estilo para todos.
const PATHS = {
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
  enemy: '<circle cx="12" cy="7" r="3.2"/><path d="M6 21v-4.5a6 6 0 0 1 12 0V21"/><path d="M9.5 13.5h5"/>',
  map: '<path d="M3 6.5 9 4l6 2.5L21 4v13.5L15 20l-6-2.5L3 20z"/><path d="M9 4v13.5M15 6.5V20"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  waves: '<path d="M3 8c2.5-2 4.5-2 7 0s4.5 2 7 0 3.5-1.5 4-1.5"/><path d="M3 13c2.5-2 4.5-2 7 0s4.5 2 7 0 3.5-1.5 4-1.5"/><path d="M3 18c2.5-2 4.5-2 7 0s4.5 2 7 0 3.5-1.5 4-1.5"/>',
  gun: '<path d="M3 9h15l3 2v2h-5l-1.5 2H11l-1 4H6l1-4H3z"/><path d="M14 9V7"/>',
  chart: '<path d="M4 20V4"/><path d="M4 20h16"/><path d="m7 15 4-4 3 3 5-6"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6"/>',
  play: '<path d="M7 4.5v15l12-7.5z"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  star: '<path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z"/>',
  bolt: '<path d="M13 2.5 4.5 13.5H11l-1 8 8.5-11H12z"/>',
};

export function icon(name, size = 20) {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name] ?? ''}</svg>`;
}

// Ícono de cada modo del menú.
export const MODE_ICONS = {
  'evaluation-targets': 'target',
  'evaluation-bots': 'enemy',
  campaign: 'map',
  coordination: 'eye',
  endless: 'waves',
};
