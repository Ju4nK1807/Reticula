import { h } from './dom.js';
import { button, rankBadge, rankLadder } from './components.js';
import { CONTROLS } from './settingsScreen.js';
import { getRank } from '../config/ranks.js';
import { sensSummary } from '../config/sensitivity.js';

export function evalIntroScreen(game, { variant, onStart, onSettings, onBack }) {
  const { profile, settings } = game.store.data;
  const done = profile.variants?.[variant.id];

  return h(
    'div',
    { class: 'screen narrow' },
    h(
      'div',
      { class: 'panel' },
      h('div', { class: 'eyebrow' }, done ? 'Reevaluación' : 'Primer nivel'),
      h('h2', {}, variant.title),
      h('p', { class: 'muted' }, `${variant.desc} Cada disparo fallado resta puntos y el cargador es de 25 balas: recarga con R.`),
      h(
        'ol',
        { class: 'stage-list' },
        variant.stages.map((S, i) =>
          h(
            'li',
            {},
            h('span', { class: 'num' }, i + 1),
            h(
              'div',
              {},
              h('strong', {}, S.info.name),
              S.info.auto && h('span', { class: 'tag neutral' }, 'automático'),
              S.info.health && h('span', { class: 'tag' }, 'te disparan'),
              h('p', {}, S.info.desc),
            ),
          ),
        ),
      ),
      h('dl', { class: 'controls compact' }, CONTROLS.map(([k, v]) => [h('dt', {}, h('kbd', {}, k)), h('dd', {}, v)])),
      h('p', { class: 'sens-line' }, `Sensibilidad: ${sensSummary(settings.sens)}`),
      h(
        'div',
        { class: 'row' },
        button('Comenzar', onStart, { variant: 'primary' }),
        button('Configuración', onSettings),
        button('Volver', onBack, { variant: 'ghost' }),
      ),
    ),
  );
}

function metric({ label, value, sub }) {
  return h('div', { class: 'metric' }, h('span', { class: 'm-value' }, value), h('span', { class: 'm-label' }, label), sub && h('span', { class: 'm-sub' }, sub));
}

function scoreBar(value) {
  return h('div', { class: 'score-bar' }, h('i', { style: { width: `${value}%` } }), h('span', {}, value));
}

export function evalResultsScreen({ variant, summary, results, previous, onRetry, onMenu }) {
  const rank = getRank(summary.rank);
  const prevRank = previous ? getRank(previous.rank) : null;
  const delta = previous ? summary.total - previous.total : null;

  let deltaText = 'Primera evaluación de esta variante';
  if (previous) {
    const sign = delta > 0 ? '+' : '';
    deltaText = `${sign}${delta} vs. anterior (${previous.total}${prevRank ? `, ${prevRank.name}` : ''})`;
  }

  return h(
    'div',
    { class: 'screen wide' },
    h(
      'section',
      { class: 'panel results-hero', style: { '--rank': rank.color } },
      rankBadge(rank, 128),
      h(
        'div',
        { class: 'hero-text' },
        h('div', { class: 'eyebrow' }, `Rango · ${variant.title}`),
        h('h2', { class: 'rank-name' }, rank.name),
        h('div', { class: 'total' }, h('strong', {}, summary.total), h('span', {}, ' / 100')),
        h('div', { class: `delta ${delta > 0 ? 'up' : delta < 0 ? 'down' : ''}` }, deltaText),
      ),
      rankLadder(rank.id),
    ),
    h('section', { class: 'metrics' }, summary.tiles.map(metric)),
    h(
      'section',
      { class: 'stage-cards' },
      variant.stages.map((S) => {
        const r = results[S.info.id];
        return h(
          'div',
          { class: 'panel stage-card' },
          h('h3', {}, S.info.name),
          scoreBar(summary.subscores[S.info.id]),
          h('dl', {}, S.details(r).map(([k, v]) => [h('dt', {}, k), h('dd', {}, v)])),
          h('div', { class: 'stage-points' }, `${r.score} pts`),
        );
      }),
    ),
    h('div', { class: 'row center' }, button('Repetir evaluación', onRetry, { variant: 'primary' }), button('Menú principal', onMenu)),
  );
}
