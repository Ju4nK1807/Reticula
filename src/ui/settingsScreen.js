import { h } from './dom.js';
import { button } from './components.js';
import { checkbox, field, select, slider } from './controls.js';
import { crosshairSVG } from './Crosshair.js';
import { ENEMY_COLORS } from '../config/defaults.js';
import { FOV_PRESETS, GAMES, cmPer360, convertSens, formatSens, roundTo, valueForCm } from '../config/sensitivity.js';
import { QUALITY_OPTIONS, QUALITY_PRESETS, RENDER_SCALE, SHADOW_OPTIONS, resolveQuality } from '../config/quality.js';
import { ACTIONS, DEFAULT_KEYS, isReservedCode, keyLabel, rebind } from '../config/keybinds.js';

// Teclas en uso (las fija Game.applySettings): las listas de controles muestran las del jugador.
let activeKeys = DEFAULT_KEYS;
export const setActiveKeys = (keys) => {
  activeKeys = keys;
};
export const currentKey = (id) => keyLabel(activeKeys, id);

/** Controles de teclado y mouse con las teclas que eligió el jugador. */
export function keyboardControls() {
  const k = currentKey;
  return [
    ['Mouse', 'Apuntar · clic izquierdo dispara (mantenlo con las automáticas)'],
    ['Clic derecho', 'Apuntar con las miras · mira telescópica'],
    ['Rueda · 1 – 9', 'Cambiar de arma (no en la evaluación)'],
    [`${k('forward')} ${k('left')} ${k('back')} ${k('right')}`, 'Moverse'],
    [k('walk'), 'Caminar (más preciso)'],
    [k('crouch'), 'Agacharse'],
    [k('jump'), 'Saltar'],
    [k('reload'), 'Recargar'],
    [k('fireMode'), 'Modo de disparo (si el arma tiene varios)'],
    [k('melee'), 'Cuchillo (donde se permite)'],
    [`${k('grenade')} · ${k('grenadeNext')}`, 'Granada · cambiar de tipo (donde hay granadas)'],
    [`${k('sensDown')}  /  ${k('sensUp')}`, 'Bajar / subir sensibilidad 3 %'],
    [k('restart'), 'Reiniciar la fase actual'],
    ['Esc', 'Pausa'],
  ];
}

/** Controles en pantalla del modo táctil (teléfonos y tabletas). */
export const TOUCH_CONTROLS = [
  ['Joystick', 'Moverse: apoya el dedo en la mitad izquierda'],
  ['Arrastrar', 'Apuntar: desliza el dedo en la mitad derecha'],
  ['Disparo', 'Botón grande de la derecha (mantenlo para ráfaga)'],
  ['Mira', 'Apuntar con las miras (o la mira telescópica del francotirador)'],
  ['Recarga', 'Recargar el cargador'],
  ['Salto · Agachar', 'Saltar y agacharse'],
  ['Arma', 'Cambiar de arma (no en la evaluación)'],
  ['Pausa', 'Botón de arriba a la izquierda o el botón Atrás del teléfono'],
];

/** True si el juego corre con controles táctiles. */
export const isTouchUI = () => typeof document !== 'undefined' && !!document.querySelector('.touch-mode');

/** Lista de controles que corresponde al dispositivo actual. */
export const controlList = () => (isTouchUI() ? TOUCH_CONTROLS : keyboardControls());

