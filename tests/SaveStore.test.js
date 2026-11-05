import { describe, expect, it } from 'vitest';
import { SaveStore, SAVE_VERSION, deepMerge, migrate } from '../src/storage/SaveStore.js';
import { DEFAULT_SAVE } from '../src/config/defaults.js';
import { memoryStorage, SAVE_KEY } from './helpers.js';

const load = (save) => new SaveStore(memoryStorage({ [SAVE_KEY]: JSON.stringify(save) }));

describe('SaveStore', () => {
  it('sin guardado devuelve los valores por defecto', () => {
    const store = new SaveStore(memoryStorage());
    expect(store.data).toEqual(DEFAULT_SAVE);
    expect(store.data).not.toBe(DEFAULT_SAVE);
  });

  it('funciona sin almacenamiento disponible', () => {
    const store = new SaveStore(undefined);
    expect(store.data.version).toBe(SAVE_VERSION);
    expect(() => store.persist()).not.toThrow();
  });

  it('sobrevive a un almacenamiento que lanza errores', () => {
    const throwing = {
      getItem: () => {
        throw new Error('bloqueado');
      },
      setItem: () => {
        throw new Error('lleno');
      },
    };
    const store = new SaveStore(throwing);
    expect(store.data.version).toBe(SAVE_VERSION);
    expect(() => store.persist()).not.toThrow();
  });

  it('respalda un guardado ilegible antes de reemplazarlo', () => {
    const storage = memoryStorage({ [SAVE_KEY]: '{roto' });
    const store = new SaveStore(storage);
    expect(store.data).toEqual(DEFAULT_SAVE);
    expect(storage.getItem('reticula.save.corrupt')).toBe('{roto');
  });

  it('agrega claves nuevas a guardados viejos y conserva las existentes', () => {
    const store = load({ version: SAVE_VERSION, settings: { fov: 90, sens: { value: 2 } } });
    expect(store.data.settings.fov).toBe(90);
    expect(store.data.settings.sens.value).toBe(2);
    expect(store.data.settings.sens.dpi).toBe(DEFAULT_SAVE.settings.sens.dpi);
    expect(store.data.settings.crosshair).toEqual(DEFAULT_SAVE.settings.crosshair);
  });

  it('ignora valores de tipo incorrecto', () => {
    const store = load({
      version: SAVE_VERSION,
      settings: { crosshair: null, fov: 'ancho', sens: { value: null, game: 7 }, gameplay: [] },
    });
    const s = store.data.settings;
    expect(s.crosshair).toEqual(DEFAULT_SAVE.settings.crosshair);
    expect(s.fov).toBe(DEFAULT_SAVE.settings.fov);
    expect(s.sens.value).toBe(DEFAULT_SAVE.settings.sens.value);
    expect(s.sens.game).toBe(DEFAULT_SAVE.settings.sens.game);
    expect(s.gameplay).toEqual(DEFAULT_SAVE.settings.gameplay);
  });

  it('modeRecord crea y reutiliza la sección de un modo', () => {
    const store = new SaveStore(memoryStorage());
    store.modeRecord('endless').best = 7;
    expect(store.modeRecord('endless')).toEqual({ best: 7 });
  });

  it('resetProgress borra progreso y conserva la configuración', () => {
    const storage = memoryStorage();
    const store = new SaveStore(storage);
    store.data.settings.fov = 95;
    store.data.profile.rank = 'oro';
    store.modeRecord('endless').best = 3;
    store.resetProgress();
    expect(store.data.settings.fov).toBe(95);
    expect(store.data.profile.rank).toBeNull();
    expect(store.data.records).toEqual({});
    expect(JSON.parse(storage.getItem(SAVE_KEY)).settings.fov).toBe(95);
  });
});

describe('migraciones', () => {
  it('v2 → v3: el rango general pasa a ser el mejor entre variantes y se guarda', () => {
    const storage = memoryStorage({
      [SAVE_KEY]: JSON.stringify({
        version: 2,
        profile: {
          rank: 'bronce',
          variants: { targets: { rank: 'oro', score: 55, best: 60 }, bots: { rank: 'bronce', score: 20, best: 25 } },
          evaluations: [{ variant: 'targets', total: 55 }, null, { total: 3 }],
        },
      }),
    });
    const store = new SaveStore(storage);
    expect(store.data.version).toBe(3);
    expect(store.data.profile.rank).toBe('oro');
    expect(store.data.profile.score).toBe(55);
    expect(store.data.profile.bestScore).toBe(60);
    expect(store.data.profile.evaluations).toHaveLength(1);
    expect(JSON.parse(storage.getItem(SAVE_KEY)).version).toBe(3);
  });

  it('un guardado sin versión se trata como v1', () => {
    const data = structuredClone(DEFAULT_SAVE);
    expect(migrate(data, undefined)).toBe(true);
    expect(data.version).toBe(SAVE_VERSION);
  });

  it('no toca guardados de la versión actual o futura', () => {
    const data = structuredClone(DEFAULT_SAVE);
    expect(migrate(data, SAVE_VERSION)).toBe(false);
    expect(migrate(data, SAVE_VERSION + 1)).toBe(false);
    expect(data.version).toBe(SAVE_VERSION + 1);
  });

  it('deepMerge mezcla objetos anidados sin reemplazarlos', () => {
    const base = { a: { b: 1, c: 2 } };
    deepMerge(base, { a: { b: 5 } });
    expect(base.a).toEqual({ b: 5, c: 2 });
  });
});
