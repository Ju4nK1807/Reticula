import { h } from './dom.js';
import { button } from './components.js';
import { sensitivityPanel } from './settingsScreen.js';

export function pauseScreen(game, { onResume, onRestart, onSettings, onQuit }) {
  return h(
    'div',
    { class: 'screen narrow' },
    h(
      'div',
      { class: 'panel pause' },
      h('h2', {}, 'Pausa'),
      h('p', { class: 'muted' }, 'Haz clic en Continuar para volver a capturar el mouse.'),
      h(
        'div',
        { class: 'stack' },
        button('Continuar', onResume, { variant: 'primary' }),
        button('Reiniciar fase', onRestart),
        button('Configuración completa', onSettings),
        button('Salir al menú', onQuit, { variant: 'ghost' }),
      ),
      h('h3', {}, 'Ajuste rápido de sensibilidad'),
      sensitivityPanel(game, { compact: true }),
      h('p', { class: 'muted small' }, 'En juego también puedes usar [ y ] para bajarla o subirla un 3 %.'),
    ),
  );
}
