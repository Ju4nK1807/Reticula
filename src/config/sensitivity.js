// Conversión de sensibilidad entre juegos.
// `yaw` = grados que gira la cámara por cada "count" del mouse con sensibilidad 1.
// Con Pointer Lock + unadjustedMovement, movementX equivale a counts crudos del mouse.
// Valores comunitarios de referencia; Fortnite y Call of Duty son aproximados.

export const GAMES = {
  reticula: { label: "Retícula / KovaaK's (escala Source)", yaw: 0.022, step: 0.01, decimals: 3, suffix: '' },
  cs2: { label: 'Counter-Strike 2 / CS:GO', yaw: 0.022, step: 0.01, decimals: 3, suffix: '' },
  apex: { label: 'Apex Legends', yaw: 0.022, step: 0.1, decimals: 2, suffix: '' },
  valorant: { label: 'Valorant', yaw: 0.07, step: 0.001, decimals: 3, suffix: '' },
  overwatch: { label: 'Overwatch 2', yaw: 0.0066, step: 0.1, decimals: 2, suffix: '' },
  cod: { label: 'Call of Duty (MW · Warzone · BO6)', yaw: 0.0066, step: 0.1, decimals: 2, suffix: '' },
  fortnite: { label: 'Fortnite (%)', yaw: 0.005555, step: 0.1, decimals: 1, suffix: '%' },
  quake: { label: 'Quake Champions / TF2', yaw: 0.022, step: 0.01, decimals: 3, suffix: '' },
};

// FOV horizontal equivalente en 16:9.
export const FOV_PRESETS = [
  { label: 'CS2 (90 en 4:3)', value: 106 },
  { label: 'Valorant / Overwatch 2', value: 103 },
  { label: 'Clásico', value: 90 },
];

const gameOf = (id) => GAMES[id] ?? GAMES.reticula;

export function degPerCount(game, value) {
  return gameOf(game).yaw * value;
}

export function cmPer360(game, value, dpi) {
  const degPerInch = degPerCount(game, value) * dpi;
  return degPerInch > 0 ? (360 / degPerInch) * 2.54 : Infinity;
}

// Valor de sensibilidad en `game` que produce `cm` centímetros por vuelta completa.
export function valueForCm(game, cm, dpi) {
  return (360 * 2.54) / (cm * dpi * gameOf(game).yaw);
}

export function convertSens(from, value, to) {
  return (value * gameOf(from).yaw) / gameOf(to).yaw;
}

export function roundTo(value, decimals) {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

export function formatSens(game, value) {
  const g = gameOf(game);
  return `${roundTo(value, g.decimals)}${g.suffix}`;
}

export function sensSummary(sens) {
  return `${gameOf(sens.game).label} ${formatSens(sens.game, sens.value)} · ${sens.dpi} DPI · ${cmPer360(sens.game, sens.value, sens.dpi).toFixed(1)} cm/360`;
}
