import './menu.css';
import { h } from './dom.js';
import { LOGO_SVG, rankBadge } from './components.js';
import { icon, MODE_ICONS } from './icons.js';
import { weaponIcon } from './weaponIcons.js';
import { SERIES_COLORS } from './charts.js';
import { modeSummary, nextStep } from './menuData.js';
import { getRank } from '../config/ranks.js';
import { sensSummary } from '../config/sensitivity.js';
import { getWeapon } from '../combat/weapons.js';
import { shortDate } from '../utils/format.js';
import { PLANNED_MODES, getMode, listModes } from '../modes/registry.js';

const HISTORY_POINTS = 12;
// Mismos colores (validados para daltonismo sobre la superficie oscura) que las gráficas de Progreso.
const HISTORY_SERIES = [
  { id: 'targets', label: 'Dianas', color: SERIES_COLORS[0] },
  { id: 'bots', label: 'Enemigos', color: SERIES_COLORS[1] },
];
const QUALITY_LABELS = { alta: 'Alta', media: 'Media', baja: 'Baja', custom: 'Personalizada' };

// Mini gráfica de las últimas evaluaciones (0-100), una línea por variante.
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
      return `<path d="${path}" fill="none" style="stroke:${s.color}" stroke-width="2" vector-effect="non-scaling-stroke"/><circle cx="${lx}" cy="${ly}" r="2.5" style="fill:${s.color}"/>`;
    })
    .join('');
  return h(
    'div',
    { class: 'history' },
    h('div', { class: 'history-title' }, 'Progreso por evaluación'),
    h('div', { html: `<svg viewBox="-3 0 ${W + 6} ${H}" width="100%" height="${H}" preserveAspectRatio="none" role="img" aria-label="Historial de puntuación por evaluación">${marks}</svg>` }),
    h('div', { class: 'history-legend' }, series.map((s) => h('span', {}, h('i', { style: { background: s.color } }), `${s.label} · ${s.points.at(-1)}`))),
  );
}

function variantRow(label, data) {
  const rank = getRank(data?.rank);
  return h(
    'div',
    { class: 'variant-row' },
    h('span', { class: 'vr-label' }, label),
    rank
      ? h('span', { class: 'vr-rank', style: { color: rank.color } }, `${rank.name} · ${data.score}`, h('small', {}, ` récord ${data.best}`))
      : h('span', { class: 'vr-rank muted' }, 'Sin evaluar'),
  );
}

// Tarjeta de un modo: ícono, título, descripción y su dato propio (rango, estrellas, récord…).
function modeCard(game, entry, data, onMode) {
  const locked = entry.locked?.(game) ?? null;
  const summary = modeSummary(entry.id, data);
  const meta = h('span', { class: 'hm-meta' });
  if (locked) {
    const lock = h('span', { class: 'hm-lock', html: icon('lock', 14) });
    lock.append(h('span', {}, locked));
    meta.append(lock);
  } else if (summary) {
    meta.append(h('strong', { style: summary.color ? { color: summary.color } : null }, summary.text), h('small', {}, summary.sub));
  }
  return h(
    'button',
    { class: `hub-mode${entry.primary ? ' primary' : ''}`, type: 'button', disabled: !!locked, onclick: () => onMode(entry.id) },
    h('span', { class: 'hm-icon', html: icon(MODE_ICONS[entry.id] ?? 'target', 22) }),
    h('span', { class: 'hm-body' }, h('span', { class: 'hm-title' }, entry.title), h('span', { class: 'hm-desc' }, entry.desc)),
    meta,
  );
}

function plannedCard(p, rank) {
  return h(
    'button',
    { class: 'hub-mode', type: 'button', disabled: true },
    h('span', { class: 'hm-icon', html: icon('lock', 22) }),
    h('span', { class: 'hm-body' }, h('span', { class: 'hm-title' }, p.title), h('span', { class: 'hm-desc' }, p.desc)),
    h('span', { class: 'hm-meta' }, h('span', { class: 'hm-lock' }, p.needsRank && !rank ? 'Requiere evaluación' : 'Próximamente')),
  );
}

function iconLabel(cls, iconName, label, size = 18) {
  const el = h('span', { class: cls, html: icon(iconName, size) });
  el.append(h('span', {}, label));
  return el;
}

