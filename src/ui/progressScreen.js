import './progress.css';
import { h } from './dom.js';
import { button } from './components.js';
import { lineChart } from './charts.js';
import {
  DRILL_LABELS,
  MODE_LABELS,
  PHASE_LABELS,
  VARIANT_LABELS,
  campaignSummary,
  coordinationSeries,
  endlessSeries,
  evaluationSeries,
  overview,
  phaseSeries,
  sessions,
} from '../stats/history.js';

const TABS = { evaluations: 'Evaluaciones', modes: 'Modos', history: 'Historial', data: 'Datos' };
const HISTORY_LIMIT = 200;

function tile(label, value, sub = null) {
  return h('div', { class: 'metric' }, h('span', { class: 'm-value' }, value), h('span', { class: 'm-label' }, label), sub && h('span', { class: 'm-sub' }, sub));
}

function chips(options, current, onPick) {
  return h(
    'div',
    { class: 'chips pg-chips', role: 'tablist' },
    Object.entries(options).map(([id, label]) =>
      h('button', { class: `chip${id === current ? ' active' : ''}`, type: 'button', role: 'tab', 'aria-selected': id === current ? 'true' : 'false', onclick: () => onPick(id) }, label),
    ),
  );
}

function panel(title, ...children) {
  return h('section', { class: 'panel pg-panel' }, h('h3', {}, title), ...children);
}

// --- Pestañas -----------------------------------------------------------------------------------

function evaluationsTab(data, state, rerender) {
  const totals = evaluationSeries(data);
  const variant = state.variant;
  const phases = phaseSeries(data, variant);
  return [
    panel(
      'Puntuación total por evaluación',
      lineChart({
        label: 'Puntuación total de las evaluaciones con dianas y con enemigos',
        series: [
          { id: 'targets', label: VARIANT_LABELS.targets, points: totals.targets },
          { id: 'bots', label: VARIANT_LABELS.bots, points: totals.bots },
        ],
        empty: 'Haz una evaluación para empezar a ver tu progreso.',
      }),
    ),
    panel(
      'Por fase',
      chips(VARIANT_LABELS, variant, (v) => {
        state.variant = v;
        rerender();
      }),
      h(
        'div',
        { class: 'pg-multiples' },
        Object.entries(phases).map(([id, points]) =>
          h(
            'div',
            { class: 'pg-multiple' },
            h('h4', {}, PHASE_LABELS[variant][id] ?? id),
            lineChart({ label: `${PHASE_LABELS[variant][id]}: puntuación por evaluación`, series: [{ id, label: PHASE_LABELS[variant][id], points }], height: 130, yTicks: [0, 50, 100], empty: 'Sin datos.' }),
          ),
        ),
      ),
    ),
  ];
}

function modesTab(data) {
  const endless = endlessSeries(data);
  const bestWave = data.records?.endless?.bestWave ?? 0;
  const top = Math.max(10, Math.ceil((bestWave + 2) / 5) * 5);
  const coord = coordinationSeries(data);
  const camp = campaignSummary(data);
  return [
    panel(
      'Campaña',
      h(
        'div',
        { class: 'pg-maps' },
        camp.map((m) =>
          h(
            'div',
            { class: 'pg-map' },
            h('div', { class: 'pg-map-head' }, h('strong', {}, m.name), h('span', {}, `★ ${m.stars}/${m.max}`)),
            h('div', { class: 'pg-bar', role: 'img', 'aria-label': `${m.name}: ${m.stars} de ${m.max} estrellas` }, h('i', { style: { width: `${(m.stars / m.max) * 100}%` } })),
            h('small', { class: 'muted' }, m.completed ? 'Completado' : m.stars ? 'En curso' : 'Sin empezar'),
          ),
        ),
      ),
    ),
    panel(
      'Modo infinito · oleada alcanzada',
      lineChart({
        label: 'Oleada alcanzada en cada partida del modo infinito',
        series: [{ id: 'wave', label: 'Oleada', points: endless }],
        yMax: top,
        yTicks: [0, top / 2, top],
        empty: 'Juega una partida del modo infinito para ver tu progreso.',
      }),
    ),
    panel(
      'Coordinación · índice del circuito',
      lineChart({ label: 'Índice de coordinación en cada circuito', series: [{ id: 'circuit', label: 'Circuito', points: coord.circuit }], empty: 'Juega un circuito completo para ver tu índice.' }),
    ),
    panel(
      'Coordinación · ejercicios',
      lineChart({
        label: 'Puntuación de cada ejercicio de coordinación',
        series: Object.entries(coord.drills).map(([id, points]) => ({ id, label: DRILL_LABELS[id], points })),
        empty: 'Juega algún ejercicio de coordinación para ver tu progreso.',
      }),
    ),
  ];
}

