import { registerWorld } from '../../scenes/registry.js';
import { DomeMap } from './DomeMap.js';

// Coordinación ojo-mano: secuencias, color objetivo, visión periférica y doble tarea.
registerWorld('dome', () => new DomeMap());
