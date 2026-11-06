// Arsenal: lista de armas a la izquierda (mismo menú que la pantalla de título) y la ficha del arma
// enfocada a la derecha. Moverse por la lista la previsualiza; Enter o clic la equipa.
// La evaluación usa siempre el rifle (rangos comparables); el arma elegida vale para el resto.
import './menu.css';
import './arsenal.css';
import { h } from './dom.js';
import { button } from './components.js';
import { crosshairSVG } from './Crosshair.js';
import { menuList } from './menuList.js';
import { weaponIcon } from './weaponIcons.js';
import { EVALUATION_WEAPON, WEAPONS, WEAPON_ORDER, shotDamage, weaponRatings } from '../combat/weapons.js';

const STATS = [
  ['damage', 'Daño'],
  ['rate', 'Cadencia'],
  ['precision', 'Precisión'],
  ['mobility', 'Movilidad'],
  ['magazine', 'Cargador'],
];

function bar(label, value) {
  const pct = Math.round(value * 100);
  return h(
    'div',
    { class: 'ar-stat', role: 'meter', 'aria-label': label, 'aria-valuenow': pct, 'aria-valuemin': 0, 'aria-valuemax': 100 },
    h('span', {}, label),
    h('div', { class: 'ar-track' }, h('i', { style: { transform: `scaleX(${Math.max(0.04, value).toFixed(3)})` } })),
    h('b', {}, pct),
  );
}

const fireModes = (w) => w.fireModes.map((m) => (m === 'auto' ? 'Automático' : 'Semiautomático')).join(' / ');

export function arsenalScreen(game, { onBack, onCrosshair }) {
  const root = h('div', { class: 'screen wide arsenal' });
  const touch = !!game.touchMode;
  let focusId = null;

  const equip = (id) => {
    game.settings.weapon = id;
    game.store.persist();
    game.weapon.setWeapon(id);
    render(id);
  };

  // Ficha del arma (se rehace al enfocar otra: cambio instantáneo, sin animación).
  function showcase(id) {
    const s = game.settings;
    const w = WEAPONS[id];
    const r = weaponRatings(w);
    const equipped = id === s.weapon;
    const xh = s.crosshairPerWeapon ? s.weaponCrosshairs[id] : s.crosshair;
    return [
      h('div', { class: 'ar-show-head' }, h('div', { class: 'eyebrow' }, `${w.key} · ${w.category}`), equipped && h('span', { class: 'tag neutral' }, 'Equipada')),
      h('h2', { class: 'ar-name' }, w.name),
      h('div', { class: `ar-hero${equipped ? ' equipped' : ''}`, html: weaponIcon(id) }),
      h('p', { class: 'ar-desc' }, w.desc),
      h(
        'div',
        { class: 'ar-body' },
        h('div', { class: 'ar-stats' }, STATS.map(([k, label]) => bar(label, r[k]))),
        h(
          'dl',
          { class: 'td-rows ar-facts' },
          h('dt', {}, 'Daño cabeza / cuerpo'),
          h('dd', {}, `${shotDamage(w, 'head')} / ${shotDamage(w, 'body')}`),
          w.pellets > 1 && [h('dt', {}, 'Perdigones'), h('dd', {}, w.pellets)],
          h('dt', {}, 'Cadencia'),
          h('dd', {}, `${w.rps} disp/s`),
          h('dt', {}, 'Cargador'),
          h('dd', {}, `${w.magazine} balas`),
          h('dt', {}, 'Recarga'),
          h('dd', {}, `${w.reloadTime} s`),
          h('dt', {}, 'Disparo'),
          h('dd', {}, fireModes(w)),
          w.zoom && [h('dt', {}, 'Mira telescópica'), h('dd', {}, `×${w.zoom}`)],
        ),
      ),
      h(
        'div',
        { class: 'ar-foot' },
        h('div', { class: 'ar-xh', title: 'Mira de esta arma', html: crosshairSVG(xh) }),
        button('Cambiar mira', () => onCrosshair(id), { variant: 'ghost' }),
        equipped ? button('Equipada', null, { variant: 'primary', disabled: true }) : button('Equipar', () => equip(id), { variant: 'primary' }),
      ),
    ];
  }

  function render(focus) {
    const s = game.settings;
    const selected = WEAPONS[s.weapon] ? s.weapon : EVALUATION_WEAPON;
    focusId = focus ?? focusId ?? selected;
    const show = h('section', { class: 'panel ar-show' });
    const items = WEAPON_ORDER.map((id) => ({
      id,
      label: WEAPONS[id].name,
      badge: id === selected ? 'Equipada' : touch ? null : WEAPONS[id].key,
      onSelect: () => equip(id),
    }));
    for (const node of root.querySelectorAll('[data-disposable]')) node._dispose?.();
    const list = menuList(items, {
      sfx: game.sfx,
      initial: focusId,
      onBack,
      onFocus: (it) => {
        focusId = it.id;
        show.replaceChildren(...showcase(it.id));
      },
    });
    show.replaceChildren(...showcase(focusId));
    root.replaceChildren(
      h(
        'header',
        { class: 'screen-head' },
        h(
          'div',
          {},
          h('div', { class: 'eyebrow' }, 'Arsenal'),
          h('h2', {}, 'Elige tu arma'),
          h('p', { class: 'muted' }, `${touch ? 'En partida cambia con el botón de arma.' : 'En partida cambia con las teclas 1 a 5.'} La evaluación usa siempre el ${WEAPONS[EVALUATION_WEAPON].name} para que los rangos sean comparables.`),
        ),
        button('← Volver', onBack, { variant: 'ghost' }),
      ),
      h('div', { class: 'ar-layout' }, h('nav', { class: 'ar-list', 'aria-label': 'Armas' }, list), show),
    );
  }

  render();
  return root;
}
