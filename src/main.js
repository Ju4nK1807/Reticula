// Fuentes empaquetadas con la app (sin depender de internet: funcionan en .exe y APK sin conexión).
import '@fontsource/chakra-petch/latin-600.css';
import '@fontsource/chakra-petch/latin-700.css';
import '@fontsource-variable/inter/wght.css';
import '@fontsource-variable/jetbrains-mono/wght.css';
import './style.css';
import { Game } from './core/Game.js';
import { checkSupport, fatalScreen, supportNotice, supportWarnings } from './ui/supportScreen.js';

const root = document.getElementById('app');
const support = checkSupport();

if (!support.webgl) {
  fatalScreen(root, {
    title: 'WebGL no disponible',
    message:
      'Retícula necesita WebGL 2 para dibujar en 3D. Actualiza tu navegador (Chrome, Edge o Firefox), activa la aceleración por hardware en su configuración y actualiza los drivers de la tarjeta gráfica.',
  });
} else {
  try {
    const game = new Game(root);
    game.start();
    // Útil para depurar desde la consola del navegador.
    window.reticula = game;
    const warnings = supportWarnings(support);
    if (warnings.length) root.append(supportNotice(warnings));
  } catch (err) {
    console.error(err);
    fatalScreen(root, {
      title: 'No se pudo iniciar Retícula',
      message: 'Ocurrió un error al preparar el juego. Recarga la página; si se repite, prueba con otro navegador.',
      detail: err?.message ?? String(err),
    });
  }
}
