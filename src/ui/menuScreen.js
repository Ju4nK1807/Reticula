// Pantalla de título: la escena 3D en vivo de fondo, el logo, un menú vertical de texto y un panel
// que describe la opción enfocada. Submenú "Jugar" con todos los modos.
import './menu.css';
import { h } from './dom.js';
import { LOGO_SVG, rankBadge } from './components.js';
import { icon, MODE_ICONS } from './icons.js';
import { weaponIcon } from './weaponIcons.js';
import { SERIES_COLORS } from './charts.js';
import { menuList } from './menuList.js';
import { modeSummary, nextStep } from './menuData.js';
import { getRank } from '../config/ranks.js';
import { sensSummary } from '../config/sensitivity.js';
import { getWeapon } from '../combat/weapons.js';
import { shortDate } from '../utils/format.js';
import { PLANNED_MODES, getMode, listModes } from '../modes/registry.js';
import { version } from '../../package.json';

const HISTORY_POINTS = 12;
// Mismos colores (validados para daltonismo sobre la superficie oscura) que las gráficas de Progreso.
const HISTORY_SERIES = [
  { id: 'targets', label: 'Dianas', color: SERIES_COLORS[0] },
  { id: 'bots', label: 'Enemigos', color: SERIES_COLORS[1] },
];
const QUALITY_LABELS = { alta: 'Alta', media: 'Media', baja: 'Baja', custom: 'Personalizada' };

// Dónde estaba el jugador la última vez (al volver de un modo o de Configuración se reabre ahí).
const memory = { path: 'main', focus: null, introPlayed: false };

/** True si corre como app de escritorio (Electron sirve el juego desde reticula://). */
export const isDesktopApp = () => typeof location !== 'undefined' && location.protocol === 'reticula:';

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

// Micro-gráfica de barras con las últimas evaluaciones (junto al título del panel). Sin datos, nada.
function microBars(evaluations) {
  const vals = evaluations.slice(-18).map((e) => e.total);
  if (vals.length < 2) return null;
  const W = 72;
  const H = 26;
  const bw = W / vals.length;
  const bars = vals
    .map((v, i) => {
      const bh = Math.max(2, (v / 100) * H);
      return `<rect x="${(i * bw + 0.5).toFixed(1)}" y="${(H - bh).toFixed(1)}" width="${Math.max(1, bw - 1.5).toFixed(1)}" height="${bh.toFixed(1)}"/>`;
    })
    .join('');
  return h('div', { class: 'td-micro', title: 'Últimas evaluaciones', html: `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true">${bars}</svg>` });
}

// Tabla de modos: nombre · ícono de estado · estado (los bloqueados con candado y en gris).
function modeTable(game, data) {
  return h(
    'div',
    { class: 'td-table' },
    listModes().map((m) => {
      const locked = m.locked?.(game);
      const s = modeSummary(m.id, data);
      return h(
        'div',
        { class: `td-tr${locked ? ' locked' : ''}` },
        h('span', { class: 'td-name' }, m.title),
        h('span', { class: 'td-ico', html: icon(locked ? 'lock' : MODE_ICONS[m.id] ?? 'target', 15) }),
        h('span', { class: 'td-val', style: !locked && s?.color ? { color: s.color } : null }, locked ? 'Bloqueado' : s?.text ?? '—'),
      );
    }),
  );
}

// Filas "dato · valor" del panel de detalle.
function rows(list) {
  return h(
    'dl',
    { class: 'td-rows' },
    list.filter(Boolean).map(([k, v, color]) => [h('dt', {}, k), h('dd', { style: color ? { color } : null }, v)]),
  );
}

function variantValue(data) {
  const rank = getRank(data?.rank);
  return rank ? [`${rank.name} · ${data.score}`, rank.color] : ['Sin evaluar', null];
}

