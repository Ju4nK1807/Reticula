import { h } from '../../ui/dom.js';
import { button } from '../../ui/components.js';
import { CONTROLS } from '../../ui/settingsScreen.js';
import { sensSummary } from '../../config/sensitivity.js';
import { clock, fixed, pct, shortDate } from '../../utils/format.js';
import { MEDKIT_HEAL, WAVE_HEAL } from './waves.js';

const RULES = [
  ['Oleadas sin fin', 'Elimina a todos los enemigos de la oleada para pasar a la siguiente. La partida termina cuando caes.'],
  ['Cada oleada es más difícil', 'Llegan más enemigos a la vez, más rápidos, más pequeños, con mejor puntería y menos tiempo de reacción.'],
  ['Vigila las 8 puertas', 'Antes de cada entrada la lámpara de la puerta se pone roja y suena un aviso en estéreo. Las flechas junto a la mira señalan enemigos fuera de la vista (rojas si te están apuntando).'],
  ['Sobrevive', `Recuperas ${WAVE_HEAL} de vida al superar una oleada. Los enemigos pueden soltar botiquines (+${MEDKIT_HEAL}): pasa por encima para recogerlos.`],
  ['Puntos', 'Cada oleada multiplica los puntos. Las bajas a la cabeza, la racha (bajas sin recibir daño) y las oleadas perfectas dan bonificación.'],
];

function recordLine(record) {
  if (!record?.totalRuns) return h('p', { class: 'muted' }, 'Aún no tienes récords en este modo.');
  return h(
    'div',
    { class: 'eh-records' },
    h('div', {}, h('small', {}, 'Mejor oleada'), h('strong', {}, record.bestWave)),
    h('div', {}, h('small', {}, 'Récord de puntos'), h('strong', {}, record.bestScore)),
    h('div', {}, h('small', {}, 'Más bajas'), h('strong', {}, record.bestKills)),
    h('div', {}, h('small', {}, 'Partidas'), h('strong', {}, record.totalRuns)),
  );
}

export function endlessIntroScreen(game, { record, onStart, onSettings, onBack }) {
  return h(
    'div',
    { class: 'screen narrow' },
    h(
      'div',
      { class: 'panel' },
      h('div', { class: 'eyebrow' }, 'Modo infinito · Bastión'),
      h('h2', {}, 'Oleadas hasta caer'),
      h('p', { class: 'muted' }, 'Resiste en el patio del Bastión. Los enemigos te disparan de verdad: muévete, usa las coberturas y escucha por dónde entran.'),
      recordLine(record),
      h(
        'ol',
        { class: 'stage-list' },
        RULES.map(([title, text], i) => h('li', {}, h('span', { class: 'num' }, i + 1), h('div', {}, h('strong', {}, title), h('p', {}, text)))),
      ),
      h(
        'dl',
        { class: 'controls compact' },
        CONTROLS.map(([k, v]) => [h('dt', {}, h('kbd', {}, k)), h('dd', {}, v)]),
      ),
      h('p', { class: 'sens-line' }, `Sensibilidad: ${sensSummary(game.settings.sens)}`),
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

function tile(label, value, sub = null, best = false) {
  return h(
    'div',
    { class: `metric${best ? ' eh-best' : ''}` },
    h('span', { class: 'm-value' }, value),
    h('span', { class: 'm-label' }, label),
    sub && h('span', { class: 'm-sub' }, sub),
  );
}

function waveTable(waveLog) {
  if (!waveLog.length) return null;
  const rows = waveLog.slice(-10);
  return h(
    'section',
    { class: 'panel' },
    h('h3', {}, waveLog.length > rows.length ? `Últimas ${rows.length} oleadas` : 'Oleadas superadas'),
    h(
      'table',
      { class: 'eh-table' },
      h('thead', {}, h('tr', {}, ['Oleada', 'Tiempo', 'Bajas', 'Daño recibido', 'Bonificación'].map((t) => h('th', {}, t)))),
      h(
        'tbody',
        {},
        rows.map((w) =>
          h(
            'tr',
            {},
            h('td', {}, w.wave, w.perfect && h('span', { class: 'tag neutral' }, 'perfecta')),
            h('td', {}, `${fixed(w.time, 1)} s`),
            h('td', {}, w.kills),
            h('td', {}, w.damage),
            h('td', {}, `+${w.bonus}`),
          ),
        ),
      ),
    ),
  );
}

function recentRuns(record) {
  const runs = (record.runs ?? []).slice(-6).reverse();
  if (runs.length < 2) return null;
  return h(
    'section',
    { class: 'panel' },
    h('h3', {}, 'Partidas recientes'),
    h(
      'ol',
      { class: 'eh-runs' },
      runs.map((r, i) =>
        h(
          'li',
          { class: i === 0 ? 'current' : '' },
          h('span', {}, shortDate(r.date)),
          h('span', {}, `Oleada ${r.wave}`),
          h('strong', {}, `${r.score} pts`),
        ),
      ),
    ),
  );
}

export function endlessResultsScreen({ result, record, isBest, onRetry, onMenu }) {
  const newRecord = isBest.wave || isBest.score;
  const survived = result.wavesCleared === 1 ? '1 oleada superada' : `${result.wavesCleared} oleadas superadas`;
  return h(
    'div',
    { class: 'screen wide' },
    h(
      'section',
      { class: 'panel eh-hero' },
      h('div', { class: 'eyebrow' }, 'Fin de la partida · Modo infinito'),
      h('div', { class: 'eh-hero-wave' }, h('small', {}, 'Llegaste a la'), h('strong', {}, `Oleada ${result.wave}`)),
      h('p', { class: 'muted' }, `${survived} · ${clock(result.time)} de supervivencia`),
      newRecord && h('div', { class: 'eh-new-record' }, isBest.wave ? '¡Nuevo récord de oleada!' : '¡Nuevo récord de puntos!'),
    ),
    h(
      'section',
      { class: 'metrics' },
      tile('Puntaje', String(result.score), `récord ${record.bestScore}`, isBest.score),
      tile('Oleada', String(result.wave), `récord ${record.bestWave}`, isBest.wave),
      tile('Bajas', String(result.kills), `récord ${record.bestKills}`, isBest.kills),
      tile('Precisión', pct(result.accuracy), `${result.hits}/${result.shots} balas`),
      tile('Headshots', pct(result.hsRate), 'de los impactos'),
      tile('Mejor racha', String(result.bestStreak), 'bajas sin recibir daño', isBest.streak),
    ),
    waveTable(result.waveLog),
    recentRuns(record),
    h('div', { class: 'row center' }, button('Jugar otra vez', onRetry, { variant: 'primary' }), button('Menú principal', onMenu)),
  );
}