export function menuScreen(game, { onMode, onArsenal, onProgress, onSettings }) {
  const data = game.store.data;
  const { profile, settings } = data;
  const rank = getRank(profile.rank);
  const last = profile.evaluations.at(-1);
  const step = nextStep(data);
  const stepLocked = getMode(step.modeId)?.locked?.(game);
  const weapon = getWeapon(settings.weapon);

  const modes = [
    ...listModes().map((m) => ({ order: m.order, el: modeCard(game, m, data, onMode) })),
    ...PLANNED_MODES.filter((p) => !getMode(p.id)).map((p) => ({ order: p.order, el: plannedCard(p, rank) })),
  ]
    .sort((a, b) => a.order - b.order)
    .map((x) => x.el);

  const navButton = (label, iconName, onClick) => {
    const b = h('button', { class: 'hub-nav-btn', type: 'button', onclick: onClick });
    b.append(iconLabel('hub-nav-inner', iconName, label));
    return b;
  };
  const cta = h('button', { class: 'btn primary', type: 'button', disabled: !!stepLocked, onclick: () => onMode(step.modeId) });
  cta.append(iconLabel('btn-inner', 'play', step.cta, 16));

  return h(
    'div',
    { class: 'screen hub' },
    // Barra superior: marca y navegación.
    h(
      'header',
      { class: 'hub-top' },
      h('div', { class: 'hub-brand' }, h('div', { class: 'logo', html: LOGO_SVG }), h('div', {}, h('h1', {}, 'Retícula'), h('p', {}, 'Entrenador de puntería 3D'))),
      h('nav', { class: 'hub-nav', 'aria-label': 'Secciones' }, navButton('Arsenal', 'gun', onArsenal), navButton('Progreso', 'chart', onProgress), navButton('Configuración', 'gear', onSettings)),
    ),
    h(
      'div',
      { class: 'hub-grid' },
      h(
        'main',
        { class: 'hub-main' },
        // Siguiente paso recomendado: lo más útil que puede hacer el jugador ahora.
        h(
          'section',
          { class: 'hub-hero' },
          h('div', { class: 'hh-glow', 'aria-hidden': 'true' }),
          h('div', { class: 'hh-body' }, h('div', { class: 'eyebrow' }, step.eyebrow), h('h2', {}, step.title), h('p', {}, step.desc), h('div', { class: 'row' }, cta)),
          h('div', { class: 'hh-art', 'aria-hidden': 'true', html: icon(MODE_ICONS[step.modeId] ?? 'target', 120) }),
        ),
        h('div', { class: 'hub-section-title' }, h('h3', {}, 'Modos de juego')),
        h('section', { class: 'hub-modes' }, modes),
      ),
      h(
        'aside',
        { class: 'hub-side' },
        h(
          'section',
          { class: 'panel hub-profile' },
          rankBadge(rank, 84),
          h(
            'div',
            { class: 'hp-rank' },
            h('small', {}, 'Rango general'),
            h('strong', { style: rank ? { color: rank.color } : null }, rank ? rank.name : 'Sin rango'),
            last && h('span', { class: 'muted small' }, `Última evaluación: ${shortDate(last.date)}`),
          ),
          h('div', { class: 'variants' }, variantRow('Dianas', profile.variants?.targets), variantRow('Enemigos', profile.variants?.bots)),
          historyChart(profile.evaluations),
        ),
        h(
          'section',
          { class: 'panel hub-loadout' },
          h('h3', {}, 'Equipamiento'),
          h(
            'button',
            { class: 'hl-weapon', type: 'button', onclick: onArsenal, 'aria-label': `Arma: ${weapon.name}. Abrir el arsenal` },
            h('span', { class: 'hl-icon', html: weaponIcon(weapon.id) }),
            h('span', {}, h('strong', {}, weapon.name), h('small', {}, weapon.category)),
            h('span', { class: 'hl-go', html: icon('arrow', 16) }),
          ),
          h('div', { class: 'hl-line' }, h('span', {}, 'Sensibilidad'), h('strong', {}, sensSummary(settings.sens).split(' · ').at(-1))),
          h('div', { class: 'hl-line' }, h('span', {}, 'FOV'), h('strong', {}, `${settings.fov}°`)),
          h('div', { class: 'hl-line' }, h('span', {}, 'Calidad'), h('strong', {}, QUALITY_LABELS[settings.video.quality] ?? 'Alta')),
        ),
      ),
    ),
    h(
      'footer',
      { class: 'hub-footer' },
      [['Esc', 'pausa'], ['R', 'recargar'], ['1–5', 'armas'], ['B', 'modo de disparo'], ['[ ]', 'sensibilidad']].map(([k, v]) => h('span', {}, h('kbd', {}, k), ` ${v}`)),
    ),
  );
}
