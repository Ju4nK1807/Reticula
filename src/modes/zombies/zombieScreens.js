import { h } from '../../ui/dom.js';
import { button } from '../../ui/components.js';
import { sensSummary } from '../../config/sensitivity.js';
import { clock, pct } from '../../utils/format.js';
import { DEFENSE, DIFFICULTIES, DIFFICULTY_ORDER, PLAYER, POWERUPS, SHOP, ZOMBIE_TYPES, cannotBuy } from './zombieData.js';

const DIFF_COLORS = { facil: '#00f5a0', normal: '#36d6ff', dificil: '#ffb020', locura: '#ff4d5e' };

const fmt = (n) => Math.round(n).toLocaleString('es');

// Reglas de la pantalla de inicio; las teclas solo se nombran con teclado (en táctil hay botones).
function rules(touch) {
  const key = (k) => (touch ? '' : ` (${k})`);
  return [
    ['Resiste la horda', 'Cada oleada trae más zombis, más resistentes y más rápidos. La partida termina cuando caes. Te recuperas si pasas unos segundos sin recibir golpes.'],
    ['Gana puntos', `Cada impacto da puntos; matar da más, sobre todo a la cabeza, con el golpe cuerpo a cuerpo${key('V')} o con granadas${key('G')}.`],
    ['Compra en la armería', `Entre oleadas abre la armería${key('E')}: armas, munición, granadas, botiquín y mejoras. Empiezas con la pistola (munición infinita).`],
    ['Potenciadores', `Algunos zombis sueltan un cristal brillante: ${Object.values(POWERUPS).map((p) => p.name.toLowerCase()).join(', ')}. Pasa por encima para tomarlo.`],
    ['Conoce a la horda', Object.values(ZOMBIE_TYPES).map((t) => t.name).join(', ') + '. Los corredores llegan antes; los reptantes son bajos; el bruto aguanta mucho y pega fuerte.'],
  ];
}

const CONTROLS = [
  ['Clic', 'Disparar'],
  ['Clic derecho', 'Apuntar'],
  ['1 – 5', 'Armas compradas'],
  ['R', 'Recargar'],
  ['V', 'Golpe cuerpo a cuerpo'],
  ['G', 'Granada'],
  ['E', 'Armería (entre oleadas)'],
  ['Esc', 'Pausa'],
];

function records(record) {
  if (!record?.totalRuns) return h('p', { class: 'muted' }, 'Aún no tienes récords en este modo.');
  return h(
    'div',
    { class: 'zh-records' },
    h('div', {}, h('small', {}, 'Mejor oleada'), h('strong', {}, record.bestWave)),
    h('div', {}, h('small', {}, 'Récord de puntos'), h('strong', {}, fmt(record.bestScore))),
    h('div', {}, h('small', {}, 'Más bajas'), h('strong', {}, record.bestKills)),
    h('div', {}, h('small', {}, 'Partidas'), h('strong', {}, record.totalRuns)),
  );
}

// Reglas propias de la defensa de la barra.
function defenseRules(touch) {
  const key = (k) => (touch ? '' : ` (${k})`);
  return [
    ['Defiende la barra', 'La fuente de la plaza es una barra llena de botellas de licor. Los zombis van primero por ella: cada golpe rompe botellas. Si se rompe la última, se acaba la partida.'],
    ['Atráelos', `Un zombi deja la barra y te persigue si te acercas a menos de ${DEFENSE.aggroRange} m o si le disparas (por unos segundos). Úsalo para sacarlos de la barra.`],
    ['Cuidado con la puntería', 'Las botellas también se rompen con tus balas: dispara con cuidado cerca de la barra.'],
    ['Armería', `Entre oleadas${key('E')} puedes comprar armas, granadas y «Reponer licor» (${DEFENSE.restock} botellas).`],
  ];
}

