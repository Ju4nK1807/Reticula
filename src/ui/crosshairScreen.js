// Editor de retícula: la mira se arma pieza por pieza con vista previa en vivo sobre distintos fondos,
// presets, retículas guardadas por el jugador y códigos para compartir. Todo se guarda al momento.
import './crosshair.css';
import { h } from './dom.js';
import { button } from './components.js';
import { checkbox, field, slider } from './controls.js';
import {
  CROSSHAIR_COLORS,
  CROSSHAIR_DEFAULTS,
  CROSSHAIR_PRESETS,
  crosshairCode,
  crosshairSVG,
  normalizeCrosshair,
  parseCrosshairCode,
} from './Crosshair.js';
import { WEAPONS, WEAPON_ORDER } from '../combat/weapons.js';

export const MAX_SAVED = 24;
const BACKGROUNDS = { taller: 'Taller', cielo: 'Cielo', arena: 'Arena', noche: 'Noche' };
const ZOOMS = [1, 2, 4];
const TABS = { general: 'General', lineas: 'Líneas', centro: 'Centro', avanzado: 'Avanzado' };

// Lo que se recuerda mientras dura la sesión (al volver al editor se abre igual).
const memory = { tab: 'general', bg: 'taller', zoom: 2, weapon: null, firing: false };

const pctFmt = (v) => `${Math.round(v * 100)}%`;
const pxFmt = (v) => `${v} px`;

/** Mira que se está editando: la del arma elegida o la global (según "una por arma"). */
export function editedCrosshair(settings, weaponId) {
  return settings.crosshairPerWeapon ? settings.weaponCrosshairs[weaponId] : settings.crosshair;
}

/** Guarda la mira actual en "Mis retículas" (la más reciente primero). Devuelve el nombre usado. */
export function saveCrosshair(settings, config, name) {
  const list = settings.savedCrosshairs ?? (settings.savedCrosshairs = []);
  const clean = String(name ?? '').trim().slice(0, 28) || `Mi retícula ${list.length + 1}`;
  list.unshift({ name: clean, config: normalizeCrosshair(config) });
  list.length = Math.min(list.length, MAX_SAVED);
  return clean;
}

