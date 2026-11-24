import { h } from './dom.js';
import { button, rankBadge, rankLadder } from './components.js';
import { controlList, isTouchUI } from './settingsScreen.js';
import { getRank } from '../config/ranks.js';
import { sensSummary } from '../config/sensitivity.js';
import { field, select, slider } from './controls.js';
import { ENEMY_COLORS } from '../config/defaults.js';
import { WEAPONS } from '../combat/weapons.js';
import { EVAL_DEFAULTS, EVAL_LIMITS, EVAL_WEAPONS, TARGET_COLORS, customChanges, evalConfig, isRanked } from '../modes/evaluation/evalConfig.js';

function configLine(variant, cfg) {
  const parts = [WEAPONS[cfg.weapon].name];
  if (variant.id === 'targets') parts.push(cfg.targetColor === 'auto' ? 'dianas de colores' : `dianas ${TARGET_COLORS[cfg.targetColor].toLowerCase()}`);
  parts.push(`${cfg.count} a la vez`, `tamaño ×${cfg.size}`, `velocidad ×${cfg.speed}`, `${cfg.duration} s por fase`);
  return parts.join(' · ');
}

export function evalIntroScreen(game, { variant, config, stages = variant.stages, ranked = true, onStart, onConfig, onSettings, onBack }) {
  const { profile, settings } = game.store.data;
  const done = profile.variants?.[variant.id];
  const cfg = config ?? evalConfig(settings.evaluation);
  const changes = customChanges(variant, cfg);

  return h(
    'div',
    { class: 'screen narrow' },
    h(
      'div',
      { class: 'panel' },
      h('div', { class: 'eyebrow' }, ranked ? (done ? 'Reevaluación' : 'Primer nivel') : 'Práctica personalizada'),
      h('h2', {}, variant.title),
      h('p', { class: 'muted' }, `${variant.desc} Cada disparo fallado resta puntos y la munición es infinita.`),
      h(
        'div',
        { class: `eval-config-card${ranked ? '' : ' custom'}` },
        h('div', {}, h('strong', {}, ranked ? 'Configuración estándar · da rango' : 'Práctica · no cambia tu rango'), h('p', { class: 'small muted' }, configLine(variant, cfg))),
        !ranked && h('p', { class: 'small' }, `Cambiaste: ${changes.join(', ')}. Vuelve a la estándar en «Personalizar» para evaluarte.`),
      ),
      h(
        'ol',
        { class: 'stage-list' },
        stages.map((S, i) =>
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
      h('dl', { class: 'controls compact' }, controlList().map(([k, v]) => [h('dt', {}, h('kbd', {}, k)), h('dd', {}, v)])),
      h('p', { class: 'sens-line' }, `Sensibilidad: ${sensSummary(settings.sens)}`),
      h(
        'div',
        { class: 'row' },
        button('Comenzar', onStart, { variant: 'primary' }),
        onConfig && button('Personalizar', onConfig),
        button('Configuración', onSettings),
        button('Volver', onBack, { variant: 'ghost' }),
      ),
    ),
  );
}

export function evalConfigScreen(game, { variant, onChange, onDone }) {
  const s = game.store.data.settings;
  const cfg = evalConfig(s.evaluation);
  const status = h('div', { class: 'eval-config-card' });
  const save = () => {
    const clean = evalConfig(cfg);
    onChange?.(clean);
    const ranked = isRanked(variant, clean);
    status.className = `eval-config-card${ranked ? '' : ' custom'}`;
    status.replaceChildren(
      h('strong', {}, ranked ? 'Configuración estándar · da rango' : 'Práctica · no cambia tu rango'),
      h('p', { class: 'small muted' }, ranked ? 'Así se comparan los rangos entre jugadores y partidas.' : `Cambiaste: ${customChanges(variant, clean).join(', ')}.`),
    );
  };
  const lim = (k, fmt) => ({ min: EVAL_LIMITS[k][0], max: EVAL_LIMITS[k][1], step: EVAL_LIMITS[k][2], fmt });
  const sl = (k, fmt) => slider(cfg, k, lim(k, fmt), save);
  const swatch = h('i', { class: 'eval-swatch', style: { background: swatchBg(cfg.targetColor) } });
  const weapons = Object.fromEntries(EVAL_WEAPONS.map((id) => [id, `${WEAPONS[id].name}${id === EVAL_DEFAULTS.weapon ? ' (estándar)' : ''}`]));
  const targets = variant.id === 'targets';

  const phaseBoxes = h(
    'div',
    { class: 'eval-phases' },
    variant.stages.map((S) => {
      const on = !cfg.skip[variant.id].includes(S.info.id);
      return h(
        'label',
        { class: 'eval-phase' },
        h('input', {
          type: 'checkbox',
          checked: on,
          onchange: (e) => {
            const list = new Set(cfg.skip[variant.id]);
            if (e.target.checked) list.delete(S.info.id);
            else list.add(S.info.id);
            cfg.skip[variant.id] = [...list];
            save();
          },
        }),
        h('span', {}, S.info.name),
      );
    }),
  );

  const view = h(
    'div',
    { class: 'screen narrow' },
    h(
      'div',
      { class: 'panel eval-config' },
      h('div', { class: 'eyebrow' }, variant.title),
      h('h2', {}, 'Personalizar'),
      status,
      h('h3', {}, 'Arma y colores'),
      field('Arma', select(weapons, cfg.weapon, (v) => {
        cfg.weapon = v;
        save();
      }), 'La que usas en todas las fases (munición infinita).'),
      targets &&
        field(
          'Color de las dianas',
          h('div', { class: 'eval-color' }, select(TARGET_COLORS, cfg.targetColor, (v) => {
            cfg.targetColor = v;
            save();
            swatch.style.background = swatchBg(v);
          }), swatch),
          'Solo estética: no cambia el rango.',
        ),
      field('Color de los enemigos', select(ENEMY_COLORS, s.enemyColor, (v) => {
        s.enemyColor = v;
        game.store.persist();
      }), 'Solo estética. También se usa en los otros modos con enemigos.'),
      h('h3', {}, 'Objetivos'),
      field(targets ? 'Dianas a la vez' : 'Enemigos a la vez', sl('count', (v) => `${v}`), targets ? 'En Multi-objetivo y Precisión (estándar: 3).' : 'En Precisión (uno menos) y Combate (estándar: 3).'),
      field('Tamaño', sl('size', (v) => `×${v.toFixed(2)}`), 'Estándar ×1. Más grandes, más fáciles.'),
      field('Velocidad', sl('speed', (v) => `×${v.toFixed(2)}`), 'Cuánto se mueven y lo rápido que escapan (estándar ×1).'),
      field('Duración de cada fase', sl('duration', (v) => `${v} s`), 'Estándar 30 s.'),
      targets ? field('Intentos de reacción', sl('reactionTrials', (v) => `${v}`), 'Estándar 8.') : field('Asomadas en Peeks', sl('peeks', (v) => `${v}`), 'Estándar 10.'),
      !targets && field('Disparos enemigos', sl('enemyFire', (v) => (v === 0 ? 'No disparan' : `×${v.toFixed(2)}`)), 'Puntería y daño de los enemigos que te disparan (estándar ×1).'),
      h('h3', {}, 'Fases'),
      phaseBoxes,
      h(
        'div',
        { class: 'row' },
        button('Listo', onDone, { variant: 'primary' }),
        button('Restablecer estándar', () => {
          Object.assign(cfg, structuredClone(EVAL_DEFAULTS));
          save();
          onDone?.();
        }),
      ),
    ),
  );
  save();
  return view;
}

const swatchBg = (v) => (v === 'auto' ? 'conic-gradient(#ff3d5a, #ffb020, #00e0a0, #36d6ff, #b46cff, #ff3d5a)' : v);

export function evalPracticeScreen({ variant, config, stages, results, onRetry, onMenu }) {
  return h(
    'div',
    { class: 'screen wide' },
    h(
      'section',
      { class: 'panel results-hero practice' },
      h(
        'div',
        { class: 'hero-text' },
        h('div', { class: 'eyebrow' }, `Práctica · ${variant.title}`),
        h('h2', {}, 'Práctica terminada'),
        h('p', { class: 'muted' }, `${configLine(variant, config)}. Con la configuración personalizada no cambia tu rango.`),
      ),
    ),
    h(
      'section',
      { class: 'stage-cards' },
      stages.map((S) => {
        const r = results[S.info.id];
        if (!r) return null;
        return h('div', { class: 'panel stage-card' }, h('h3', {}, S.info.name), h('p', { class: 'small muted' }, S.summary(r)), h('dl', {}, S.details(r).map(([k, v]) => [h('dt', {}, k), h('dd', {}, v)])), h('div', { class: 'stage-points' }, `${r.score} pts`));
      }),
    ),
    h('div', { class: 'row center' }, button('Repetir práctica', onRetry, { variant: 'primary' }), button('Menú principal', onMenu)),
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