// Tarjetas de dificultad (con la mejor oleada en cada una).
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
        h('span', { class: 'zh-best' }, best?.totalRuns ? `Récord: oleada ${best.bestWave}` : 'Sin jugar'),
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
          : 'De noche, en una plaza rodeada de edificios. Los zombis entran por los callejones: vigila los flancos, usa las coberturas y gasta bien tus puntos.',
      ),
      records(record),
      h('h3', {}, 'Dificultad'),
      onDifficulty && difficultyPicker(record, difficulty, onDifficulty),
      h('ol', { class: 'stage-list' }, (defense ? defenseRules(game.touchMode) : rules(game.touchMode)).map(([t, x], i) => h('li', {}, h('span', { class: 'num' }, i + 1), h('div', {}, h('strong', {}, t), h('p', {}, x))))),
      !game.touchMode && h('dl', { class: 'controls compact' }, CONTROLS.map(([k, v]) => [h('dt', {}, h('kbd', {}, k)), h('dd', {}, v)])),
      h('p', { class: 'sens-line' }, `Sensibilidad: ${sensSummary(game.settings.sens)}`),
      h('div', { class: 'row' }, button('Comenzar', onStart, { variant: 'primary' }), button('Configuración', onSettings), button('Volver', onBack, { variant: 'ghost' })),
      // Los modelos son CC-BY: el crédito va a la vista, donde se usan.
      h('p', { class: 'zh-credit' }, 'Modelos de zombis: bachosoftdesign y Quaternius (Poly Pizza, CC-BY 3.0).'),
    ),
  );
}

/**
 * Armería: compra entre oleadas. state = { cash, owned, upgrades, grenades, health, maxHealth,
 * reserveFull, timer }. onBuy(item) compra (y vuelve a dibujar); onClose vuelve al combate.
 */
export function zombieShopScreen({ state, onBuy, onClose }) {
  const kinds = [
    ['Armas', SHOP.filter((i) => i.kind === 'weapon')],
    ['Suministros', SHOP.filter((i) => ['ammo', 'grenades', 'heal'].includes(i.kind) || (i.kind === 'restock' && state.defense))],
    ['Mejoras', SHOP.filter((i) => i.kind === 'upgrade')],
  ];
  // Cabecera fija al desplazarse: los puntos y "Continuar combate" siempre a la vista (en teléfonos la
  // lista no cabe en la pantalla).
  return h(
    'div',
    { class: 'screen zh-shop' },
    h(
      'header',
      { class: 'screen-head zh-shop-head' },
      h(
        'div',
        {},
        h('div', { class: 'eyebrow' }, 'Entre oleadas'),
        h('h2', {}, 'Armería'),
        h('p', { class: 'muted small' }, `Vida ${Math.round(state.health)} / ${state.maxHealth} · Granadas ${state.grenades} / ${PLAYER.maxGrenades}`),
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
      h('h2', {}, `Oleada ${result.wave}`),
      h('p', { class: 'muted' }, isBest ? `¡Tu mejor resistencia en ${diff}!` : `Tu récord en ${diff}: oleada ${record.byDifficulty?.[result.difficulty]?.bestWave ?? record.bestWave} · ${fmt(record.byDifficulty?.[result.difficulty]?.bestScore ?? record.bestScore)} pts`),
    ),
    h(
      'div',
      { class: 'metrics' },
      tile('Puntos', fmt(result.score)),
      tile('Bajas', result.kills, `${result.headKills} a la cabeza`),
      tile('Precisión', pct(result.accuracy)),
      tile('Cuerpo a cuerpo', result.meleeKills, 'bajas con V'),
      tile('Granadas', result.grenadeKills, 'bajas con G'),
      tile('Tiempo', clock(result.time), `${Math.round(result.damageTaken)} de daño recibido`),
      defense && tile('Botellas', `${result.bottles} / ${result.bottlesTotal}`, 'quedaron en la barra'),
    ),
    h('div', { class: 'row center' }, button('Jugar otra vez', onRetry, { variant: 'primary' }), button('Menú', onMenu, { variant: 'ghost' })),
  );
}
