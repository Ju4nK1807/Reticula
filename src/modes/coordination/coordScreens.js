import { h } from '../../ui/dom.js';
import { button } from '../../ui/components.js';
import { controlList } from '../../ui/settingsScreen.js';
import { sensSummary } from '../../config/sensitivity.js';
import { DRILL_TIME, DRILLS, COLOR_RULES } from './drills.js';
import { levelFor } from './coordScoring.js';
import { shapeIcon } from './CoordHud.js';

function scoreBar(value) {
  return h('div', { class: 'score-bar' }, h('i', { style: { width: `${value}%` } }), h('span', {}, value));
}

function levelBadge(score) {
  const level = levelFor(score);
  return h('span', { class: 'cs-level', style: { '--level': level.color } }, level.name);
}

function bestLine(entry) {
  if (!entry?.plays) return h('span', { class: 'muted' }, 'Sin jugar');
  return h('span', {}, `Récord ${entry.best}`, h('small', { class: 'muted' }, ` · última ${entry.last} · ${entry.plays} ${entry.plays === 1 ? 'vez' : 'veces'}`));
}

// Pantalla de selección: circuito completo o un ejercicio suelto.
export function coordSelectScreen(game, { record, onDrill, onCircuit, onSettings, onBack }) {
  const circuit = record.circuit;
  return h(
    'div',
    { class: 'screen' },
    h(
      'header',
      { class: 'screen-head' },
      h('div', {}, h('div', { class: 'eyebrow' }, 'Coordinación ojo-mano · Cúpula'), h('h2', {}, 'Entrena la conexión entre lo que ves y tu mano')),
      button('← Volver', onBack, { variant: 'ghost' }),
    ),
    h(
      'section',
      { class: 'panel cs-circuit' },
      h(
        'div',
        {},
        h('h3', {}, 'Circuito completo'),
        h('p', { class: 'muted' }, `Los cuatro ejercicios seguidos (${DRILLS.length} × ${DRILL_TIME} s). Al final obtienes tu índice de coordinación de 0 a 100. Munición ilimitada: aquí solo cuenta tu coordinación.`),
        h('div', { class: 'cs-best' }, bestLine(circuit), circuit.plays ? levelBadge(circuit.best) : null),
      ),
      button('Jugar circuito', onCircuit, { variant: 'primary' }),
    ),
    h(
      'section',
      { class: 'cs-grid' },
      DRILLS.map((D, i) =>
        h(
          'article',
          { class: 'panel cs-drill' },
          h('div', { class: 'cs-num' }, i + 1),
          h('h3', {}, D.info.name),
          h('p', { class: 'cs-short' }, D.info.short),
          h('p', { class: 'muted small' }, D.info.desc),
          D.info.id === 'color' &&
            h('div', { class: 'cs-shapes' }, COLOR_RULES.map((r) => h('span', { html: `${shapeIcon(r.shape, r.color, 18)} ${r.name}` }))),
          h('div', { class: 'cs-foot' }, h('div', { class: 'cs-best' }, bestLine(record.drills[D.info.id])), button('Jugar', () => onDrill(D.info.id))),
        ),
      ),
    ),
    h(
      'section',
      { class: 'panel' },
      h('h3', {}, 'Controles'),
      h('dl', { class: 'controls compact' }, controlList().map(([k, v]) => [h('dt', {}, h('kbd', {}, k)), h('dd', {}, v)])),
      h('p', { class: 'sens-line' }, `Sensibilidad: ${sensSummary(game.settings.sens)}`),
      h('div', { class: 'row' }, button('Configuración', onSettings)),
    ),
  );
}

// Resultados de un ejercicio o del circuito.
export function coordResultsScreen({ kind, drills, results, ratings, index, isBest, record, onRetry, onSelect, onMenu }) {
  const single = kind === 'drill';
  const D = drills[0];
  const score = single ? ratings[D.info.id] : index;
  const entry = single ? record.drills[D.info.id] : record.circuit;
  const level = levelFor(score);
  return h(
    'div',
    { class: 'screen wide' },
    h(
      'section',
      { class: 'panel cs-hero', style: { '--level': level.color } },
      h('div', { class: 'eyebrow' }, single ? 'Coordinación · ejercicio' : 'Coordinación · circuito completo'),
      h('h2', {}, single ? D.info.name : 'Índice de coordinación'),
      h('div', { class: 'cs-score' }, h('strong', {}, score), h('span', {}, ' / 100')),
      levelBadge(score),
      h('p', { class: 'muted' }, isBest ? '¡Nuevo récord!' : `Récord: ${entry.best}`),
    ),
    h(
      'section',
      { class: `stage-cards ${single ? 'cs-single' : 'cs-four'}` },
      drills.map((S) =>
        h(
          'div',
          { class: 'panel stage-card' },
          h('h3', {}, S.info.name),
          scoreBar(ratings[S.info.id]),
          h('dl', {}, S.details(results[S.info.id]).map(([k, v]) => [h('dt', {}, k), h('dd', {}, v)])),
          h('div', { class: 'stage-points' }, `${results[S.info.id].score} pts`),
        ),
      ),
    ),
    h(
      'div',
      { class: 'row center' },
      button(single ? 'Repetir ejercicio' : 'Repetir circuito', onRetry, { variant: 'primary' }),
      button('Elegir otro ejercicio', onSelect),
      button('Menú principal', onMenu, { variant: 'ghost' }),
    ),
  );
}
