import { DEFAULT_SAVE } from '../config/defaults.js';

const KEY = 'reticula.save.v1';

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// Mezcla `over` sobre `base` para que claves nuevas en DEFAULT_SAVE aparezcan en partidas viejas.
function deepMerge(base, over) {
  for (const [k, v] of Object.entries(over ?? {})) {
    if (isPlainObject(base[k]) && isPlainObject(v)) deepMerge(base[k], v);
    else base[k] = v;
  }
  return base;
}

export class SaveStore {
  constructor() {
    this.data = this.load();
  }

  load() {
    const fresh = structuredClone(DEFAULT_SAVE);
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? deepMerge(fresh, JSON.parse(raw)) : fresh;
    } catch {
      return fresh;
    }
  }

  persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch {
      // Sin almacenamiento disponible (modo privado, cuota llena): el juego sigue funcionando.
    }
  }

  // Borra rango, progreso y récords, conservando la configuración.
  resetProgress() {
    const settings = this.data.settings;
    this.data = structuredClone(DEFAULT_SAVE);
    this.data.settings = settings;
    this.persist();
  }
}