// Contenido del panel de detalle para cada opción.
function detailFor(item, ctx) {
  const { data, rank, step, weapon, settings } = ctx;
  const d = item.detail ?? {};
  const parts = [];
  if (d.art) parts.push(h('div', { class: 'td-art', 'aria-hidden': 'true', html: d.art }));
  parts.push(h('div', { class: 'eyebrow' }, d.eyebrow ?? ''), h('div', { class: 'td-title' }, h('h2', {}, d.title ?? item.label), microBars(data.profile.evaluations)));
  if (d.desc) parts.push(h('p', { class: 'td-desc' }, d.desc));
  if (item.locked) parts.push(h('div', { class: 'td-lock', html: icon('lock', 14) }, h('span', {}, item.locked)));

  switch (d.kind) {
    case 'play':
      parts.push(modeTable(ctx.game, data));
      break;
    case 'mode': {
      const s = modeSummary(item.id, data);
      if (s && !item.locked) parts.push(rows([['Tu progreso', s.text, s.color], s.sub && ['', s.sub]]));
      break;
    }
    case 'arsenal':
      parts.push(
        rows([
          ['Arma equipada', weapon.name],
          ['Tipo', weapon.category],
          ['Cargador', `${weapon.magazine} balas`],
        ]),
      );
      break;
    case 'progress': {
      const [tv, tc] = variantValue(data.profile.variants?.targets);
      const [bv, bc] = variantValue(data.profile.variants?.bots);
      const last = data.profile.evaluations.at(-1);
      parts.push(
        rows([
          ['Rango general', rank ? rank.name : 'Sin rango', rank?.color],
          ['Dianas', tv, tc],
          ['Enemigos', bv, bc],
          last && ['Última evaluación', shortDate(last.date)],
        ]),
      );
      const chart = historyChart(data.profile.evaluations);
      if (chart) parts.push(chart);
      break;
    }
    case 'settings':
      parts.push(
        rows([
          ['Sensibilidad', sensSummary(settings.sens).split(' · ').at(-1)],
          ['Campo de visión', `${settings.fov}°`],
          ['Calidad', QUALITY_LABELS[settings.video.quality] ?? 'Alta'],
        ]),
      );
      break;
    case 'continue':
      if (step.modeId && !item.locked) {
        const s = modeSummary(step.modeId, data);
        if (s) parts.push(rows([[getMode(step.modeId)?.title ?? 'Modo', [s.text, s.sub].filter(Boolean).join(' · '), s.color]]));
      }
      break;
    default:
  }
  return parts;
}

