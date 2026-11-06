import { h } from './dom.js';
import { LOGO_SVG, rankBadge } from './components.js';
import { getRank } from '../config/ranks.js';
import { sensSummary } from '../config/sensitivity.js';
import { shortDate } from '../utils/format.js';
import { PLANNED_MODES, getMode, listModes } from '../modes/registry.js';
import { SERIES_COLORS } from './charts.js';

function menuItem(title, sub, { onClick, disabled = false, primary = false, tag = null }) {
  return h(
    'button',
    { class: `menu-item${primary ? ' primary' : ''}`, onclick: onClick, disabled },
    h('span', { class: 'mi-title' }, title),
    h('span', { class: 'mi-sub' }, sub),
    tag && h('span', { class: 'mi-tag' }, tag),
  );
}

const HISTORY_POINTS = 12;
// Mismos colores (validados para daltonismo sobre la superficie oscura) que las gráficas de Progreso.
const HISTORY_SERIES = [
  { id: 'targets', label: 'Dianas', color: SERIES_COLORS[0] },
  { id: 'bots', label: 'Enemigos', color: SERIES_COLORS[1] },
];

// Mini gráfica de las últimas evaluaciones (0-100), una línea por variante: mezclarlas hacía
// que la curva subiera y bajara solo por alternar entre dianas y enemigos.
function historyChart(evaluations) {
  const W = 220;
  const H = 54;
  const y = (v) => H - 4 - (v / 100) * (H - 8);
  const series = HISTORY_SERIES.map((s) => ({
    ...s,
    points: evaluations.filter((e) => e.variant === s.id).slice(-HISTORY_POINTS).map((e) => e.total),
  })).filter((s) => s.points.length);
  if (!series.some((s) => s.points.length >= 2)) return null;

  const marks = series
    .map((s) => {
      const step = s.points.length > 1 ? W / (s.points.length - 1) : 0;
      const xy = s.points.map((v, i) => [(s.points.length > 1 ? i * step : W).toFixed(1), y(v).toFixed(1)]);
      const path = xy.map(([px, py], i) => `${i ? 'L' : 'M'}${px},${py}`).join(' ');
      const [lx, ly] = xy.at(-1);
      return `<path d="${path}" fill="none" style="stroke:${s.color}" stroke-width="2" vector-effect="non-scaling-stroke"/>` +
        `<circle cx="${lx}" cy="${ly}" r="2.5" style="fill:${s.color}"/>`;
    })
    .join('');

  return h(
    'div',
    { class: 'history' },
    h('div', { class: 'history-title' }, 'Progreso por evaluación'),
    h('div', {
      html: `<svg viewBox="-3 0 ${W + 6} ${H}" width="100%" height="${H}" preserveAspectRatio="none" role="img" aria-label="Historial de puntuación por evaluación">${marks}</svg>`,
    }),
    h(
      'div',
      { class: 'history-legend' },
      series.map((s) =>
        h('span', {}, h('i', { style: { background: s.color } }), `${s.label} · ${s.points.at(-1)}`, h('small', {}, ` (${s.points.length})`)),
      ),
    ),
  );
}

function variantRow(label, data) {
  const rank = getRank(data?.rank);
  return h(
    'div',
    { class: 'variant-row' },
    h('span', { class: 'vr-label' }, label),
    rank
      ? h('span', { class: 'vr-rank', style: { color: rank.color } }, `${rank.name} · ${data.score}`, h('small', {}, ` (récord ${data.best})`))
      : h('span', { class: 'vr-rank muted' }, 'Sin evaluar'),
  );
}

// Botones de modos: los registrados (modes/registry.js) y, desactivados, los planeados que aún no existen.
function modeItems(game, rank, onMode) {
  const registered = listModes().map((m) => {
    const locked = m.locked?.(game) ?? null;
    return { order: m.order, item: menuItem(m.title, m.desc, { onClick: () => onMode(m.id), primary: m.primary, disabled: !!locked, tag: locked }) };
  });
  const planned = PLANNED_MODES.filter((p) => !getMode(p.id)).map((p) => ({
    order: p.order,
    item: menuItem(p.title, p.desc, { disabled: true, tag: p.needsRank && !rank ? 'Requiere evaluación' : 'Próximamente' }),
  }));
  return [...registered, ...planned].sort((a, b) => a.order - b.order).map((x) => x.item);
}

export function menuScreen(game, { onMode, onArsenal, onProgress, onSettings }) {
  const { profile, settings } = game.store.data;
  const rank = getRank(profile.rank);
  const last = profile.evaluations.at(-1);
  const v = profile.variants ?? {};

  const profileCard = h(
    'aside',
    { class: 'profile-card' },
    rankBadge(rank, 96),
    rank
      ? [
          h('div', { class: 'pc-rank', style: { color: rank.color } }, rank.name),
          last && h('div', { class: 'pc-meta' }, `Última evaluación: ${shortDate(last.date)}`),
        ]
      : [
          h('div', { class: 'pc-rank' }, 'Sin rango'),
          h('p', { class: 'pc-meta' }, 'Haz una evaluación (≈ 3 min, 5 fases) para conocer tu rango y desbloquear la campaña.'),
        ],
    h('div', { class: 'variants' }, variantRow('Dianas', v.targets), variantRow('Enemigos', v.bots)),
    historyChart(profile.evaluations),
  );

  return h(
    'div',
    { class: 'screen menu' },
    h(
      'header',
      { class: 'brand' },
      h('div', { class: 'logo', html: LOGO_SVG }),
      h('div', {}, h('h1', {}, 'Retícula'), h('p', { class: 'tagline' }, 'Entrenador de puntería 3D para cualquier shooter')),
    ),
    h(
      'div',
      { class: 'menu-grid' },
      h(
        'nav',
        { class: 'menu-list' },
        modeItems(game, rank, onMode),
        menuItem('Arsenal', 'Pistola, subfusil, rifle, escopeta y francotirador, cada una con su mira', { onClick: onArsenal }),
        menuItem('Progreso', 'Gráficas, historial de sesiones y copia de seguridad', { onClick: onProgress }),
        menuItem('Configuración', 'Sensibilidad de cualquier juego, FOV, mira, controles', { onClick: onSettings }),
      ),
      profileCard,
    ),
    h('footer', { class: 'menu-footer' }, `Sensibilidad: ${sensSummary(settings.sens)} · FOV ${settings.fov}°`),
  );
}
