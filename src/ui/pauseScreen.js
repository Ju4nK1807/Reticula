// Pausa: mismo lenguaje que la pantalla de título (menú de texto a la izquierda) y el ajuste rápido
// de sensibilidad a la derecha.
import './menu.css';
import { h } from './dom.js';
import { menuList } from './menuList.js';
import { sensitivityPanel } from './settingsScreen.js';

export function pauseScreen(game, { onResume, onRestart, onSettings, onQuit }) {
  const touch = !!game.touchMode;
  const items = [
    { id: 'resume', label: 'Continuar', onSelect: onResume },
    { id: 'restart', label: 'Reiniciar fase', onSelect: onRestart },
    { id: 'settings', label: 'Configuración', onSelect: onSettings },
    { id: 'quit', label: 'Salir al menú', tone: 'quiet', onSelect: onQuit },
  ];
  const title = game.mode?.title ?? null;
  return h(
    'div',
    { class: 'screen pause-screen' },
    h(
      'section',
      { class: 'ps-main' },
      h('div', { class: 'eyebrow' }, title ?? 'Partida'),
      h('h2', { class: 'ps-title' }, 'Pausa'),
      menuList(items, { sfx: game.sfx, initial: 'resume' }),
      h('p', { class: 'muted small ps-hint' }, touch ? 'Toca Continuar para volver a la partida.' : 'Continuar vuelve a capturar el mouse.'),
    ),
    h(
      'section',
      { class: 'panel ps-side' },
      h('h3', {}, 'Ajuste rápido de sensibilidad'),
      sensitivityPanel(game, { compact: true }),
      !touch && h('p', { class: 'muted small' }, 'En juego también puedes usar [ y ] para bajarla o subirla un 3 %.'),
    ),
  );
}