export function menuScreen(game, { onMode, onArsenal, onProgress, onSettings, onHelp }) {
  const data = game.store.data;
  const { profile, settings } = data;
  const rank = getRank(profile.rank);
  const step = nextStep(data);
  const weapon = getWeapon(settings.weapon);
  const ctx = { game, data, rank, step, weapon, settings };
  const sfx = game.sfx;
  const touch = !!game.touchMode;

  const remember = (path, focus) => {
    memory.path = path;
    memory.focus = focus;
  };

  // --- Opciones ---------------------------------------------------------------
  const hasProgress = profile.evaluations.length > 0;
  const mainItems = [
    {
      id: 'continue',
      icon: 'play',
      label: hasProgress ? 'Continuar' : 'Empezar',
      locked: getMode(step.modeId)?.locked?.(game) ?? null,
      onSelect: () => {
        remember('main', 'continue');
        onMode(step.modeId);
      },
      detail: { kind: 'continue', eyebrow: step.eyebrow, title: step.title, desc: step.desc, art: icon(MODE_ICONS[step.modeId] ?? 'target', 150) },
    },
    {
      id: 'play',
      icon: 'target',
      label: 'Jugar',
      badge: `${listModes().length} modos`,
      onSelect: () => openList('play', null, 'right'),
      detail: { kind: 'play', eyebrow: 'Modos de juego', title: 'Jugar', desc: 'Elige cualquier modo: evaluación, campaña, coordinación ojo-mano o el modo infinito.', art: icon('target', 150) },
    },
    {
      id: 'arsenal',
      icon: 'gun',
      label: 'Arsenal',
      onSelect: () => {
        remember('main', 'arsenal');
        onArsenal();
      },
      detail: { kind: 'arsenal', eyebrow: 'Equipamiento', title: 'Arsenal', desc: 'Cinco armas con su propio manejo, sonido y mira. La evaluación usa siempre el rifle.', art: weaponIcon(weapon.id) },
    },
    {
      id: 'progress',
      icon: 'chart',
      label: 'Progreso',
      onSelect: () => {
        remember('main', 'progress');
        onProgress();
      },
      detail: { kind: 'progress', eyebrow: 'Estadísticas', title: 'Progreso', desc: 'Tu rango, el historial de evaluaciones y los récords de cada modo.', art: icon('chart', 150) },
    },
    {
      id: 'settings',
      icon: 'gear',
      label: 'Configuración',
      onSelect: () => {
        remember('main', 'settings');
        onSettings();
      },
      detail: { kind: 'settings', eyebrow: 'Ajustes', title: 'Configuración', desc: 'Sensibilidad, mira, video, sonido y controles.', art: icon('gear', 150) },
    },
    isDesktopApp() && {
      id: 'quit',
      icon: 'back',
      label: 'Salir',
      tone: 'quiet',
      onSelect: () => window.close(),
      detail: { eyebrow: 'Escritorio', title: 'Salir', desc: 'Cierra Retícula. Tu progreso ya está guardado.' },
    },
  ].filter(Boolean);

  const modeItems = () => [
    ...[
      ...listModes().map((m) => ({
        order: m.order,
        item: {
          id: m.id,
          icon: MODE_ICONS[m.id] ?? 'target',
          label: m.title,
          locked: m.locked?.(game) ?? null,
          onSelect: () => {
            remember('play', m.id);
            onMode(m.id);
          },
          detail: { kind: 'mode', eyebrow: m.primary ? 'Recomendado' : 'Modo', title: m.title, desc: m.desc, art: icon(MODE_ICONS[m.id] ?? 'target', 150) },
        },
      })),
      ...PLANNED_MODES.filter((p) => !getMode(p.id)).map((p) => ({
        order: p.order,
        item: { id: p.id, label: p.title, locked: p.needsRank && !rank ? 'Requiere evaluación' : 'Próximamente', detail: { title: p.title, desc: p.desc } },
      })),
    ]
      .sort((a, b) => a.order - b.order)
      .map((x) => x.item),
    { id: 'back', icon: 'back', label: 'Volver', back: true, tone: 'quiet', onSelect: () => openList('main', 'play', 'left'), detail: { title: 'Volver', desc: 'Regresar al menú principal.' } },
  ];

  // --- Estructura -------------------------------------------------------------
  const detail = h('aside', { class: 'ts-detail', 'aria-live': 'polite' });
  const heading = h('div', { class: 'ts-heading' });
  const listSlot = h('div', { class: 'ts-list' });

  const showDetail = (item) => detail.replaceChildren(...detailFor(item, ctx));

  function openList(path, focus, enter = null) {
    memory.path = path;
    const items = path === 'play' ? modeItems() : mainItems;
    heading.replaceChildren(...(path === 'play' ? [h('span', { class: 'eyebrow' }, 'Jugar'), h('span', { class: 'ts-crumb' }, 'Elige un modo')] : []));
    heading.hidden = path !== 'play';
    const list = menuList(items, {
      sfx,
      initial: focus ?? items[0].id,
      enter,
      onFocus: showDetail,
      onBack: path === 'play' ? () => openList('main', 'play', 'left') : null,
    });
    listSlot.querySelector('[data-disposable]')?._dispose?.();
    listSlot.replaceChildren(list);
    showDetail(items.find((it) => it.id === focus) ?? items[0]);
  }

  const evals = profile.evaluations.length;
  const profileChip = h(
    'div',
    { class: 'ts-rank' },
    h(
      'button',
      { class: 'ts-profile', type: 'button', onclick: () => { sfx.uiSelect(); remember('main', 'progress'); onProgress(); }, 'aria-label': `Rango: ${rank ? rank.name : 'sin rango'}. Abrir Progreso` },
      rankBadge(rank, 46),
      h('span', {}, h('small', {}, 'Rango'), h('strong', { style: rank ? { color: rank.color } : null }, rank ? rank.name : 'Sin rango')),
    ),
    h(
      'div',
      { class: 'ts-rank-meta' },
      h('span', { class: 'ts-ticks', 'aria-hidden': 'true' }),
      h('span', {}, `${evals} ${evals === 1 ? 'evaluación' : 'evaluaciones'}`),
      onHelp && h('button', { class: 'ts-help', type: 'button', 'aria-label': 'Ayuda: controles', title: 'Controles', onclick: () => { sfx.uiSelect(); remember(memory.path, memory.focus); onHelp(); } }, '?'),
    ),
  );

  const hints = touch
    ? []
    : [['↑ ↓', 'Navegar'], ['Enter', 'Elegir'], ['Esc', 'Volver']].map(([k, v]) => h('span', {}, h('kbd', {}, k), v));

  const screen = h(
    'div',
    { class: `screen title-screen${memory.introPlayed ? '' : ' intro'}` },
    h(
      'header',
      { class: 'ts-brand' },
      h('div', { class: 'ts-logo', html: LOGO_SVG }),
      h('div', { class: 'ts-word' }, h('h1', {}, 'Retícula'), h('p', {}, 'Entrenador de puntería 3D')),
    ),
    profileChip,
    h('nav', { class: 'ts-menu', 'aria-label': 'Menú principal' }, heading, listSlot),
    detail,
    h(
      'footer',
      { class: 'ts-footer' },
      h('div', { class: 'ts-hints' }, hints),
      h('div', { class: 'ts-version' }, h('span', {}, weapon.name), h('span', {}, `v${version}`)),
    ),
  );
  memory.introPlayed = true;

  openList(memory.path, memory.focus);
  return screen;
}