// Pestaña de controles: cada acción con su tecla; clic en la tecla y pulsar la nueva. Si la tecla ya
// la usaba otra acción, se intercambian.
function keybindsPanel(game) {
  const s = game.settings;
  let listening = null; // { id, btn }
  const buttons = new Map();
  const refresh = () => {
    for (const [id, btn] of buttons) btn.textContent = keyLabel(s.keys, id);
  };
  const stop = () => {
    window.removeEventListener('keydown', onCapture, true);
    listening?.btn.classList.remove('listening');
    listening = null;
    refresh();
  };
  // Se escucha en window y en captura: va antes que Esc/Retroceso de la interfaz.
  function onCapture(e) {
    if (!listening?.btn.isConnected) return stop();
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.code === 'Escape') return stop();
    if (isReservedCode(e.code)) {
      game.ui.toast('Esa tecla está reservada (Esc es la pausa y 1-9 las armas).');
      return;
    }
    const { id } = listening;
    const swapped = rebind(s.keys, id, e.code);
    game.store.persist();
    game.applySettings();
    if (swapped) game.ui.toast(`«${ACTIONS.find((a) => a.id === swapped).label}» pasa a ${keyLabel(s.keys, swapped)}.`);
    if (/^Control/.test(e.code) && location.protocol !== 'reticula:') {
      game.ui.toast('Ojo: en el navegador, Ctrl + W cierra la pestaña. En la app de escritorio no pasa.', 6000);
    }
    stop();
  }
  const listen = (id, btn) => {
    if (listening) stop();
    listening = { id, btn };
    btn.textContent = 'Pulsa una tecla…';
    btn.classList.add('listening');
    window.addEventListener('keydown', onCapture, true);
  };

  const groups = [...new Set(ACTIONS.map((a) => a.group))];
  const reset = button('Restablecer controles', () => {
    s.keys = { ...DEFAULT_KEYS };
    game.store.persist();
    game.applySettings();
    refresh();
    game.ui.toast('Controles por defecto.');
  });
  const panel = h(
    'section',
    { class: 'panel' },
    h('h3', {}, 'Controles'),
    h('p', { class: 'muted small' }, 'Haz clic en una tecla y pulsa la nueva (Esc cancela). Disparar y apuntar van en el mouse; Esc (pausa) y 1-9 (armas) son fijas.'),
    groups.map((g) =>
      h(
        'div',
        { class: 'keybind-group' },
        h('h4', {}, g),
        ACTIONS.filter((a) => a.group === g).map((a) => {
          const btn = h('button', { class: 'keybind', type: 'button', onclick: () => listen(a.id, btn) }, keyLabel(s.keys, a.id));
          buttons.set(a.id, btn);
          return h('div', { class: 'keybind-row' }, h('span', {}, a.label), btn);
        }),
      ),
    ),
    h('div', { class: 'row' }, reset),
  );
  panel.dataset.disposable = '';
  panel._dispose = stop;
  return panel;
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

// Pestaña de la mira: vista previa y acceso al editor de retícula (ui/crosshairScreen.js).
function crosshairPanel(game, onBack) {
  const s = game.settings;
  const xh = game.activeCrosshair();
  const svg = crosshairSVG(xh);
  return h(
    'section',
    { class: 'panel' },
    h('h3', {}, 'Mira'),
    h('div', { class: 'xh-preview' }, h('div', { class: 'xh-dark', html: svg }), h('div', { class: 'xh-light', html: svg })),
    h(
      'p',
      { class: 'muted' },
      s.crosshairPerWeapon
        ? 'Cada arma tiene su propia retícula. En el editor puedes cambiar líneas, punto, anillo, contorno, color y rotación, guardar tus favoritas y compartirlas con un código.'
        : 'Usas la misma retícula en todas las armas. En el editor puedes cambiar líneas, punto, anillo, contorno, color y rotación, guardar tus favoritas y compartirlas con un código.',
    ),
    h('div', { class: 'row' }, button('Abrir el editor de retícula', () => game.showCrosshair(() => game.showSettings(onBack, { tab: 'mira' })), { variant: 'primary' })),
  );
}

// Última pestaña abierta (se recuerda durante la sesión).
let lastTab = 'sens';

// opts.tab: abre directamente esa pestaña (p. ej. 'datos' desde el botón de ayuda del menú).
const DETAIL_OPTIONS = { alta: 'Alta', media: 'Media', baja: 'Baja' };

// "ANGLE (Intel, Intel(R) UHD Graphics (0x0000A7A8) Direct3D11 vs_5_0 ps_5_0, D3D11)" → "Intel(R) UHD Graphics".
export function shortGpuName(name = '') {
  const m = /^ANGLE \([^,]+, (.+?)(?: \(0x[0-9a-f]+\))?(?: Direct3D| OpenGL| Vulkan|,|\)$)/i.exec(name);
  return (m ? m[1] : name).trim();
}

