import { registerWorld } from '../../scenes/registry.js';
import { registerMode, requiresRank } from '../registry.js';
import { BastionMap } from './BastionMap.js';
import { Endless, MODE_ID, WORLD_ID } from './Endless.js';

registerWorld(WORLD_ID, () => new BastionMap());

registerMode({
  id: MODE_ID,
  title: 'Modo infinito',
  desc: 'Oleadas sin fin en el Bastión: enemigos por las 8 puertas, cada vez más rápidos y pequeños',
  order: 50,
  locked: requiresRank,
  create: (game) => new Endless(game),
});
