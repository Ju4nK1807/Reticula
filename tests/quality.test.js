import { describe, expect, it } from 'vitest';
import { QUALITY_PRESETS, RENDER_SCALE, resolveQuality } from '../src/config/quality.js';
import { SaveStore } from '../src/storage/SaveStore.js';
import { DEFAULT_SAVE } from '../src/config/defaults.js';
import { memoryStorage } from './helpers.js';

describe('calidad gráfica', () => {
  it('los presets bajan la resolución de alta a baja', () => {
    const r = (q) => resolveQuality({ quality: q }, 2).pixelRatio;
    expect(r('alta')).toBe(2);
    expect(r('media')).toBeLessThan(r('alta'));
    expect(r('baja')).toBeLessThan(r('media'));
    expect(r('baja')).toBe(QUALITY_PRESETS.baja.renderScale);
  });

  it('personalizada usa la resolución elegida, dentro de los límites', () => {
    expect(resolveQuality({ quality: 'custom', renderScale: 0.6 }, 1).pixelRatio).toBeCloseTo(0.6);
    expect(resolveQuality({ quality: 'custom', renderScale: 0.1 }, 1).renderScale).toBe(RENDER_SCALE.min);
    expect(resolveQuality({ quality: 'custom', renderScale: 3 }, 1).renderScale).toBe(RENDER_SCALE.max);
    expect(resolveQuality({ quality: 'custom', renderScale: Number.NaN }, 1).renderScale).toBe(1);
  });

  it('nunca supera 2× la densidad de pantalla (pantallas 4K)', () => {
    expect(resolveQuality({ quality: 'alta' }, 3).pixelRatio).toBe(2);
    expect(resolveQuality(undefined, 1.5).pixelRatio).toBe(1.5);
  });
});

describe('restablecer configuración', () => {
  it('vuelve a los valores por defecto y conserva el progreso', () => {
    const store = new SaveStore(memoryStorage());
    store.data.settings.fov = 80;
    store.data.settings.video.quality = 'baja';
    store.data.profile.rank = 'oro';
    store.resetSettings();
    expect(store.data.settings).toEqual(DEFAULT_SAVE.settings);
    expect(store.data.settings).not.toBe(DEFAULT_SAVE.settings);
    expect(store.data.profile.rank).toBe('oro');
  });
});
