import { h } from '../../ui/dom.js';
import { button } from '../../ui/components.js';
import { sensSummary } from '../../config/sensitivity.js';
import { clock, pct } from '../../utils/format.js';
import { keyLabel } from '../../config/keybinds.js';
import { BARRICADE, BOX_PRICE, DEFENSE, DIFFICULTIES, DIFFICULTY_ORDER, DOORS, FORGE, GRENADE_MAX, PERKS, PLAYER, POWERUPS, SHOP, ZOMBIE_TYPES, cannotBuy } from './zombieData.js';

const DIFF_COLORS = { facil: '#00f5a0', normal: '#36d6ff', dificil: '#ffb020', locura: '#ff4d5e' };

const fmt = (n) => Math.round(n).toLocaleString('es');

// Reglas de la pantalla de inicio; las teclas solo se nombran con teclado (en táctil hay botones).
function rules(game) {
  const touch = game.touchMode;
  const key = (id) => (touch ? '' : ` (${keyLabel(game.settings.keys, id)})`);
  // Una vez por sección (el Hospital tiene dos puertas con el mismo precio).
  const doors = [...new Map(Object.values(DOORS).map((d) => [d.name, d])).values()].map((d) => `${d.name} (${fmt(d.price)})`).join(', ');
  return [
    ['Resiste la horda', 'Cada oleada trae más zombis, más resistentes y más rápidos. La partida termina cuando caes. Te recuperas si pasas unos segundos sin recibir golpes.'],
    ['Gana puntos', `Cada impacto da puntos; matar da más, sobre todo a la cabeza, con el cuchillo${key('melee')} o con granadas${key('grenade')}.`],
    ['Barricadas', `Empiezas encerrado en el Vestíbulo. La horda sale de la tierra y arranca los tablones de las ventanas; mantén${key('interact')} junto a una ventana para repararla (+${BARRICADE.repairPoints} por tablón).`],
    ['Abre el mapa', `Las puertas tapiadas se compran${key('interact')}: ${doors}. Cada sección tiene más armas y bebidas, pero también más entradas de zombis. Al Hospital se llega por la Subestación o por el Mercado.`],
    ['Enciende la luz', `El barrio está sin electricidad: las farolas están apagadas y las bebidas y la Forja no funcionan (salvo Segundo Aire). Busca el generador en la Subestación y baja la palanca${key('interact')}.`],
    ['Caja misteriosa', `Empieza en la plaza (el haz de luz azul): ${BOX_PRICE} puntos por un arma al azar de las que no tienes. Cada tantas tiradas se muda a otro lugar del mapa: sigue el haz.`],
    ['La Forja', `En el quirófano del Hospital, con electricidad: ${fmt(FORGE.price)} puntos forjan el arma que llevas en la mano (doble daño, cargador y reserva más grandes).`],
    ['Armas en la pared', `Empiezas con la pistola (munición infinita). Las demás están colgadas en las paredes: acércate y cómpralas${key('interact')}; con el arma ya comprada, el mismo puesto vende su munición.`],
    ['Bebidas', `${Object.keys(PERKS).length} máquinas repartidas por el mapa: ${Object.values(PERKS).map((p) => p.name).join(', ')}. Duran hasta que caes (Último Aliento te levanta una vez).`],
    ['Granadas y armería', `Entre oleadas abre la armería${key('interact')}: munición, botiquín y cuatro tipos de granada (fragmentación, incendiaria, aturdidora y señuelo). Cambia de tipo${key('grenadeNext')}.`],
    ['Potenciadores', `Algunos zombis sueltan un cristal brillante: ${Object.values(POWERUPS).map((p) => p.name.toLowerCase()).join(', ')}. Pasa por encima para tomarlo.`],
    ['Conoce a la horda', Object.values(ZOMBIE_TYPES).map((t) => t.name).join(', ') + '. Los corredores llegan antes; los reptantes son bajos; el bruto aguanta mucho y pega fuerte. Una explosión cerca puede arrancarles las piernas: siguen arrastrándose.'],
  ];
}

function controls(keys) {
  const k = (id) => keyLabel(keys, id);
  return [
    ['Clic', 'Disparar (mantenlo con las automáticas)'],
    ['Clic derecho', 'Apuntar'],
    ['Rueda · 1 – 9', 'Armas compradas'],
    [k('reload'), 'Recargar'],
    [k('melee'), 'Cuchillo'],
    [`${k('grenade')} · ${k('grenadeNext')}`, 'Granada · cambiar de tipo'],
    [k('interact'), 'Comprar lo que tienes delante · armería (entre oleadas)'],
    ['Esc', 'Pausa'],
  ];
}

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
          : 'De noche, sin luz y encerrado en el Vestíbulo de un barrio en ruinas. La horda arranca los tablones de las ventanas; detrás de las puertas tapiadas esperan la Plaza, el Mercado, la Estación, la Iglesia, la Subestación con el generador y el Hospital con la Forja. Gasta bien tus puntos.',
      ),
      records(record),
      h('h3', {}, 'Dificultad'),
      onDifficulty && difficultyPicker(record, difficulty, onDifficulty),
      h('ol', { class: 'stage-list' }, (defense ? defenseRules(game.touchMode) : rules(game)).map(([t, x], i) => h('li', {}, h('span', { class: 'num' }, i + 1), h('div', {}, h('strong', {}, t), h('p', {}, x))))),
      !game.touchMode && h('dl', { class: 'controls compact' }, controls(game.settings.keys).map(([k, v]) => [h('dt', {}, h('kbd', {}, k)), h('dd', {}, v)])),
      h('p', { class: 'sens-line' }, `Sensibilidad: ${sensSummary(game.settings.sens)}`),
      h('div', { class: 'row' }, button('Comenzar', onStart, { variant: 'primary' }), button('Configuración', onSettings), button('Volver', onBack, { variant: 'ghost' })),
      // Parte de las animaciones son CC-BY: el crédito va a la vista, donde se usan.
      h('p', { class: 'zh-credit' }, 'Zombi: medicinestorm (OpenGameArt, CC0). Animaciones extra: bachosoftdesign (Poly Pizza, CC-BY 3.0).'),
    ),
  );
}

/**
 * Armería: compra entre oleadas. state = { cash, owned, perks, bag, health, maxHealth, reserveFull }.
 * onBuy(item) compra (y vuelve a dibujar); onClose vuelve al combate. Las armas están en las paredes
 * del mapa y las mejoras en las máquinas de bebidas.
 */
export function zombieShopScreen({ state, onBuy, onClose }) {
  const kinds = [
    ['Suministros', SHOP.filter((i) => ['ammo', 'heal'].includes(i.kind) || (i.kind === 'restock' && state.defense))],
    ['Granadas', SHOP.filter((i) => i.kind === 'grenade')],
  ];
  const bag = state.bag ?? {};
  const nades = Object.entries(GRENADE_MAX).map(([t, max]) => `${bag[t] ?? 0}/${max}`).join(' · ');
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
      h('h2', {}, `Oleada ${result.wave}`),
      h('p', { class: 'muted' }, isBest ? `¡Tu mejor resistencia en ${diff}!` : `Tu récord en ${diff}: oleada ${record.byDifficulty?.[result.difficulty]?.bestWave ?? record.bestWave} · ${fmt(record.byDifficulty?.[result.difficulty]?.bestScore ?? record.bestScore)} pts`),
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
