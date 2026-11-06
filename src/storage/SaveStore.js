import { DEFAULT_SAVE } from '../config/defaults.js';
import { refreshProfile } from './profile.js';

const KEY = 'reticula.save.v1';
const BACKUP_KEY = 'reticula.save.corrupt'; // copia de un guardado ilegible, para no perderlo
export const SAVE_VERSION = DEFAULT_SAVE.version;

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// ¿`v` puede reemplazar a `base`? Evita que un guardado corrupto (p. ej. crosshair: null o
// sens.value: "abc") rompa el juego: si el valor por defecto tiene tipo, el guardado debe respetarlo.
function compatible(base, v) {
  if (base === null || base === undefined) return true;
  if (Array.isArray(base)) return Array.isArray(v);
  if (isPlainObject(base)) return isPlainObject(v);
  if (typeof base === 'number') return typeof v === 'number' && Number.isFinite(v);
  return typeof v === typeof base;
}

// Mezcla `over` sobre `base` para que claves nuevas en DEFAULT_SAVE aparezcan en partidas viejas.
export function deepMerge(base, over) {
  for (const [k, v] of Object.entries(over ?? {})) {
    if (isPlainObject(base[k]) && isPlainObject(v)) deepMerge(base[k], v);
    else if (compatible(base[k], v)) base[k] = v;
  }
  return base;
}

// Pasos de migración: MIGRATIONS[n] convierte un guardado de la versión n a la n + 1.
// Se aplican sobre el guardado ya mezclado con los valores por defecto.
export const MIGRATIONS = {
  // v1 → v2: aparecieron las variantes de evaluación; no hay datos que transformar.
  1: () => {},
  // v2 → v3: el rango general deja de ser "el de la última evaluación" y pasa a ser el mejor
  // rango actual entre variantes; se descartan entradas del historial sin variante.
  2: (data) => {
    data.profile.evaluations = data.profile.evaluations.filter((e) => isPlainObject(e) && e.variant);
    refreshProfile(data.profile);
  },
  // v4: calidad automática. Quien seguía con la calidad por defecto (Alta) o con la Media que se
  // ponía sola en teléfonos pasa a Automática; las elecciones explícitas (Baja, Personalizada) se respetan.
  3: (data) => {
    const v = data.settings.video;
    if (v.quality === 'alta' || (v.quality === 'media' && v.touchTuned)) v.quality = 'auto';
    delete v.touchTuned;
  },
};

// Lleva un guardado (ya mezclado) a la versión actual. Devuelve true si cambió algo.
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

// Convierte un guardado leído (objeto) en datos válidos y actuales: valores por defecto para lo que
// falte, tipos validados y migraciones. Lanza un error si no es un guardado de Retícula.
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
      return fresh; // almacenamiento bloqueado (modo privado estricto)
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
      // Guardado ilegible: se guarda una copia antes de que el siguiente persist() lo reemplace.
      try {
        this.storage.setItem(BACKUP_KEY, raw);
      } catch {
        // sin espacio: no se puede hacer más
      }
      return structuredClone(DEFAULT_SAVE);
    }
  }

  persist() {
    try {
      this.storage?.setItem(KEY, JSON.stringify(this.data));
    } catch {
      // Sin almacenamiento disponible (modo privado, cuota llena): el juego sigue funcionando.
    }
  }

  // Copia de seguridad: todo el guardado (progreso y configuración) como texto JSON.
  exportData() {
    return JSON.stringify({ app: EXPORT_APP, exportedAt: new Date().toISOString(), ...this.data }, null, 2);
  }

  // Restaura una copia (texto JSON u objeto). Devuelve true si se aplicó; false si no era válida
  // (en ese caso no se toca nada).
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

  // Datos propios de un modo (récords, progreso). Cada modo define su forma; llamar a persist() al cambiarlos.
  modeRecord(modeId) {
    this.data.records[modeId] ??= {};
    return this.data.records[modeId];
  }

  // Vuelve a la configuración por defecto, conservando el progreso.
  resetSettings() {
    this.data.settings = structuredClone(DEFAULT_SAVE.settings);
    this.persist();
  }

  // Borra rango, progreso y récords, conservando la configuración.
  resetProgress() {
    const settings = this.data.settings;
    this.data = structuredClone(DEFAULT_SAVE);
    this.data.settings = settings;
    this.persist();
  }
}
