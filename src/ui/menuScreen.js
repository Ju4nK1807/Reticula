import { h } from './dom.js';
import { LOGO_SVG, rankBadge } from './components.js';
import { getRank } from '../config/ranks.js';
import { sensSummary } from '../config/sensitivity.js';
import { shortDate } from '../utils/format.js';

function menuItem(title, sub, { onClick, disabled = false, primary = false, tag = null }) {
  return h(
    'button',
    { class: `menu-item${primary ? ' primary' : ''}`, onclick: onClick, disabled },
    h('span', { class: 'mi-title' }, title),
    h('span', { class: 'mi-sub' }, sub),
    tag && h('span', { class: 'mi-tag' }, tag),
  );
}

// Mini gráfica de las últimas evaluaciones (0-100).
function historyChart(evaluations) {
  const points = evaluations.slice(-12).map((e) => e.total);
  if (points.length < 2) return null;
  const W = 220;
  const H = 54;
  const step = W / (points.length - 1);
  const y = (v) => H - 4 - (v / 100) * (H - 8);
  const path = points.map((v, i) => `${i ? 'L' : 'M'}${(i * step).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return h(
    'div',
    { class: 'history' },
    h('div', { class: 'history-title' }, `Últimas ${points.length} evaluaciones`),
    h('div', {
      html: `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" preserveAspectRatio="none" aria-label="Historial de puntuación">
        <path d="${path}" fill="none" stroke="var(--accent)" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>`,
    }),
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

export function menuScreen(game, { onEvaluation, onSettings }) {
  const { profile, settings } = game.store.data;
  const rank = getRank(profile.rank);
  const last = profile.evaluations.at(-1);
  const v = profile.variants ?? {};
  const lockedTag = rank ? 'Próximamente' : 'Requiere evaluación';

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
        menuItem('Evaluación · Dianas', 'Clásica: flicking, tracking, reacción, multi-objetivo y precisión', {
          onClick: () => onEvaluation('targets'),
          primary: true,
        }),
        menuItem('Evaluación · Enemigos', 'Bots reales: flicks, tracking, peeks, headshots y combate en movimiento', {
          onClick: () => onEvaluation('bots'),
          primary: true,
        }),
        menuItem('Campaña', 'Mapas y bots según tu rango', { disabled: true, tag: lockedTag }),
        menuItem('Coordinación ojo-mano', 'Secuencias, colores, periferia, doble tarea', { disabled: true, tag: 'Próximamente' }),
        menuItem('Modo infinito', 'Oleadas sin fin hasta caer', { disabled: true, tag: lockedTag }),
        menuItem('Configuración', 'Sensibilidad de cualquier juego, FOV, mira, controles', { onClick: onSettings }),
      ),
      profileCard,
    ),
    h('footer', { class: 'menu-footer' }, `Sensibilidad: ${sensSummary(settings.sens)} · FOV ${settings.fov}°`),
  );
}
