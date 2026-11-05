// Presets de calidad gráfica. `renderScale` reduce la resolución interna de render (la interfaz se
// sigue viendo nítida); `maxPixelRatio` limita el trabajo en pantallas de alta densidad (4K, portátiles).
// Es el ajuste que más FPS gana en equipos modestos.

export const QUALITY_PRESETS = {
  alta: { label: 'Alta', renderScale: 1, maxPixelRatio: 2 },
  media: { label: 'Media', renderScale: 0.85, maxPixelRatio: 1.5 },
  baja: { label: 'Baja (más FPS)', renderScale: 0.7, maxPixelRatio: 1 },
};

export const QUALITY_OPTIONS = { ...Object.fromEntries(Object.entries(QUALITY_PRESETS).map(([k, v]) => [k, v.label])), custom: 'Personalizada' };

export const RENDER_SCALE = { min: 0.5, max: 1, step: 0.05 };

// Resolución efectiva a partir de la configuración de video: { quality, renderScale }.
export function resolveQuality(video, devicePixelRatio = 1) {
  const preset = QUALITY_PRESETS[video?.quality] ?? null;
  const scale = preset ? preset.renderScale : clampScale(video?.renderScale ?? 1);
  const maxRatio = preset ? preset.maxPixelRatio : 2;
  return { renderScale: scale, pixelRatio: Math.min(devicePixelRatio, maxRatio) * scale };
}

function clampScale(v) {
  const n = Number.isFinite(v) ? v : 1;
  return Math.min(RENDER_SCALE.max, Math.max(RENDER_SCALE.min, n));
}
