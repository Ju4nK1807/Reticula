import './style.css';
import { Game } from './core/Game.js';

const game = new Game(document.getElementById('app'));
game.start();

// Útil para depurar desde la consola del navegador.
window.reticula = game;
