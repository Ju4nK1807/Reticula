import './arsenal.css';
import { h } from './dom.js';
import { button } from './components.js';
import { crosshairSVG } from './Crosshair.js';
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
    h('div', { class: 'ar-track' }, h('i', { style: { width: `${Math.max(4, pct)}%` } })),
  );
}

// Arsenal: elegir el arma para campaña, infinito y coordinación (la evaluación usa siempre el rifle).
export function arsenalScreen(game, { onBack, onCrosshair }) {
  const root = h('div', { class: 'screen wide' });
  const render = () => {
    const s = game.settings;
    const selected = WEAPONS[s.weapon] ? s.weapon : EVALUATION_WEAPON;
    root.replaceChildren(
      h(
        'header',
        { class: 'screen-head' },
        h(
          'div',
          {},
          h('div', { class: 'eyebrow' }, 'Arsenal'),
          h('h2', {}, 'Elige tu arma'),
          h('p', { class: 'muted' }, `En partida cambia con las teclas 1 a 5. La evaluación usa siempre el ${WEAPONS[EVALUATION_WEAPON].name} para que los rangos sean comparables.`),
        ),
        button('← Volver', onBack, { variant: 'ghost' }),
      ),
      h(
        'section',
        { class: 'ar-grid' },
        WEAPON_ORDER.map((id) => {
          const w = WEAPONS[id];
          const r = weaponRatings(w);
          const active = id === selected;
          const xh = s.crosshairPerWeapon ? s.weaponCrosshairs[id] : s.crosshair;
          return h(
            'article',
            { class: `panel ar-card${active ? ' active' : ''}` },
            h('div', { class: 'ar-head' }, h('kbd', {}, w.key), h('span', { class: 'ar-cat' }, w.category), active && h('span', { class: 'tag neutral' }, 'equipada')),
            h('div', { class: 'ar-icon', html: weaponIcon(id) }),
            h('h3', {}, w.name),
            h('p', { class: 'muted small' }, w.desc),
            h('div', { class: 'ar-stats' }, STATS.map(([k, label]) => bar(label, r[k]))),
            h(
              'dl',
              { class: 'ar-facts' },
              h('dt', {}, 'Cabeza / cuerpo'),
              h('dd', {}, `${shotDamage(w, 'head')} / ${shotDamage(w, 'body')}${w.pellets > 1 ? ` (${w.pellets} perdigones)` : ''}`),
              h('dt', {}, 'Cadencia'),
              h('dd', {}, `${w.rps} disp/s`),
              h('dt', {}, 'Cargador'),
              h('dd', {}, `${w.magazine} · recarga ${w.reloadTime} s`),
              h('dt', {}, 'Modo'),
              h('dd', {}, w.fireModes.map((m) => (m === 'auto' ? 'automático' : 'semiautomático')).join(' / ') + (w.zoom ? ` · mira ×${w.zoom}` : '')),
            ),
            h(
              'div',
              { class: 'ar-foot' },
              h('div', { class: 'ar-xh', title: 'Mira de esta arma', html: crosshairSVG(xh) }),
              active
                ? button('Mira…', () => onCrosshair(id), { variant: 'ghost' })
                : button('Equipar', () => {
                    s.weapon = id;
                    game.store.persist();
                    game.weapon.setWeapon(id);
                    render();
                  }, { variant: 'primary' }),
            ),
          );
        }),
      ),
    );
  };
  render();
  return root;
}
