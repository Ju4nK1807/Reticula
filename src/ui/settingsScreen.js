import { h } from './dom.js';
import { button } from './components.js';
import { CROSSHAIR_PRESETS, crosshairCode, crosshairSVG, normalizeCrosshair, parseCrosshairCode } from './Crosshair.js';
import { ENEMY_COLORS } from '../config/defaults.js';
import { FOV_PRESETS, GAMES, cmPer360, convertSens, formatSens, roundTo, valueForCm } from '../config/sensitivity.js';
import { QUALITY_OPTIONS, QUALITY_PRESETS, RENDER_SCALE } from '../config/quality.js';
import { WEAPONS, WEAPON_ORDER } from '../combat/weapons.js';

const SHAPES = {
  cross: 'Cruz',
  'cross-dot': 'Cruz + punto',
  dot: 'Punto',
  circle: 'Círculo',
  t: 'T',
};

export const CONTROLS = [
  ['Mouse', 'Apuntar · clic izquierdo dispara'],
  ['Clic derecho', 'Mira telescópica (francotirador)'],
  ['W A S D', 'Moverse'],
  ['Shift', 'Caminar (más preciso)'],
  ['C', 'Agacharse'],
  ['Espacio', 'Saltar'],
  ['R', 'Recargar'],
  ['1 – 5', 'Cambiar de arma (no en la evaluación)'],
  ['B', 'Automático / semiautomático (si el arma lo permite)'],
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

// Panel de la mira: arma a editar, presets, forma, colores, tamaños, punto, contorno, mira dinámica
// y código. Al aplicar un preset, un código o cambiar de arma se reconstruye el panel.
function crosshairPanel(game, commit, editing = null) {
  const s = game.settings;
  const perWeapon = s.crosshairPerWeapon;
  const weaponId = WEAPONS[editing] ? editing : s.weapon;
  const xh = perWeapon ? s.weaponCrosshairs[weaponId] : s.crosshair;
  const section = h('section', { class: 'panel' });
  const rebuild = (id = weaponId) => section.replaceWith(crosshairPanel(game, commit, id));
  const preview = h('div', { class: 'xh-preview' }, h('div', { class: 'xh-dark' }), h('div', { class: 'xh-light' }));
  const codeInput = h('input', { type: 'text', class: 'xh-code', spellcheck: false, 'aria-label': 'Código de la mira' });

  const refresh = () => {
    const svg = crosshairSVG(xh);
    preview.children[0].innerHTML = svg;
    preview.children[1].innerHTML = svg;
    codeInput.value = crosshairCode(xh);
  };
  const change = () => {
    commit();
    refresh();
  };
  const apply = (config) => {
    Object.assign(xh, normalizeCrosshair(config));
    commit();
    rebuild();
  };

  const perWeaponToggle = h('input', {
    type: 'checkbox',
    checked: perWeapon,
    onchange: (e) => {
      s.crosshairPerWeapon = e.target.checked;
      commit();
      rebuild();
    },
  });
  const weaponTabs =
    perWeapon &&
    h(
      'div',
      { class: 'chips xh-weapons' },
      WEAPON_ORDER.map((id) =>
        h('button', { class: `chip${id === weaponId ? ' active' : ''}`, type: 'button', onclick: () => rebuild(id) }, WEAPONS[id].name),
      ),
    );
  const resetWeapon =
    perWeapon && button(`Mira original de ${WEAPONS[weaponId].name}`, () => apply(WEAPONS[weaponId].crosshair), { variant: 'ghost' });

  const presets = h(
    'div',
    { class: 'chips' },
    CROSSHAIR_PRESETS.map((p) => h('button', { class: 'chip', type: 'button', onclick: () => apply(p.config) }, p.label)),
  );

  const copyBtn = button('Copiar', async () => {
    try {
      await navigator.clipboard.writeText(codeInput.value);
      game.ui.toast('Código de la mira copiado.');
    } catch {
      codeInput.select();
      game.ui.toast('Selecciona el código y cópialo con Ctrl+C.');
    }
  });
  const applyBtn = button('Aplicar', () => {
    const config = parseCrosshairCode(codeInput.value);
    if (!config) {
      game.ui.toast('Ese código no es válido. Debe empezar por RTC1;');
      return;
    }
    apply(config);
    game.ui.toast('Mira aplicada.');
  });

  section.append(
    h('h3', {}, 'Mira'),
    field('Mira distinta para cada arma', perWeaponToggle, 'Cada arma tiene la suya (la escopeta muestra su cono; el francotirador, un punto). Desactívalo para usar una sola mira.'),
    weaponTabs && field('Editando', weaponTabs),
    preview,
    field('Presets', presets),
    field('Forma', select(SHAPES, xh.shape, (v) => {
      xh.shape = v;
      change();
    })),
    field('Color', h('input', { type: 'color', value: xh.color, oninput: (e) => { xh.color = e.target.value; change(); } })),
    field('Largo', slider(xh, 'size', { min: 0, max: 20 }, change)),
    field('Grosor', slider(xh, 'thickness', { min: 1, max: 6 }, change)),
    field('Separación', slider(xh, 'gap', { min: 0, max: 14 }, change)),
    field('Opacidad', slider(xh, 'opacity', { min: 0.2, max: 1, step: 0.05, fmt: (v) => `${Math.round(v * 100)}%` }, change)),
    field('Punto central', checkbox(xh, 'dot', change), 'Se suma a cualquier forma.'),
    field('Tamaño del punto', slider(xh, 'dotSize', { min: 1, max: 6 }, change)),
    field('Contorno', checkbox(xh, 'outline', change)),
    field('Grosor del contorno', slider(xh, 'outlineThickness', { min: 1, max: 3 }, change)),
    field('Color del contorno', h('input', { type: 'color', value: xh.outlineColor, oninput: (e) => { xh.outlineColor = e.target.value; change(); } })),
    field('Mira dinámica', checkbox(xh, 'dynamic', change), 'Se abre exactamente lo que se desvían tus balas al moverte, saltar o disparar en ráfaga.'),
    field('Código para compartir', h('div', { class: 'xh-code-row' }, codeInput, copyBtn, applyBtn), 'Copia tu mira o pega la de otra persona.'),
    resetWeapon,
  );
  refresh();
  return section;
}

// opts.crosshairWeapon: abre la sección de la mira editando esa arma (desde el Arsenal).
export function settingsScreen(game, onBack, opts = {}) {
  const s = game.settings;
  const commit = () => {
    game.store.persist();
    game.applySettings();
  };

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

  // Calidad: elegir un preset ajusta la resolución; mover la resolución a mano pasa a "Personalizada".
  const scaleSlider = slider(s.video, 'renderScale', { ...RENDER_SCALE, fmt: (v) => `${Math.round(v * 100)}%` }, () => {
    s.video.quality = 'custom';
    qualitySelect.value = 'custom';
    commit();
  });
  const qualitySelect = select(QUALITY_OPTIONS, s.video.quality, (v) => {
    s.video.quality = v;
    if (QUALITY_PRESETS[v]) {
      s.video.renderScale = QUALITY_PRESETS[v].renderScale;
      scaleSlider.sync();
    }
    commit();
  });

  const resetSettingsBtn = button('Restablecer configuración', () => {
    if (confirm('¿Volver a la configuración por defecto (sensibilidad, FOV, mira, video, audio)? El progreso se conserva.')) {
      game.store.resetSettings();
      game.applySettings();
      game.ui.toast('Configuración restablecida.');
      game.showSettings(onBack);
    }
  });

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
        h('p', { class: 'muted small' }, (game.input.rawInput ?? game.input.rawInputSupported) === false
          ? 'Tu navegador no admite raw input: desactiva "Mejorar precisión del puntero" en Windows para una conversión exacta.'
          : 'Se usa raw input (sin aceleración) cuando el navegador lo admite: Chrome o Edge.'),
        h('h3', {}, 'Video'),
        field('FOV horizontal', fovSlider, 'Equivalente en pantallas 16:9.'),
        fovPresets,
        field('Calidad', qualitySelect, 'Baja la resolución de render para ganar FPS en equipos modestos.'),
        field('Resolución de render', scaleSlider, 'Porcentaje de la resolución de la pantalla (la interfaz no cambia).'),
        field('Mostrar FPS', checkbox(s.video, 'showFps', commit), 'FPS promedio, ms por cuadro y 1 % low (tirones).'),
        h('h3', {}, 'Audio'),
        field('Volumen', slider(s.audio, 'volume', { min: 0, max: 1, step: 0.05, fmt: (v) => `${Math.round(v * 100)}%` }, () => {
          commit();
          game.sfx.hit();
        })),
      ),
      crosshairPanel(game, commit, opts.crosshairWeapon ?? null),
      h(
        'section',
        { class: 'panel' },
        h('h3', {}, 'Juego'),
        field('Color de enemigos', select(ENEMY_COLORS, s.enemyColor, (v) => {
          s.enemyColor = v;
          commit();
        }), 'Se aplica a los bots nuevos.'),
        field('Imprecisión al moverse', checkbox(s.gameplay, 'moveInaccuracy', commit), 'Como en CS2 o Valorant: dispara quieto o caminando.'),
        field('Recarga automática', checkbox(s.gameplay, 'autoReload', commit), 'Recarga sola al disparar con el cargador vacío. Desactívala para recargar siempre con R.'),
        field('Balas visibles', checkbox(s.gameplay, 'tracers', commit)),
        field('Arma en pantalla', checkbox(s.gameplay, 'viewmodel', commit)),
        field('Sensibilidad con zoom', slider(s.gameplay, 'zoomSensitivity', { min: 0.5, max: 1.5, step: 0.05, fmt: (v) => `×${v.toFixed(2)}` }, commit), 'Con la mira telescópica la sensibilidad baja en proporción al zoom; ×1 se siente igual que sin zoom.'),
        h('h3', {}, 'Controles'),
        h('dl', { class: 'controls' }, CONTROLS.map(([k, v]) => [h('dt', {}, h('kbd', {}, k)), h('dd', {}, v)])),
        h('h3', {}, 'Datos'),
        h('div', { class: 'row' }, resetSettingsBtn, resetBtn),
      ),
    ),
  );
}
