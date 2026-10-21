import { h } from './dom.js';
import { button } from './components.js';
import { crosshairSVG } from './Crosshair.js';
import { ENEMY_COLORS } from '../config/defaults.js';
import { FOV_PRESETS, GAMES, cmPer360, convertSens, formatSens, roundTo, valueForCm } from '../config/sensitivity.js';

const SHAPES = {
  cross: 'Cruz',
  'cross-dot': 'Cruz + punto',
  dot: 'Punto',
  circle: 'Círculo',
  t: 'T',
};

export const CONTROLS = [
  ['Mouse', 'Apuntar · clic izquierdo dispara'],
  ['W A S D', 'Moverse'],
  ['Shift', 'Caminar (más preciso)'],
  ['C', 'Agacharse'],
  ['Espacio', 'Saltar'],
  ['R', 'Recargar (cargador de 25)'],
  ['[  /  ]', 'Bajar / subir sensibilidad 3 %'],
  ['Retroceso', 'Reiniciar la fase actual'],
  ['Esc', 'Pausa'],
];

function field(label, control, hint) {
  return h('label', { class: 'field' }, h('span', { class: 'f-label' }, label), control, hint && h('span', { class: 'f-hint' }, hint));
}

function select(options, value, onChange) {
  return h(
    'select',
    { onchange: (e) => onChange(e.target.value) },
    Object.entries(options).map(([v, label]) => h('option', { value: v, selected: v === value }, label)),
  );
}

// Slider con valor visible a la derecha. Devuelve el contenedor; `.sync()` relee el valor.
function slider(obj, key, { min, max, step = 1, fmt = (v) => v }, onChange) {
  const out = h('output', {}, fmt(obj[key]));
  const input = h('input', {
    type: 'range',
    min,
    max,
    step,
    value: obj[key],
    oninput: (e) => {
      obj[key] = parseFloat(e.target.value);
      out.textContent = fmt(obj[key]);
      onChange();
    },
  });
  const wrap = h('div', { class: 'slider' }, input, out);
  wrap.sync = () => {
    input.value = obj[key];
    out.textContent = fmt(obj[key]);
  };
  return wrap;
}

function checkbox(obj, key, onChange) {
  return h('input', {
    type: 'checkbox',
    checked: !!obj[key],
    onchange: (e) => {
      obj[key] = e.target.checked;
      onChange();
    },
  });
}

// Bloque de sensibilidad reutilizable (también aparece en la pausa).
export function sensitivityPanel(game, { compact = false } = {}) {
  const s = game.settings.sens;
  const commit = () => {
    game.store.persist();
    game.applySettings();
    refresh();
  };

  const valueInput = h('input', {
    type: 'number',
    min: 0.001,
    step: GAMES[s.game]?.step ?? 0.01,
    value: s.value,
    oninput: (e) => {
      const v = parseFloat(e.target.value);
      if (v > 0) {
        s.value = v;
        commit();
      }
    },
  });
  const cmInput = h('input', {
    type: 'number',
    min: 5,
    max: 200,
    step: 0.5,
    oninput: (e) => {
      const cm = parseFloat(e.target.value);
      if (cm > 0) {
        s.value = roundTo(valueForCm(s.game, cm, s.dpi), GAMES[s.game].decimals);
        valueInput.value = s.value;
        game.store.persist();
        game.applySettings();
        refresh(false);
      }
    },
  });
  const gameSelect = select(
    Object.fromEntries(Object.entries(GAMES).map(([id, g]) => [id, g.label])),
    s.game,
    (to) => {
      // Al cambiar de juego se convierte el valor para conservar la misma sensación (cm/360).
      s.value = roundTo(convertSens(s.game, s.value, to), GAMES[to].decimals);
      s.game = to;
      valueInput.step = GAMES[to].step;
      valueInput.value = s.value;
      commit();
    },
  );
  const dpiInput = h('input', {
    type: 'number',
    min: 100,
    max: 32000,
    step: 50,
    value: s.dpi,
    oninput: (e) => {
      const v = parseInt(e.target.value, 10);
      if (v > 0) {
        s.dpi = v;
        commit();
      }
    },
  });
  const equivalents = h('div', { class: 'equivalents' });
  const readout = h('div', { class: 'readout' });

  function refresh(updateCm = true) {
    const cm = cmPer360(s.game, s.value, s.dpi);
    if (updateCm && document.activeElement !== cmInput) cmInput.value = cm.toFixed(1);
    readout.replaceChildren(
      h('strong', {}, `${cm.toFixed(1)} cm/360`),
      h('span', {}, ` · ${(cm / 2.54).toFixed(1)} in · eDPI ${Math.round(s.value * s.dpi)}`),
    );
    if (compact) return;
    equivalents.replaceChildren(
      h('div', { class: 'eq-title' }, 'Equivalente en otros juegos'),
      ...Object.entries(GAMES)
        .filter(([id]) => id !== s.game)
        .map(([id, g]) => h('div', { class: 'eq-row' }, h('span', {}, g.label), h('strong', {}, formatSens(id, convertSens(s.game, s.value, id))))),
    );
  }

  refresh();
  return h(
    'div',
    { class: 'sens-panel' },
    field('Juego / escala', gameSelect),
    field('Sensibilidad', valueInput, 'Escribe la misma que usas en ese juego.'),
    field('DPI del mouse', dpiInput),
    field('cm / 360', cmInput, 'Distancia que mueves el mouse para girar 360°.'),
    !compact && field('Invertir eje Y', checkbox(s, 'invertY', commit)),
    readout,
    !compact && equivalents,
  );
}

