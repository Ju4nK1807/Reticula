import { registerWorld } from '../../scenes/registry.js';
import { registerMode } from '../registry.js';
import { DomeMap } from './DomeMap.js';
import { Coordination, MODE_ID, WORLD_ID } from './Coordination.js';

// Coordinación ojo-mano: secuencias, color objetivo, visión periférica y doble tarea.
registerWorld(WORLD_ID, () => new DomeMap());

registerMode({
  id: MODE_ID,
  title: 'Coordinación ojo-mano',
  desc: 'Secuencias, color objetivo, visión periférica y doble tarea · ejercicios sueltos o en circuito',
  order: 40,
  create: (game) => new Coordination(game),
});
