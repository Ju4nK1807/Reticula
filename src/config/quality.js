export const QUALITY_PRESETS = {
  alta: { label: 'Alta', renderScale: 1, maxPixelRatio: 2, detail: 'alta' },
  media: { label: 'Media', renderScale: 0.85, maxPixelRatio: 1.5, detail: 'media' },
  baja: { label: 'Baja (más FPS)', renderScale: 0.7, maxPixelRatio: 1, detail: 'baja' },
};
export const DETAIL_LEVELS = ['alta', 'media', 'baja'];

export const QUALITY_OPTIONS = {
  auto: 'Automática (recomendada)',
  ...Object.fromEntries(Object.entries(QUALITY_PRESETS).map(([k, v]) => [k, v.label])),
  custom: 'Personalizada',
};
const AUTO_MAX_PIXEL_RATIO = 1.5;

export const RENDER_SCALE = { min: 0.5, max: 1, step: 0.05 };

export const SHADOW_OPTIONS = { auto: 'Según el detalle', on: 'Activadas', off: 'Desactivadas' };

export function resolveQuality(video, devicePixelRatio = 1) {
  if (video?.quality === 'auto') {
    const scale = clampScale(video.autoScale ?? 1);
    const detail = DETAIL_LEVELS.includes(video.autoDetail) ? video.autoDetail : 'media';
    return { renderScale: scale, pixelRatio: Math.min(devicePixelRatio, AUTO_MAX_PIXEL_RATIO) * scale, detail, auto: true };
  }
  const preset = QUALITY_PRESETS[video?.quality] ?? null;
  const scale = preset ? preset.renderScale : clampScale(video?.renderScale ?? 1);
  const maxRatio = preset ? preset.maxPixelRatio : 2;
  const detail = preset ? preset.detail : DETAIL_LEVELS.includes(video?.detail) ? video.detail : 'media';
  return { renderScale: scale, pixelRatio: Math.min(devicePixelRatio, maxRatio) * scale, detail };
}

function clampScale(v) {
  const n = Number.isFinite(v) ? v : 1;
  return Math.min(RENDER_SCALE.max, Math.max(RENDER_SCALE.min, n));
}
