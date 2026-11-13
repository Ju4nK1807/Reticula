// Valores por defecto de configuración y del guardado completo.
import { DEFAULT_WEAPON, WEAPONS, WEAPON_ORDER } from '../combat/weapons.js';
import { CROSSHAIR_DEFAULTS } from '../ui/Crosshair.js';
import { DEFAULT_KEYS } from './keybinds.js';

export const DEFAULT_SETTINGS = {
  // La sensibilidad se guarda en la escala del juego elegido (ver config/sensitivity.js).
  sens: { game: 'reticula', value: 1.25, dpi: 800, invertY: false },
  // FOV horizontal en grados (equivalente 16:9).
  fov: 103,
  // Mira global (piezas combinables: líneas, líneas exteriores, punto, anillo, contorno… ver ui/Crosshair.js).
  crosshair: { ...CROSSHAIR_DEFAULTS },
  // Arma elegida en el arsenal (la evaluación usa siempre el rifle).
  weapon: DEFAULT_WEAPON,
  // Mira propia de cada arma (true) o la misma para todas (false → `crosshair`).
  crosshairPerWeapon: true,
  weaponCrosshairs: Object.fromEntries(WEAPON_ORDER.map((id) => [id, { ...WEAPONS[id].crosshair }])),
  // Retículas guardadas por el jugador en el editor: [{ name, config }].
  savedCrosshairs: [],
  enemyColor: '#ff3b4f',
  gameplay: {
    moveInaccuracy: true, // disparar en movimiento o en el aire desvía las balas (estilo táctico)
    tracers: true,
    casings: true, // las armas expulsan vainas que rebotan en el suelo
    viewmodel: true,
    hands: true, // brazos y manos sujetando el arma
    autoReload: true, // recargar solo al intentar disparar con el cargador vacío
    zoomSensitivity: 1, // multiplicador de sensibilidad con mira telescópica (1 = misma sensación que sin zoom)
  },
  // Controles reasignables: acción → tecla (KeyboardEvent.code). Ver config/keybinds.js.
  keys: { ...DEFAULT_KEYS },
  audio: { volume: 0.6, music: 0.5 },
  // Controles táctiles (teléfono/tableta). mode: auto | on | off. sensitivity: independiente del mouse.
  touch: { mode: 'auto', sensitivity: 1, invertY: false },
  // quality: auto (resolución dinámica, ver gfx/AutoQuality.js) | alta | media | baja | custom.
  // autoDetail / autoScale: lo que aprendió la calidad automática en este equipo (se retoma al volver).
  // shadows: auto (según el detalle) | on | off — ver config/quality.js.
  video: { showFps: true, quality: 'auto', renderScale: 1, shadows: 'auto' },
};

export const ENEMY_COLORS = {
  '#ff3b4f': 'Rojo',
  '#ffe14d': 'Amarillo (daltonismo)',
  '#c86bff': 'Morado (daltonismo)',
  '#36d6ff': 'Cian',
};

// Al cambiar la forma del guardado: subir `version` y añadir el paso en storage/SaveStore.js (MIGRATIONS).
export const DEFAULT_SAVE = {
  version: 5,
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
