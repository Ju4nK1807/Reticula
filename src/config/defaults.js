import { DEFAULT_WEAPON, WEAPONS, WEAPON_ORDER } from '../combat/weapons.js';
import { CROSSHAIR_DEFAULTS } from '../ui/Crosshair.js';
import { DEFAULT_KEYS } from './keybinds.js';
import { EVAL_DEFAULTS } from '../modes/evaluation/evalConfig.js';

export const DEFAULT_SETTINGS = {
  sens: { game: 'reticula', value: 1.25, dpi: 800, invertY: false },
  fov: 103,
  crosshair: { ...CROSSHAIR_DEFAULTS },
  weapon: DEFAULT_WEAPON,
  crosshairPerWeapon: true,
  weaponCrosshairs: Object.fromEntries(WEAPON_ORDER.map((id) => [id, { ...WEAPONS[id].crosshair }])),
  savedCrosshairs: [],
  enemyColor: '#ff3b4f',
  evaluation: structuredClone(EVAL_DEFAULTS),
  gameplay: {
    moveInaccuracy: true,
    tracers: true,
    casings: true,
    viewmodel: true,
    hands: true,
    autoReload: true,
    zoomSensitivity: 1,
  },
  keys: { ...DEFAULT_KEYS },
  audio: { volume: 0.6, music: 0.5 },
  touch: { mode: 'auto', sensitivity: 1, invertY: false },
  video: { showFps: true, quality: 'auto', renderScale: 1, shadows: 'auto' },
};

export const ENEMY_COLORS = {
  '#ff3b4f': 'Rojo',
  '#ffe14d': 'Amarillo (daltonismo)',
  '#c86bff': 'Morado (daltonismo)',
  '#36d6ff': 'Cian',
  '#ff8a2a': 'Naranja',
  '#3dff8a': 'Verde',
  '#3d6bff': 'Azul',
  '#f2f2f2': 'Blanco',
};

export const DEFAULT_SAVE = {
  version: 5,
  settings: DEFAULT_SETTINGS,
  profile: {
    rank: null,
    score: null,
    bestScore: null,
    variants: {},
    evaluations: [],
  },
  campaign: { unlocked: {}, best: {} },
  records: {},
};