export function settingsScreen(game, onBack) {
  const s = game.settings;
  const commit = () => {
    game.store.persist();
    game.applySettings();
    preview.innerHTML = crosshairSVG(xh);
  };

  const xh = s.crosshair;
  const preview = h('div', { class: 'xh-preview' });
  preview.innerHTML = crosshairSVG(xh);

  const fovSlider = slider(s, 'fov', { min: 70, max: 130, fmt: (v) => `${v}°` }, commit);
  const fovPresets = h(
    'div',
    { class: 'chips' },
    FOV_PRESETS.map((p) =>
      h('button', {
        class: 'chip',
        type: 'button',
        onclick: () => {
          s.fov = p.value;
          fovSlider.sync();
          commit();
        },
      }, `${p.label} · ${p.value}°`),
    ),
  );

  const resetBtn = button('Borrar progreso y rango', () => {
    if (confirm('¿Borrar rango, progreso y récords? La configuración se conserva.')) {
      game.store.resetProgress();
      game.ui.toast('Progreso borrado.');
    }
  }, { variant: 'danger' });

  return h(
    'div',
    { class: 'screen' },
    h('header', { class: 'screen-head' }, h('h2', {}, 'Configuración'), button('← Volver', onBack, { variant: 'ghost' })),
    h(
      'div',
      { class: 'settings-grid' },
      h(
        'section',
        { class: 'panel' },
        h('h3', {}, 'Sensibilidad'),
        h('p', { class: 'muted small' }, 'Retícula gira exactamente lo mismo que tu juego por cada movimiento del mouse. Al cambiar de juego, el valor se convierte para mantener tus cm/360.'),
        sensitivityPanel(game),
        h('p', { class: 'muted small' }, game.input.rawInput === false
          ? 'Tu navegador no admite raw input: desactiva "Mejorar precisión del puntero" en Windows para una conversión exacta.'
          : 'Se usa raw input (sin aceleración) cuando el navegador lo admite: Chrome o Edge.'),
        h('h3', {}, 'Video'),
        field('FOV horizontal', fovSlider, 'Equivalente en pantallas 16:9.'),
        fovPresets,
        field('Mostrar FPS', checkbox(s.video, 'showFps', commit)),
        h('h3', {}, 'Audio'),
        field('Volumen', slider(s.audio, 'volume', { min: 0, max: 1, step: 0.05, fmt: (v) => `${Math.round(v * 100)}%` }, () => {
          commit();
          game.sfx.hit();
        })),
      ),
      h(
        'section',
        { class: 'panel' },
        h('h3', {}, 'Mira'),
        preview,
        field('Forma', select(SHAPES, xh.shape, (v) => {
          xh.shape = v;
          commit();
        })),
        field('Color', h('input', { type: 'color', value: xh.color, oninput: (e) => { xh.color = e.target.value; commit(); } })),
        field('Largo', slider(xh, 'size', { min: 0, max: 20 }, commit)),
        field('Grosor', slider(xh, 'thickness', { min: 1, max: 6 }, commit)),
        field('Separación', slider(xh, 'gap', { min: 0, max: 14 }, commit)),
        field('Opacidad', slider(xh, 'opacity', { min: 0.2, max: 1, step: 0.05, fmt: (v) => `${Math.round(v * 100)}%` }, commit)),
        field('Contorno', checkbox(xh, 'outline', commit)),
        h('h3', {}, 'Juego'),
        field('Color de enemigos', select(ENEMY_COLORS, s.enemyColor, (v) => {
          s.enemyColor = v;
          commit();
        }), 'Se aplica a los bots nuevos.'),
        field('Imprecisión al moverse', checkbox(s.gameplay, 'moveInaccuracy', commit), 'Como en CS2 o Valorant: dispara quieto o caminando.'),
        field('Recarga automática', checkbox(s.gameplay, 'autoReload', commit), 'Recarga sola al disparar con el cargador vacío. Desactívala para recargar siempre con R.'),
        field('Balas visibles', checkbox(s.gameplay, 'tracers', commit)),
        field('Arma en pantalla', checkbox(s.gameplay, 'viewmodel', commit)),
        h('h3', {}, 'Controles'),
        h('dl', { class: 'controls' }, CONTROLS.map(([k, v]) => [h('dt', {}, h('kbd', {}, k)), h('dd', {}, v)])),
        h('h3', {}, 'Datos'),
        resetBtn,
      ),
    ),
  );
}
