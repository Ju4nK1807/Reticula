// Valores por defecto de configuración y del guardado completo.

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
  },
  enemyColor: '#ff3b4f',
  gameplay: {
    moveInaccuracy: true, // disparar en movimiento o en el aire desvía las balas (estilo táctico)
    tracers: true,
    viewmodel: true,
    autoReload: true, // recargar solo al intentar disparar con el cargador vacío
  },
  audio: { volume: 0.6 },
  video: { showFps: true },
};

export const ENEMY_COLORS = {
  '#ff3b4f': 'Rojo',
  '#ffe14d': 'Amarillo (daltonismo)',
  '#c86bff': 'Morado (daltonismo)',
  '#36d6ff': 'Cian',
};

export const DEFAULT_SAVE = {
  version: 2,
  settings: DEFAULT_SETTINGS,
  profile: {
    rank: null, // rango de la última evaluación (cualquier variante) o null si nunca se evaluó
    score: null,
    bestScore: null,
    variants: {}, // por variante ('targets' | 'bots'): { rank, score, best, date }
    evaluations: [], // historial: { date, variant, total, rank, subscores, tiles, results }
  },
  campaign: { unlocked: {}, best: {} }, // Fase 2
  records: {}, // Fases 3 y 4
};
