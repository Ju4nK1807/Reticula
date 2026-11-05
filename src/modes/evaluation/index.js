import { registerMode } from '../registry.js';
import { Evaluation } from './Evaluation.js';

registerMode({
  id: 'evaluation-targets',
  title: 'Evaluación · Dianas',
  desc: 'Clásica: flicking, tracking, reacción, multi-objetivo y precisión',
  order: 10,
  primary: true,
  create: (game) => new Evaluation(game, 'targets'),
});

registerMode({
  id: 'evaluation-bots',
  title: 'Evaluación · Enemigos',
  desc: 'Bots reales: flicks, tracking, peeks, headshots y combate en movimiento',
  order: 20,
  primary: true,
  create: (game) => new Evaluation(game, 'bots'),
});
