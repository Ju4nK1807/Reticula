import { h } from '../../ui/dom.js';
import { button } from '../../ui/components.js';
import { getRank } from '../../config/ranks.js';
import { clock, pct } from '../../utils/format.js';
import { CAMPAIGN_MAPS, levelsOf } from './campaignData.js';
import { levelStars, levelUnlocked, mapStars, mapState } from './progress.js';

const MAX_STARS = 3;

export function starsRow(n, size = '') {
  return h(
    'span',
    { class: `cp-stars ${size}`, 'aria-label': `${n} de ${MAX_STARS} estrellas` },
    Array.from({ length: MAX_STARS }, (_, i) => h('i', { class: i < n ? 'on' : '' }, '★')),
  );
}

const rankNames = (ids) => ids.map((id) => getRank(id)?.name ?? id).join(' · ');

// --- Selección de mapa ---------------------------------------------------------------------------

export function campaignMapsScreen({ progress, rankId, onMap, onBack }) {
  const rank = getRank(rankId);
  return h(
    'div',
    { class: 'screen wide' },
    h(
      'header',
      { class: 'screen-head' },
      h(
        'div',
        {},
        h('div', { class: 'eyebrow' }, 'Campaña'),
        h('h2', {}, 'Un mapa por rango'),
        h('p', { class: 'muted' }, rank ? `Tu rango: ${rank.name}. Empieza por el mapa recomendado; completar un mapa abre el siguiente.` : 'Haz una evaluación para conocer tu rango.'),
      ),
      button('← Volver', onBack, { variant: 'ghost' }),
    ),
    h(
      'section',
      { class: 'cp-maps' },
      CAMPAIGN_MAPS.map((map) => {
        const st = mapState(progress, map, rankId);
        const stars = mapStars(progress, map);
        const total = levelsOf(map.id).length * MAX_STARS;
        return h(
          'article',
          { class: `panel cp-map${st.unlocked ? '' : ' locked'}`, style: { '--map': map.color } },
          h('div', { class: 'cp-map-band' }),
          h('div', { class: 'cp-map-head' }, h('h3', {}, map.name), st.recommended && h('span', { class: 'tag neutral' }, 'recomendado')),
          h('div', { class: 'cp-map-ranks' }, rankNames(map.ranks)),
          h('p', { class: 'muted small' }, map.desc),
          h(
            'div',
            { class: 'cp-map-foot' },
            h('span', { class: 'cp-progress' }, h('i', {}, '★'), ` ${stars}/${total}`, st.completed && h('span', { class: 'tag neutral' }, 'completado')),
            st.unlocked ? button('Entrar', () => onMap(map.id), { variant: st.recommended ? 'primary' : '' }) : h('span', { class: 'cp-lock' }, st.reason),
          ),
        );
      }),
    ),
  );
}

// --- Selección de nivel ---------------------------------------------------------------------------

export function campaignLevelsScreen({ map, progress, rankId, suggestion, onLevel, onBack, onSuggested }) {
  const levels = levelsOf(map.id);
  return h(
    'div',
    { class: 'screen wide' },
    h(
      'header',
      { class: 'screen-head' },
      h('div', {}, h('div', { class: 'eyebrow' }, `Campaña · ${rankNames(map.ranks)}`), h('h2', {}, map.name)),
      button('← Mapas', onBack, { variant: 'ghost' }),
    ),
    suggestion && suggestionBox(suggestion, onSuggested),
    h(
      'section',
      { class: 'cp-levels' },
      levels.map((level) => {
        const open = levelUnlocked(progress, level, rankId);
        const best = progress.best[level.id];
        return h(
          'article',
          { class: `panel cp-level${open ? '' : ' locked'}`, style: { '--map': map.color } },
          h('div', { class: 'cp-level-num' }, level.number),
          h('h3', {}, level.name),
          h('div', { class: 'cp-kind' }, level.kind),
          h('p', { class: 'muted small' }, level.desc),
          h(
            'dl',
            { class: 'cp-facts' },
            h('dt', {}, 'Enemigos'),
            h('dd', {}, level.total),
            h('dt', {}, 'Tiempo'),
            h('dd', {}, clock(level.time)),
            h('dt', {}, 'Metas'),
            h('dd', {}, level.goals.map((g, i) => `${'★'.repeat(i + 1)} ${g}`).join('  ·  ')),
          ),
          h(
            'div',
            { class: 'cp-level-foot' },
            h('div', {}, starsRow(levelStars(progress, level.id)), best && h('small', { class: 'muted' }, ` mejor ${best.rating}`)),
            open ? button(best ? 'Jugar' : 'Comenzar', () => onLevel(level.id), { variant: best ? '' : 'primary' }) : h('span', { class: 'cp-lock' }, 'Consigue ★ en el nivel anterior'),
          ),
        );
      }),
    ),
  );
}