function historyTab(data, state, rerender) {
  const all = sessions(data);
  const filtered = state.filter === 'all' ? all : all.filter((s) => s.mode === state.filter);
  const rows = filtered.slice(0, HISTORY_LIMIT);
  const date = (iso) => new Date(iso).toLocaleString('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  return [
    panel(
      `Historial de sesiones (${filtered.length})`,
      chips({ all: 'Todos', ...MODE_LABELS }, state.filter, (f) => {
        state.filter = f;
        rerender();
      }),
      rows.length
        ? h(
            'div',
            { class: 'pg-table-wrap' },
            h(
              'table',
              { class: 'pg-table' },
              h('thead', {}, h('tr', {}, ['Fecha', 'Modo', 'Sesión', 'Resultado', 'Detalle'].map((t) => h('th', {}, t)))),
              h(
                'tbody',
                {},
                rows.map((s) => h('tr', {}, h('td', {}, date(s.date)), h('td', {}, MODE_LABELS[s.mode]), h('td', {}, s.title), h('td', { class: 'pg-result' }, s.result), h('td', { class: 'muted' }, s.detail))),
              ),
            ),
          )
        : h('p', { class: 'muted' }, 'Todavía no hay sesiones en este modo.'),
      filtered.length > HISTORY_LIMIT && h('p', { class: 'muted small' }, `Se muestran las ${HISTORY_LIMIT} más recientes.`),
    ),
  ];
}

function dataTab(game, refresh) {
  const fileInput = h('input', { type: 'file', accept: 'application/json,.json', hidden: true });
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (!confirm('¿Reemplazar tu progreso y configuración actuales por los de este archivo?')) return;
      if (game.store.importData(String(reader.result))) {
        game.applySettings();
        game.ui.toast('Progreso importado.');
        refresh();
      } else {
        game.ui.toast('Ese archivo no es una copia de Retícula.');
      }
    };
    reader.readAsText(file);
  });

  const exportBtn = button('Exportar progreso', () => {
    const blob = new Blob([game.store.exportData()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: `reticula-progreso-${new Date().toISOString().slice(0, 10)}.json` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    game.ui.toast('Copia descargada.');
  }, { variant: 'primary' });

  return [
    panel(
      'Copia de seguridad',
      h('p', { class: 'muted' }, 'Tu progreso se guarda solo en este navegador. Exporta una copia para no perderlo al borrar los datos del navegador, o para llevarlo a otro computador.'),
      h('div', { class: 'row' }, exportBtn, button('Importar copia', () => fileInput.click()), fileInput),
      h('p', { class: 'muted small' }, 'La copia incluye rangos, récords, campaña, historial y configuración (sensibilidad, mira, video).'),
    ),
  ];
}

// --- Pantalla -----------------------------------------------------------------------------------

export function progressScreen(game, { onBack }) {
  const state = { tab: 'evaluations', variant: 'targets', filter: 'all' };
  const root = h('div', { class: 'screen wide' });

  const render = () => {
    const data = game.store.data;
    const o = overview(data);
    const content =
      state.tab === 'evaluations'
        ? evaluationsTab(data, state, render)
        : state.tab === 'modes'
          ? modesTab(data)
          : state.tab === 'history'
            ? historyTab(data, state, render)
            : dataTab(game, render);
    root.replaceChildren(
      h('header', { class: 'screen-head' }, h('div', {}, h('div', { class: 'eyebrow' }, 'Tu progreso'), h('h2', {}, 'Progreso')), button('← Volver', onBack, { variant: 'ghost' })),
      h(
        'section',
        { class: 'metrics' },
        tile('Sesiones', String(o.sessions), 'en todos los modos'),
        tile('Mejor evaluación', `${o.bestEvaluation}`, `${o.evaluations} evaluaciones`),
        tile('Estrellas', `${o.campaignStars}/${o.campaignMaxStars}`, 'campaña'),
        tile('Mejor oleada', String(o.endlessBestWave), 'modo infinito'),
        tile('Coordinación', String(o.coordinationBest), 'mejor circuito'),
        tile('Días entrenados', String(o.trainingDays), 'con al menos una sesión'),
      ),
      chips(TABS, state.tab, (t) => {
        state.tab = t;
        render();
      }),
      ...content,
    );
  };
  render();
  return root;
}
