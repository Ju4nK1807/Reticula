import { h } from './dom.js';
import { LOGO_SVG } from './components.js';

// Comprobación de compatibilidad antes de arrancar el motor.
// - webgl: Three.js (r163+) necesita WebGL 2; sin él no hay juego.
// - pointerLock: sin él no se puede apuntar (Safari en iOS, algunos navegadores embebidos).
// - finePointer: hay un mouse o trackpad; en pantallas táctiles el juego no es jugable.
export function checkSupport() {
  let webgl = false;
  try {
    const canvas = document.createElement('canvas');
    webgl = !!canvas.getContext('webgl2');
  } catch {
    webgl = false;
  }
  const pointerLock = 'requestPointerLock' in Element.prototype;
  const finePointer = window.matchMedia?.('(any-pointer: fine)').matches ?? true;
  return { webgl, pointerLock, finePointer };
}

// Avisos no bloqueantes según el resultado de checkSupport().
export function supportWarnings({ pointerLock, finePointer }) {
  const out = [];
  if (!pointerLock) out.push('Tu navegador no permite capturar el mouse (Pointer Lock). Usa Chrome, Edge o Firefox en un computador.');
  else if (!finePointer) out.push('No se detectó mouse. Retícula se juega con mouse y teclado; en pantallas táctiles no funciona.');
  return out;
}

// Pantalla de error cuando el juego no puede arrancar.
export function fatalScreen(root, { title, message, detail = null }) {
  root.replaceChildren(
    h(
      'div',
      { class: 'fatal' },
      h(
        'div',
        { class: 'panel fatal-panel' },
        h('div', { class: 'logo', html: LOGO_SVG }),
        h('h2', {}, title),
        h('p', {}, message),
        detail && h('pre', { class: 'fatal-detail' }, detail),
        h('button', { class: 'btn primary', onclick: () => location.reload() }, 'Reintentar'),
      ),
    ),
  );
}

// Aviso persistente (se puede cerrar) para problemas que no impiden abrir el juego.
export function supportNotice(messages) {
  const el = h(
    'div',
    { class: 'support-notice', role: 'alert' },
    h('div', {}, messages.map((m) => h('p', {}, m))),
    h('button', { class: 'btn ghost', onclick: () => el.remove(), 'aria-label': 'Cerrar aviso' }, 'Entendido'),
  );
  return el;
}