export function crosshairScreen(game, { onBack, weapon = null } = {}) {
  const s = game.settings;
  if (weapon && WEAPONS[weapon]) memory.weapon = weapon;
  const weaponId = WEAPONS[memory.weapon] ? memory.weapon : s.weapon;
  memory.weapon = weaponId;
  // Siempre una mira completa y válida (guardados viejos o editados a mano).
  const xh = editedCrosshair(s, weaponId);
  Object.assign(xh, normalizeCrosshair(xh));

  const rerender = () => game.ui.show(crosshairScreen(game, { onBack }));
  const persist = () => {
    game.store.persist();
    game.applySettings();
  };

  // --- Vista previa -----------------------------------------------------------------------------
  const target = h('div', { class: 'xs-target' });
  const stage = h('div', { class: `xs-stage bg-${memory.bg}` }, h('div', { class: 'xs-horizon', 'aria-hidden': 'true' }), target);
  const codeInput = h('input', { type: 'text', class: 'xh-code', spellcheck: false, 'aria-label': 'Código de la retícula' });
  const weaponChips = h('div', { class: 'chips xs-weapons' });

  const refreshPreview = () => {
    target.innerHTML = crosshairSVG(xh);
    target.style.transform = `translate(-50%, -50%) scale(${memory.zoom})`;
    codeInput.value = crosshairCode(xh);
    for (const chip of weaponChips.querySelectorAll('[data-weapon]')) {
      const tile = chip.querySelector('.xs-chip-xh');
      if (tile) tile.innerHTML = crosshairSVG(editedCrosshair(s, chip.dataset.weapon));
    }
  };
  // Cambio de un control: normaliza (rangos y piezas), guarda y redibuja.
  const change = () => {
    Object.assign(xh, normalizeCrosshair(xh));
    persist();
    refreshPreview();
    syncGroups();
  };
  const apply = (config, toast) => {
    Object.assign(xh, normalizeCrosshair(config));
    persist();
    if (toast) game.ui.toast(toast);
    rerender();
  };

  // Simular disparo: la mira dinámica se abre y se cierra como en una ráfaga.
  let raf = 0;
  const animateSpread = (t) => {
    if (!stage.isConnected) {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      return;
    }
    const cycle = (t / 1000) % 1.6;
    const spread = memory.firing ? (cycle < 0.9 ? Math.min(1, cycle / 0.35) : Math.max(0, 1 - (cycle - 0.9) / 0.7)) * 14 : 0;
    target.style.setProperty('--xh-spread', `${spread.toFixed(2)}px`);
    raf = memory.firing ? requestAnimationFrame(animateSpread) : 0;
  };
  const fireToggle = h(
    'button',
    {
      class: `chip${memory.firing ? ' active' : ''}`,
      type: 'button',
      title: 'Muestra cómo se abre la mira dinámica al disparar en ráfaga',
      onclick: (e) => {
        memory.firing = !memory.firing;
        e.currentTarget.classList.toggle('active', memory.firing);
        if (memory.firing && !raf) raf = requestAnimationFrame(animateSpread);
        if (!memory.firing) target.style.setProperty('--xh-spread', '0px');
      },
    },
    'Simular disparo',
  );
  if (memory.firing) raf = requestAnimationFrame(animateSpread);

  const bgChips = h(
    'div',
    { class: 'chips' },
    Object.entries(BACKGROUNDS).map(([id, label]) =>
      h(
        'button',
        {
          class: `chip${memory.bg === id ? ' active' : ''}`,
          type: 'button',
          onclick: (e) => {
            memory.bg = id;
            stage.className = `xs-stage bg-${id}`;
            for (const b of e.currentTarget.parentElement.children) b.classList.toggle('active', b === e.currentTarget);
          },
        },
        label,
      ),
    ),
  );
  const zoomChips = h(
    'div',
    { class: 'chips' },
    ZOOMS.map((z) =>
      h(
        'button',
        {
          class: `chip${memory.zoom === z ? ' active' : ''}`,
          type: 'button',
          'aria-label': `Zoom ${z}x`,
          onclick: (e) => {
            memory.zoom = z;
            refreshPreview();
            for (const b of e.currentTarget.parentElement.children) b.classList.toggle('active', b === e.currentTarget);
          },
        },
        `×${z}`,
      ),
    ),
  );

  // Arma que se edita (con "una por arma") o aviso de que la mira es la misma para todas.
  if (s.crosshairPerWeapon) {
    weaponChips.append(
      ...WEAPON_ORDER.map((id) =>
        h(
          'button',
          {
            class: `chip xs-chip${id === weaponId ? ' active' : ''}`,
            type: 'button',
            'data-weapon': id,
            onclick: () => {
              memory.weapon = id;
              rerender();
            },
          },
          h('span', { class: 'xs-chip-xh', 'aria-hidden': 'true' }),
          WEAPONS[id].name,
        ),
      ),
    );
  }

  // --- Código para compartir ------------------------------------------------------------------
  const copyBtn = button('Copiar', async () => {
    try {
      await navigator.clipboard.writeText(codeInput.value);
      game.ui.toast('Código de la retícula copiado.');
    } catch {
      codeInput.select();
      game.ui.toast('Selecciona el código y cópialo con Ctrl+C.');
    }
  });
  const applyCodeBtn = button('Aplicar', () => {
    const config = parseCrosshairCode(codeInput.value);
    if (!config) {
      game.ui.toast('Ese código no es válido. Debe empezar por RTC2; (o RTC1;).');
      return;
    }
    apply(config, 'Retícula aplicada.');
  });

  // --- Controles por pestaña ------------------------------------------------------------------
  // Grupos que dependen de un interruptor (se atenúan si la pieza está apagada).
  const groups = [];
  const group = (key, ...children) => {
    const el = h('div', { class: 'xs-group' }, ...children);
    groups.push([key, el]);
    return el;
  };
  function syncGroups() {
    for (const [key, el] of groups) el.classList.toggle('off', !xh[key]);
  }
  const sl = (key, opts) => slider(xh, key, opts, change);
  const toggle = (label, key, hint) => field(label, h('span', { class: 'switch' }, checkbox(xh, key, change)), hint);

  const swatches = h(
    'div',
    { class: 'xs-swatches', role: 'radiogroup', 'aria-label': 'Color' },
    CROSSHAIR_COLORS.map((c) =>
      h('button', {
        class: `xs-swatch${xh.color === c ? ' active' : ''}`,
        type: 'button',
        style: { '--c': c },
        'aria-label': `Color ${c}`,
        onclick: (e) => {
          xh.color = c;
          colorInput.value = c;
          for (const b of e.currentTarget.parentElement.children) b.classList.toggle('active', b === e.currentTarget);
          change();
        },
      }),
    ),
  );
  const colorInput = h('input', {
    type: 'color',
    value: xh.color,
    'aria-label': 'Color personalizado',
    oninput: (e) => {
      xh.color = e.target.value;
      for (const b of swatches.children) b.classList.remove('active');
      change();
    },
  });

  const panels = {
    general: () => [
      field('Color', h('div', { class: 'xs-color-row' }, swatches, colorInput)),
      field('Opacidad general', sl('opacity', { min: 0.2, max: 1, step: 0.05, fmt: pctFmt })),
      toggle('Contorno', 'outline', 'Un borde oscuro alrededor de cada pieza: se ve sobre fondos claros.'),
      group(
        'outline',
        field('Grosor del contorno', sl('outlineThickness', { min: 1, max: 3, fmt: pxFmt })),
        field('Opacidad del contorno', sl('outlineOpacity', { min: 0.1, max: 1, step: 0.05, fmt: pctFmt })),
        field('Color del contorno', h('input', { type: 'color', value: xh.outlineColor, oninput: (e) => { xh.outlineColor = e.target.value; change(); } })),
      ),
      toggle('Mira dinámica', 'dynamic', 'Las líneas se separan exactamente lo que se desvían tus balas al moverte, saltar o disparar en ráfaga. Pruébalo con «Simular disparo».'),
    ],
    lineas: () => [
      toggle('Líneas interiores', 'lines'),
      group(
        'lines',
        field('Largo', sl('size', { min: 0, max: 20, fmt: pxFmt })),
        field('Grosor', sl('thickness', { min: 1, max: 6, fmt: pxFmt })),
        field('Separación del centro', sl('gap', { min: 0, max: 14, fmt: pxFmt })),
        toggle('En forma de T (sin la línea de arriba)', 'tShape'),
      ),
      toggle('Líneas exteriores', 'outer', 'Un segundo juego de líneas más afuera, más tenue.'),
      group(
        'outer',
        field('Largo', sl('outerSize', { min: 0, max: 20, fmt: pxFmt })),
        field('Grosor', sl('outerThickness', { min: 1, max: 6, fmt: pxFmt })),
        field('Separación del centro', sl('outerGap', { min: 2, max: 30, fmt: pxFmt })),
        field('Opacidad', sl('outerOpacity', { min: 0.1, max: 1, step: 0.05, fmt: pctFmt })),
      ),
    ],
    centro: () => [
      toggle('Punto central', 'dot'),
      group(
        'dot',
        field('Tamaño', sl('dotSize', { min: 1, max: 8, fmt: pxFmt })),
        field('Opacidad', sl('dotOpacity', { min: 0.1, max: 1, step: 0.05, fmt: pctFmt })),
        toggle('Redondo', 'dotRound'),
      ),
      toggle('Anillo', 'ring', 'Un círculo alrededor del centro (útil con la escopeta).'),
      group(
        'ring',
        field('Radio', sl('ringRadius', { min: 3, max: 30, fmt: pxFmt })),
        field('Grosor', sl('ringThickness', { min: 1, max: 4, fmt: pxFmt })),
        field('Opacidad', sl('ringOpacity', { min: 0.1, max: 1, step: 0.05, fmt: pctFmt })),
      ),
    ],
    avanzado: () => [
      field('Rotación', sl('rotation', { min: 0, max: 45, fmt: (v) => `${v}°` }), 'A 45° la cruz queda en forma de X.'),
      field(
        'Una retícula por arma',
        h('span', {
          class: 'switch',
        }, h('input', {
          type: 'checkbox',
          checked: s.crosshairPerWeapon,
          onchange: (e) => {
            s.crosshairPerWeapon = e.target.checked;
            persist();
            rerender();
          },
        })),
        'Cada arma con la suya (la escopeta muestra su anillo; el francotirador, un punto). Desactívalo para usar la misma en todas.',
      ),
      h(
        'div',
        { class: 'row xs-actions' },
        s.crosshairPerWeapon &&
          button('Usar esta en todas las armas', () => {
            const c = normalizeCrosshair(xh);
            for (const id of WEAPON_ORDER) Object.assign(s.weaponCrosshairs[id], structuredClone(c));
            persist();
            game.ui.toast('La retícula se copió a todas las armas.');
            rerender();
          }),
        s.crosshairPerWeapon && button(`Original de ${WEAPONS[weaponId].name}`, () => apply(WEAPONS[weaponId].crosshair, 'Se restauró la retícula original del arma.'), { variant: 'ghost' }),
        button('Valores de Retícula', () => apply(CROSSHAIR_DEFAULTS, 'Se restauró la retícula por defecto.'), { variant: 'ghost' }),
      ),
    ],
  };

  const tabBody = h('div', { class: 'xs-tab-body' });
  const tabBar = h('nav', { class: 'settings-tabs xs-tabs', role: 'tablist', 'aria-label': 'Piezas de la retícula' });
  const showTab = (id) => {
    memory.tab = id;
    groups.length = 0;
    tabBody.replaceChildren(...panels[id]().filter(Boolean));
    syncGroups();
    for (const b of tabBar.children) {
      const on = b.dataset.tab === id;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    }
  };
  for (const [id, label] of Object.entries(TABS)) {
    tabBar.append(h('button', { class: 'settings-tab', type: 'button', role: 'tab', 'data-tab': id, onclick: () => showTab(id) }, label));
  }

  // --- Biblioteca: presets y retículas guardadas --------------------------------------------------
  const card = (config, label, onPick, extra = null) =>
    h(
      'div',
      { class: 'xs-card' },
      h(
        'button',
        { class: 'xs-card-main', type: 'button', onclick: onPick, title: `Aplicar «${label}»` },
        h('span', { class: 'xs-card-xh', html: crosshairSVG(config) }),
        h('span', { class: 'xs-card-name' }, label),
      ),
      extra,
    );
  const presetGrid = h(
    'div',
    { class: 'xs-grid' },
    CROSSHAIR_PRESETS.map((p) => card(p.config, p.label, () => apply(p.config, `Retícula «${p.label}» aplicada.`))),
  );

  const saved = s.savedCrosshairs ?? [];
  const nameInput = h('input', { type: 'text', class: 'xs-name', maxlength: 28, placeholder: `Mi retícula ${saved.length + 1}`, 'aria-label': 'Nombre de la retícula' });
  const saveBtn = button('Guardar la actual', () => {
    const name = saveCrosshair(s, xh, nameInput.value);
    persist();
    game.ui.toast(`Guardada como «${name}».`);
    rerender();
  }, { variant: 'primary' });
  const savedGrid = saved.length
    ? h(
        'div',
        { class: 'xs-grid' },
        saved.map((item, i) =>
          card(
            item.config,
            item.name,
            () => apply(item.config, `Retícula «${item.name}» aplicada.`),
            h('button', {
              class: 'xs-card-del',
              type: 'button',
              title: `Borrar «${item.name}»`,
              'aria-label': `Borrar ${item.name}`,
              onclick: () => {
                saved.splice(i, 1);
                persist();
                rerender();
              },
            }, '×'),
          ),
        ),
      )
    : h('p', { class: 'muted small' }, 'Todavía no guardaste ninguna. Ajusta la retícula a tu gusto y guárdala con un nombre para volver a ella cuando quieras.');

  const editing = s.crosshairPerWeapon ? `Editando la retícula de: ${WEAPONS[weaponId].name}` : 'Editando la retícula de todas las armas';
  const screen = h(
    'div',
    { class: 'screen wide xs-screen' },
    h(
      'header',
      { class: 'screen-head' },
      h('div', {}, h('div', { class: 'eyebrow' }, 'Personalización'), h('h2', {}, 'Retícula'), h('p', { class: 'muted' }, 'Arma tu mira pieza por pieza. Se guarda al instante y se usa en todos los modos.')),
      button('← Volver', onBack, { variant: 'ghost' }),
    ),
    h(
      'div',
      { class: 'xs-layout' },
      h(
        'section',
        { class: 'xs-preview-col' },
        stage,
        h('div', { class: 'xs-stage-bar' }, bgChips, zoomChips, fireToggle),
        s.crosshairPerWeapon && weaponChips,
        h('p', { class: 'xs-editing small muted' }, editing),
        field('Código para compartir', h('div', { class: 'xh-code-row' }, codeInput, copyBtn, applyCodeBtn), 'Copia tu retícula o pega la de otra persona.'),
      ),
      h('section', { class: 'panel xs-editor' }, tabBar, tabBody),
    ),
    h(
      'section',
      { class: 'panel xs-library' },
      h('h3', {}, 'Presets'),
      presetGrid,
      h('div', { class: 'xs-saved-head' }, h('h3', {}, 'Mis retículas'), h('div', { class: 'xs-save-row' }, nameInput, saveBtn)),
      savedGrid,
    ),
  );
  showTab(TABS[memory.tab] ? memory.tab : 'general');
  refreshPreview();
  return screen;
}
