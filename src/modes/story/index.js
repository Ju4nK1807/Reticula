import { registerMode } from '../registry.js';
import { MODE_ID, StoryMode } from './StoryMode.js';

// Historia «ECO»: campaña con trama (8 capítulos). Usa los mapas de los otros modos
// (campo de tiro, patio, bodega, ciudad, barrio en ruinas, cúpula y arena), que ellos registran.
registerMode({
  id: MODE_ID,
  title: 'Historia: ECO',
  desc: 'Campaña con historia: 1983, una estación de números y un soldado que no recuerda por qué la entiende. 8 capítulos',
  order: 25,
  create: (game) => new StoryMode(game),
});