function suggestionBox(map, onSuggested) {
  return h(
    'div',
    { class: 'cp-suggest' },
    h(
      'div',
      {},
      h('strong', {}, 'Te recomendamos practicar un mapa más abajo'),
      h('p', {}, `Tus últimos intentos aquí quedaron lejos de la meta. En ${map.name} los bots son más grandes y lentos: afianza ahí la puntería y vuelve más fuerte.`),
    ),
    button(`Ir a ${map.name}`, () => onSuggested(map.id)),
  );
}

// --- Resultados ---------------------------------------------------------------------------------

function tile(label, value, sub = null) {
  return h('div', { class: 'metric' }, h('span', { class: 'm-value' }, value), h('span', { class: 'm-label' }, label), sub && h('span', { class: 'm-sub' }, sub));
}

export function campaignResultsScreen({ map, level, result, outcome, suggestion, next, onNext, onRetry, onLevels, onMenu, onSuggested }) {
  const status = result.died ? 'Has caído' : result.completed ? 'Misión completada' : 'Se acabó el tiempo';
  const passed = result.stars >= 1;
  const notices = [];
  if (outcome.isBest && result.rating > 0) notices.push('Nuevo récord en este nivel');
  if (outcome.completedMap) notices.push(`¡Completaste ${map.name}!`);
  if (outcome.unlockedLevel && next) notices.push(`Desbloqueaste: ${next.name}${next.mapId !== map.id ? ` (${CAMPAIGN_MAPS.find((m) => m.id === next.mapId).name})` : ''}`);
  return h(
    'div',
    { class: 'screen wide' },
    h(
      'section',
      { class: `panel cp-hero ${passed ? 'pass' : 'fail'}`, style: { '--map': map.color } },
      h('div', { class: 'eyebrow' }, `${map.name} · nivel ${level.number} · ${level.name}`),
      h('h2', {}, status),
      starsRow(result.stars, 'big'),
      h('div', { class: 'cp-rating' }, h('strong', {}, result.rating), h('span', {}, ' / 100')),
      h('p', { class: 'muted' }, passed ? `Meta superada (★ ${level.goals[0]})` : result.died ? 'Morir deja la misión sin estrellas.' : `Meta: ★ ${level.goals[0]} · te faltaron ${Math.max(0, level.goals[0] - result.rating)} puntos`),
      notices.length > 0 && h('ul', { class: 'cp-notices' }, notices.map((n) => h('li', {}, n))),
    ),
    h(
      'section',
      { class: 'metrics' },
      tile('Enemigos', `${result.kills}/${result.total}`, result.missed ? `${result.missed} sin eliminar` : 'todos eliminados'),
      tile('Precisión', pct(result.accuracy), `${result.hits}/${result.shots} balas`),
      tile('Headshots', pct(result.hsRate), 'de los impactos'),
      tile('Vida', String(Math.round(result.health)), `${result.damageTaken} de daño recibido`),
      tile('Tiempo', clock(result.time), `de ${clock(result.timeLimit)}`),
      tile('Puntos', String(result.score), 'de la misión'),
    ),
    suggestion && suggestionBox(suggestion, onSuggested),
    h(
      'div',
      { class: 'row center' },
      next && passed && button(`Siguiente: ${next.name}`, onNext, { variant: 'primary' }),
      button('Repetir nivel', onRetry, { variant: next && passed ? '' : 'primary' }),
      button('Niveles', onLevels),
      button('Menú principal', onMenu, { variant: 'ghost' }),
    ),
  );
}
