import { DEFAULT_SAVE } from '../config/defaults.js';
import { refreshProfile } from './profile.js';
import { upgradeCrosshair } from '../ui/Crosshair.js';

const KEY = 'reticula.save.v1';
const BACKUP_KEY = 'reticula.save.corrupt';
export const SAVE_VERSION = DEFAULT_SAVE.version;

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function compatible(base, v) {
  if (base === null || base === undefined) return true;
  if (Array.isArray(base)) return Array.isArray(v);
  if (isPlainObject(base)) return isPlainObject(v);
  if (typeof base === 'number') return typeof v === 'number' && Number.isFinite(v);
  return typeof v === typeof base;
}

export function deepMerge(base, over) {
  for (const [k, v] of Object.entries(over ?? {})) {
    if (isPlainObject(base[k]) && isPlainObject(v)) deepMerge(base[k], v);
    else if (compatible(base[k], v)) base[k] = v;
  }
  return base;
}

export const MIGRATIONS = {
  1: () => {},
  2: (data) => {
    data.profile.evaluations = data.profile.evaluations.filter((e) => isPlainObject(e) && e.variant);
    refreshProfile(data.profile);
  },
  3: (data) => {
    const v = data.settings.video;
    if (v.quality === 'alta' || (v.quality === 'media' && v.touchTuned)) v.quality = 'auto';
    delete v.touchTuned;
  },
  4: (data) => {
    const s = data.settings;
    upgradeCrosshair(s.crosshair);
    for (const c of Object.values(s.weaponCrosshairs ?? {})) upgradeCrosshair(c);
  },
};

export function migrate(data, fromVersion) {
  let v = Number.isInteger(fromVersion) && fromVersion > 0 ? fromVersion : 1;
  if (v >= SAVE_VERSION) {
    data.version = Math.max(v, SAVE_VERSION);
    return false;
  }
  for (; v < SAVE_VERSION; v++) MIGRATIONS[v]?.(data);
  data.version = SAVE_VERSION;
  return true;
}

export function hydrate(parsed) {
  if (!isPlainObject(parsed) || (!isPlainObject(parsed.profile) && !isPlainObject(parsed.settings))) {
    throw new Error('No es un guardado de Retícula');
  }
  const data = deepMerge(structuredClone(DEFAULT_SAVE), parsed);
  const migrated = migrate(data, parsed.version);
  return { data, migrated };
}

export const EXPORT_APP = 'reticula';

export class SaveStore {
  constructor(storage = globalThis.localStorage) {
    this.storage = storage;
    this.data = this.load();
  }

  load() {
    const fresh = structuredClone(DEFAULT_SAVE);
    let raw = null;
    try {
      raw = this.storage?.getItem(KEY);
    } catch {
      return fresh;
    }
    if (!raw) return fresh;
    try {
      const parsed = JSON.parse(raw);
      const { data, migrated } = hydrate(parsed);
      if (migrated) {
        this.data = data;
        this.persist();
      }
      return data;
    } catch {
      try {
        this.storage.setItem(BACKUP_KEY, raw);
      } catch {
      }
      return structuredClone(DEFAULT_SAVE);
    }
  }

  persist() {
    try {
      this.storage?.setItem(KEY, JSON.stringify(this.data));
    } catch {
    }
  }

  exportData() {
    return JSON.stringify({ app: EXPORT_APP, exportedAt: new Date().toISOString(), ...this.data }, null, 2);
  }

  importData(input) {
    try {
      const parsed = typeof input === 'string' ? JSON.parse(input) : input;
      const { data } = hydrate(parsed);
      delete data.app;
      delete data.exportedAt;
      this.data = data;
      this.persist();
      return true;
    } catch {
      return false;
    }
  }

  modeRecord(modeId) {
    this.data.records[modeId] ??= {};
    return this.data.records[modeId];
  }

  resetSettings() {
    this.data.settings = structuredClone(DEFAULT_SAVE.settings);
    this.persist();
  }

  resetProgress() {
    const settings = this.data.settings;
    this.data = structuredClone(DEFAULT_SAVE);
    this.data.settings = settings;
    this.persist();
  }
}
