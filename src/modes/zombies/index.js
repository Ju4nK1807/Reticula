import { registerWorld } from '../../scenes/registry.js';
import { registerMode } from '../registry.js';
import { ZombieMap } from './ZombieMap.js';
import { DEFENSE_ID, MODE_ID, WORLD_ID, Zombies } from './Zombies.js';

registerWorld(WORLD_ID, () => new ZombieMap());

registerMode({
  id: MODE_ID,
  title: 'Modo zombi',
  desc: 'Sobrevive a la horda en el Barrio en ruinas: compra armas entre rondas, usa granadas y potenciadores',
  order: 60,
  create: (game) => new Zombies(game),
});

registerMode({
  id: DEFENSE_ID,
  title: 'Defensa de la barra',
  desc: 'Protege la barra del centro de la plaza: los zombis van por las botellas de licor antes que por ti',
  order: 61,
  create: (game) => new Zombies(game, { variant: 'defense' }),
});
