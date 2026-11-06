// Valores por defecto de configuración y del guardado completo.
import { DEFAULT_WEAPON, WEAPONS, WEAPON_ORDER } from '../combat/weapons.js';

export const DEFAULT_SETTINGS = {
  // La sensibilidad se guarda en la escala del juego elegido (ver config/sensitivity.js).
  sens: { game: 'reticula', value: 1.25, dpi: 800, invertY: false },
  // FOV horizontal en grados (equivalente 16:9).
  fov: 103,
  crosshair: {
    shape: 'cross', // cross | cross-dot | dot | circle | t
    color: '#00ffa3',
    size: 6,
    thickness: 2,
    gap: 3,
    outline: true,
    opacity: 1,
    dot: false, // punto central además de la forma
    dotSize: 2,
    outlineThickness: 1,
    outlineColor: '#000000',
    dynamic: false, // se abre con la dispersión real del arma (moverse, saltar, ráfaga)
  },
  // Arma elegida en el arsenal (la evaluación usa siempre el rifle).
  weapon: DEFAULT_WEAPON,
  // Mira propia de cada arma (true) o la misma para todas (false → `crosshair`).
  crosshairPerWeapon: true,
  weaponCrosshairs: Object.fromEntries(WEAPON_ORDER.map((id) => [id, { ...WEAPONS[id].crosshair }])),
  enemyColor: '#ff3b4f',
  gameplay: {
    moveInaccuracy: true, // disparar en movimiento o en el aire desvía las balas (estilo táctico)
    tracers: true,
    viewmodel: true,
    autoReload: true, // recargar solo al intentar disparar con el cargador vacío
    zoomSensitivity: 1, // multiplicador de sensibilidad con mira telescópica (1 = misma sensación que sin zoom)
  },
  audio: { volume: 0.6 },
  // Controles táctiles (teléfono/tableta). mode: auto | on | off. sensitivity: independiente del mouse.
  touch: { mode: 'auto', sensitivity: 1, invertY: false },
  video: { showFps: true, quality: 'alta', renderScale: 1 }, // quality: alta | media | baja | custom
};

export const ENEMY_COLORS = {
  '#ff3b4f': 'Rojo',
  '#ffe14d': 'Amarillo (daltonismo)',
  '#c86bff': 'Morado (daltonismo)',
  '#36d6ff': 'Cian',
};

// Al cambiar la forma del guardado: subir `version` y añadir el paso en storage/SaveStore.js (MIGRATIONS).
export const DEFAULT_SAVE = {
  version: 3,
  settings: DEFAULT_SETTINGS,
  profile: {
    // Rango general = el mejor rango actual entre las variantes (ver storage/profile.js).
    rank: null,
    score: null, // puntuación de la variante que da el rango general
    bestScore: null, // mejor puntuación histórica en cualquier variante
    variants: {}, // por variante ('targets' | 'bots'): { rank, score, best, date }
    evaluations: [], // historial: { date, variant, total, rank, subscores, tiles, results }
  },
  campaign: { unlocked: {}, best: {} }, // Fase 2
  records: {}, // por modo: records[modeId] = { ... } (lo define cada modo; ver SaveStore.modeRecord)
};
