import { registerWorld } from '../../scenes/registry.js';
import { registerMode } from '../registry.js';
import { ZombieMap } from './ZombieMap.js';
import { MODE_ID, WORLD_ID, Zombies } from './Zombies.js';

// Modo zombi: oleadas de zombis en el Barrio en ruinas, con armería, potenciadores y granadas.
registerWorld(WORLD_ID, () => new ZombieMap());

registerMode({
  id: MODE_ID,
  title: 'Modo zombi',
  desc: 'Sobrevive a la horda en el Barrio en ruinas: compra armas entre oleadas, usa granadas y potenciadores',
  order: 60,
  create: (game) => new Zombies(game),
});