// En un portátil con gráfica integrada (Intel, Radeon de APU) el juego puede ir mucho mejor con la
// dedicada, pero quien elige la GPU es Windows. Se explica cómo, solo en escritorio.
function integratedGpuHint(game) {
  const name = game.engine.gpuName ?? '';
  if (game.touchMode || !/intel|uhd|iris|radeon\(tm\) graphics|vega/i.test(name)) return null;
  const app = location.protocol === 'reticula:';
  return h(
    'p',
    { class: 'readout small' },
    app
      ? 'Estás en la gráfica integrada. La app pide a Windows la gráfica dedicada (NVIDIA/AMD) y la usa desde el próximo inicio. Si sigue igual: Configuración de Windows → Sistema → Pantalla → Gráficos → Retícula → Alto rendimiento.'
      : 'Estás en la gráfica integrada. Si tu equipo tiene una NVIDIA o AMD, el juego irá mucho más fluido con ella: Configuración de Windows → Sistema → Pantalla → Gráficos → agrega tu navegador → Alto rendimiento (y reinícialo). La app de escritorio de Retícula lo hace sola.',
  );
}

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

  // Calidad: elegir un preset ajusta resolución y detalle; mover cualquiera de los dos a mano pasa a
  // "Personalizada" (conservando el otro valor). En "Automática" se ven los valores que está usando.
  if (s.video.quality === 'auto') s.video.renderScale = s.video.autoScale ?? 1;
  const gpu = shortGpuName(game.engine.gpuName);
  const autoInfo = h('p', { class: 'muted small' });
  const refreshAutoInfo = () => {
    const auto = s.video.quality === 'auto';
    const parts = [];
    if (auto) parts.push(`Ajuste automático ahora: detalle ${DETAIL_OPTIONS[s.video.autoDetail] ?? 'Media'} · ${Math.round((s.video.autoScale ?? 1) * 100)} % de resolución. Se adapta mientras juegas para mantener 60 FPS.`);
    if (gpu) parts.push(`Tarjeta gráfica en uso: ${gpu}.`);
    autoInfo.textContent = parts.join(' ');
  };
  refreshAutoInfo();
  const toCustom = () => {
    if (s.video.quality !== 'custom') s.video.detail = resolveQuality(s.video).detail;
    s.video.quality = 'custom';
    qualitySelect.value = 'custom';
  };
  const scaleSlider = slider(s.video, 'renderScale', { ...RENDER_SCALE, fmt: (v) => `${Math.round(v * 100)}%` }, () => {
    const detail = resolveQuality(s.video).detail;
    toCustom();
    s.video.detail = detail;
    commit();
  });
  const detailSelect = select(DETAIL_OPTIONS, resolveQuality(s.video).detail, (v) => {
    toCustom();
    s.video.detail = v;
    commit();
  });
  const qualitySelect = select(QUALITY_OPTIONS, s.video.quality, (v) => {
    s.video.quality = v;
    if (QUALITY_PRESETS[v]) {
      s.video.renderScale = QUALITY_PRESETS[v].renderScale;
      detailSelect.value = QUALITY_PRESETS[v].detail;
    } else if (v === 'auto') {
      s.video.renderScale = s.video.autoScale ?? 1;
      detailSelect.value = s.video.autoDetail ?? 'media';
    }
    scaleSlider.sync();
    commit();
    refreshAutoInfo();
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

  const rawNote = h('p', { class: 'muted small' }, (game.input.rawInput ?? game.input.rawInputSupported) === false
    ? 'Tu navegador no admite raw input: desactiva "Mejorar precisión del puntero" en Windows para una conversión exacta.'
    : 'Se usa raw input (sin aceleración) cuando el navegador lo admite: Chrome, Edge y la app de escritorio.');

  // Cada pestaña construye su contenido al mostrarse (los controles leen el valor actual).
  const TABS = {
    sens: ['Sensibilidad', () => [
      h('section', { class: 'panel' },
        h('h3', {}, 'Sensibilidad'),
        h('p', { class: 'muted small' }, 'Retícula gira exactamente lo mismo que tu juego por cada movimiento del mouse. Al cambiar de juego, el valor se convierte para mantener tus cm/360.'),
        sensitivityPanel(game),
        rawNote),
    ]],
    mira: ['Mira', () => [crosshairPanel(game, onBack)]],
    video: ['Video y audio', () => [
      h('section', { class: 'panel' },
        h('h3', {}, 'Video'),
        field('FOV horizontal', fovSlider, 'Equivalente en pantallas 16:9.'),
        fovPresets,
        field('Calidad', qualitySelect, 'Baja la resolución de render para ganar FPS en equipos modestos.'),
        field('Resolución de render', scaleSlider, 'Porcentaje de la resolución de la pantalla (la interfaz no cambia).'),
        field('Detalle gráfico', detailSelect, 'Alta: texturas 1K, sombras suaves y brillo en luces. Media: texturas 512 y sombras. Baja: sin sombras ni relieve, máximo rendimiento.'),
        field('Sombras', select(SHADOW_OPTIONS, s.video.shadows ?? 'auto', (v) => {
          s.video.shadows = v;
          commit();
        }), 'Según el detalle: las pone el nivel gráfico. Activadas: siempre, aun en detalle bajo. Desactivadas: más FPS en equipos modestos.'),
        autoInfo,
        integratedGpuHint(game),
        field('Mostrar FPS', checkbox(s.video, 'showFps', commit), 'FPS promedio, ms por cuadro y 1 % low (tirones).')),
      h('section', { class: 'panel' },
        h('h3', {}, 'Audio'),
        field('Volumen', slider(s.audio, 'volume', { min: 0, max: 1, step: 0.05, fmt: (v) => `${Math.round(v * 100)}%` }, () => {
          commit();
          game.sfx.hit();
        }))),
    ]],
    juego: ['Juego', () => [
      h('section', { class: 'panel' },
        h('h3', {}, 'Juego'),
        field('Color de enemigos', select(ENEMY_COLORS, s.enemyColor, (v) => {
          s.enemyColor = v;
          commit();
        }), 'Se aplica a los bots nuevos.'),
        field('Imprecisión al moverse', checkbox(s.gameplay, 'moveInaccuracy', commit), 'Como en CS2 o Valorant: dispara quieto o caminando.'),
        field('Recarga automática', checkbox(s.gameplay, 'autoReload', commit), 'Recarga sola al disparar con el cargador vacío. Desactívala para recargar siempre a mano.'),
        field('Balas visibles', checkbox(s.gameplay, 'tracers', commit)),
        field('Casquillos', checkbox(s.gameplay, 'casings', commit), 'Las armas expulsan las vainas, que rebotan en el suelo con su sonido.'),
        field('Arma en pantalla', checkbox(s.gameplay, 'viewmodel', commit)),
        field('Brazos y manos', checkbox(s.gameplay, 'hands', commit), 'Las manos sujetan el arma, el cuchillo y las granadas.'),
        field('Controles táctiles', select({ auto: 'Automático (sin mouse)', on: 'Activados', off: 'Desactivados' }, s.touch.mode, (v) => {
          s.touch.mode = v;
          commit();
          game.ui.toast('Se aplica al volver a abrir Retícula.');
        }), 'Joystick, botones y apuntar arrastrando el dedo, para teléfonos y tabletas.'),
        field('Sensibilidad táctil', slider(s.touch, 'sensitivity', { min: 0.3, max: 3, step: 0.05, fmt: (v) => `×${v.toFixed(2)}` }, commit), 'Cuánto gira la cámara al arrastrar el dedo (independiente de la del mouse).'),
        field('Invertir eje Y táctil', checkbox(s.touch, 'invertY', commit)),
        field('Sensibilidad con zoom', slider(s.gameplay, 'zoomSensitivity', { min: 0.5, max: 1.5, step: 0.05, fmt: (v) => `×${v.toFixed(2)}` }, commit), 'Con la mira telescópica la sensibilidad baja en proporción al zoom; ×1 se siente igual que sin zoom.')),
    ]],
    datos: ['Controles y datos', () => [
      game.touchMode
        ? h('section', { class: 'panel' },
          h('h3', {}, 'Controles'),
          h('dl', { class: 'controls' }, controlList().map(([k, v]) => [h('dt', {}, h('kbd', {}, k)), h('dd', {}, v)])))
        : keybindsPanel(game),
      h('section', { class: 'panel' },
        h('h3', {}, 'Datos'),
        h('p', { class: 'muted small' }, 'Para guardar una copia de tu progreso usa Progreso → Datos → Exportar.'),
        h('div', { class: 'row' }, resetSettingsBtn, resetBtn)),
    ]],
  };

  const content = h('div', { class: 'settings-grid' });
  const tabs = h('nav', { class: 'settings-tabs', role: 'tablist', 'aria-label': 'Secciones de configuración' });
  const show = (id) => {
    lastTab = id;
    for (const b of tabs.children) {
      const on = b.dataset.tab === id;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    }
    const panels = TABS[id][1]();
    content.classList.toggle('single', panels.length === 1);
    content.replaceChildren(...panels);
  };
  for (const [id, [label]] of Object.entries(TABS)) {
    tabs.append(h('button', { class: 'settings-tab', type: 'button', role: 'tab', 'data-tab': id, onclick: () => show(id) }, label));
  }
  show(opts.tab ?? lastTab);

  return h(
    'div',
    { class: 'screen' },
    h('header', { class: 'screen-head' }, h('div', {}, h('div', { class: 'eyebrow' }, 'Ajustes'), h('h2', {}, 'Configuración')), button('← Volver', onBack, { variant: 'ghost' })),
    tabs,
    content,
  );
}
