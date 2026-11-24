import { h } from '../../ui/dom.js';
import { button } from '../../ui/components.js';
import { sensSummary } from '../../config/sensitivity.js';
import { clock } from '../../utils/format.js';
import { keyLabel } from '../../config/keybinds.js';
import { DIFFICULTIES, DIFFICULTY_ORDER, GRENADE_MAX, SHOP, cannotBuy } from './zombieData.js';

const DIFF_COLORS = { facil: '#00f5a0', normal: '#36d6ff', dificil: '#ffb020', locura: '#ff4d5e' };

const fmt = (n) => Math.round(n).toLocaleString('es');

function controls(keys) {
  const k = (id) => keyLabel(keys, id);
  return [
    [`${k('forward')} ${k('left')} ${k('back')} ${k('right')}`, 'Moverse'],
    [k('sprint'), 'Correr'],
    [k('jump'), 'Saltar'],
    [k('crouch'), 'Agacharse'],
    ['Clic', 'Disparar (mantenlo con las automáticas)'],
    ['Clic derecho', 'Apuntar'],
    ['Rueda · 1 – 3', 'Cambiar de arma'],
    [k('reload'), 'Recargar'],
    [k('melee'), 'Cuchillo'],
    [`${k('grenade')} · ${k('grenadeNext')}`, 'Granada · cambiar de tipo'],
    [k('interact'), 'Usar · comprar · reparar ventanas · armería (entre rondas)'],
    [k('flashlight'), 'Linterna'],
    ['Esc', 'Pausa'],
  ];
}

const TOUCH_CONTROLS = [
  ['Izquierda', 'Joystick: moverse'],
  ['Derecha', 'Arrastrar: mirar'],
  ['Botones', 'Disparar · apuntar · recargar · saltar · agacharse · cuchillo · granada · cambiar de arma'],
  ['Armería', 'Comprar entre rondas'],
  ['Luz', 'Linterna'],
  ['Engranaje', 'Pausa'],
];

function records(record) {
  if (!record?.totalRuns) return h('p', { class: 'muted' }, 'Aún no tienes récords en este modo.');
  return h(
    'div',
    { class: 'zh-records' },
    h('div', {}, h('small', {}, 'Mejor ronda'), h('strong', {}, record.bestWave)),
    h('div', {}, h('small', {}, 'Récord de puntos'), h('strong', {}, fmt(record.bestScore))),
    h('div', {}, h('small', {}, 'Más bajas'), h('strong', {}, record.bestKills)),
    h('div', {}, h('small', {}, 'Partidas'), h('strong', {}, record.totalRuns)),
  );
}

function difficultyPicker(record, current, onPick) {
  return h(
    'div',
    { class: 'zh-diffs', role: 'radiogroup', 'aria-label': 'Dificultad' },
    DIFFICULTY_ORDER.map((id) => {
      const d = DIFFICULTIES[id];
      const best = record?.byDifficulty?.[id];
      return h(
        'button',
        { class: `zh-diff${id === current ? ' active' : ''}`, type: 'button', role: 'radio', 'aria-checked': id === current ? 'true' : 'false', style: { '--c': DIFF_COLORS[id] }, onclick: () => onPick(id) },
        h('strong', {}, d.name),
        h('small', {}, d.desc),
        h('span', { class: 'zh-best' }, best?.totalRuns ? `Récord: ronda ${best.bestWave}` : 'Sin jugar'),
      );
    }),
  );
}

export function zombieIntroScreen(game, { record, variant = 'survival', difficulty = 'normal', onDifficulty, onStart, onSettings, onBack }) {
  const defense = variant === 'defense';
  return h(
    'div',
    { class: 'screen narrow' },
    h(
      'div',
      { class: 'panel zh-intro' },
      h('div', { class: 'eyebrow' }, defense ? 'Defensa de la barra · Barrio en ruinas' : 'Modo zombi · Barrio en ruinas'),
      h('h2', {}, defense ? 'Que no rompan ni una botella' : 'Sobrevive a la horda'),
      h(
        'p',
        { class: 'muted' },
        defense
          ? 'La fuente de la plaza es ahora una barra con 46 botellas de licor y la horda tiene sed: entra por los callejones directo a la barra. Atájalos antes de que lleguen.'
          : 'De noche, sin luz y encerrado en el Vestíbulo de un barrio en ruinas. La horda arranca los tablones de las ventanas; detrás de las puertas tapiadas esperan la Plaza, el Mercado, la Estación, la Iglesia, la Subestación con el generador y el Hospital con la Forja. Gasta bien tus puntos.',
      ),
      records(record),
      h('h3', {}, 'Dificultad'),
      onDifficulty && difficultyPicker(record, difficulty, onDifficulty),
      h('h3', {}, 'Controles'),
      h('dl', { class: 'controls compact' }, (game.touchMode ? TOUCH_CONTROLS : controls(game.settings.keys)).map(([k, v]) => [h('dt', {}, h('kbd', {}, k)), h('dd', {}, v)])),
      h('p', { class: 'sens-line' }, `Sensibilidad: ${sensSummary(game.settings.sens)}`),
      h('div', { class: 'row' }, button('Comenzar', onStart, { variant: 'primary' }), button('Configuración', onSettings), button('Volver', onBack, { variant: 'ghost' })),
      h('p', { class: 'zh-credit' }, 'Zombi: medicinestorm (OpenGameArt, CC0). Animaciones extra: bachosoftdesign (Poly Pizza, CC-BY 3.0).'),
    ),
  );
}

export function zombieShopScreen({ state, onBuy, onClose }) {
  const kinds = [
    ['Suministros', SHOP.filter((i) => ['ammo', 'heal'].includes(i.kind) || (i.kind === 'restock' && state.defense))],
    ['Granadas', SHOP.filter((i) => i.kind === 'grenade')],
  ];
  const bag = state.bag ?? {};
  const nades = Object.entries(GRENADE_MAX).map(([t, max]) => `${bag[t] ?? 0}/${max}`).join(' · ');
  return h(
    'div',
    { class: 'screen zh-shop' },
    h(
      'header',
      { class: 'screen-head zh-shop-head' },
      h(
        'div',
        {},
        h('div', { class: 'eyebrow' }, 'Entre rondas'),
        h('h2', {}, 'Armería'),
        h('p', { class: 'muted small' }, `Vida ${Math.round(state.health)} / ${state.maxHealth} · Granadas (frag. · incend. · aturd. · señuelo) ${nades}`),
        h('p', { class: 'muted small' }, 'Las armas están colgadas en las paredes del mapa y las mejoras en las máquinas de bebidas.'),
      ),
      h(
        'div',
        { class: 'zh-shop-bar' },
        h('div', { class: 'zh-shop-cash' }, h('small', {}, 'Puntos'), h('strong', {}, fmt(state.cash))),
        button('Continuar combate', onClose, { variant: 'primary' }),
      ),
    ),
    kinds.map(([title, items]) =>
      h(
        'section',
        { class: 'zh-shop-group' },
        h('h3', {}, title),
        h(
          'div',
          { class: 'zh-shop-grid' },
          items.map((item) => {
            const why = cannotBuy(item, { ...state, points: state.cash });
            const owned = why === 'Ya la tienes';
            return h(
              'article',
              { class: `panel zh-item${owned ? ' owned' : ''}` },
              h('div', { class: 'zh-item-head' }, h('strong', {}, item.name), h('span', { class: 'zh-price' }, owned ? 'Tuya' : `${fmt(item.price)} pts`)),
              h('p', { class: 'muted small' }, item.desc),
              owned ? null : button(why ?? 'Comprar', () => onBuy(item), { variant: why ? '' : 'primary', disabled: !!why }),
            );
          }),
        ),
      ),
    ),
  );
}

function tile(label, value, sub = null) {
  return h('div', { class: 'metric' }, h('span', { class: 'm-value' }, value), h('span', { class: 'm-label' }, label), sub && h('span', { class: 'm-sub' }, sub));
}

export function zombieResultsScreen({ result, record, isBest, variant = 'survival', onRetry, onMenu }) {
  const defense = variant === 'defense';
  const diff = DIFFICULTIES[result.difficulty]?.name ?? 'Normal';
  const lost = defense && result.lostBy === 'bar' ? 'Rompieron la última botella' : 'La horda te alcanzó';
  return h(
    'div',
    { class: 'screen wide' },
    h(
      'section',
      { class: 'panel zh-result-hero' },
      h('div', { class: 'eyebrow' }, `${isBest ? 'Nuevo récord' : lost} · ${diff}`),
      h('h2', {}, `Ronda ${result.wave}`),
      h('p', { class: 'muted' }, isBest ? `¡Tu mejor resistencia en ${diff}!` : `Tu récord en ${diff}: ronda ${record.byDifficulty?.[result.difficulty]?.bestWave ?? record.bestWave} · ${fmt(record.byDifficulty?.[result.difficulty]?.bestScore ?? record.bestScore)} pts`),
    ),
    h(
      'div',
      { class: 'metrics' },
      tile('Puntos', fmt(result.score)),
      tile('Bajas', result.kills, `${result.headKills} a la cabeza`),
      tile('Cuchillo', result.meleeKills, 'bajas cuerpo a cuerpo'),
      tile('Granadas', result.grenadeKills, 'bajas con granadas'),
      tile('Tiempo', clock(result.time), `${Math.round(result.damageTaken)} de daño recibido`),
      defense && tile('Botellas', `${result.bottles} / ${result.bottlesTotal}`, 'quedaron en la barra'),
    ),
    h('div', { class: 'row center' }, button('Jugar otra vez', onRetry, { variant: 'primary' }), button('Menú', onMenu, { variant: 'ghost' })),
  );
}
