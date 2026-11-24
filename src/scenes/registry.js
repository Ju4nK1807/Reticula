import { ShootingRange } from './ShootingRange.js';
import { TrainingYard } from './TrainingYard.js';
import { ArmoryMenu } from './ArmoryMenu.js';

const factories = new Map();

export function registerWorld(key, factory) {
  if (typeof factory !== 'function') throw new TypeError(`registerWorld("${key}"): falta la función que crea el mapa`);
  if (factories.has(key)) throw new Error(`Ya existe un mapa registrado como "${key}"`);
  factories.set(key, factory);
}

export function hasWorld(key) {
  return factories.has(key);
}

export function createWorld(key) {
  const factory = factories.get(key);
  if (!factory) throw new Error(`Mapa desconocido: "${key}". Regístralo con registerWorld.`);
  return factory();
}

registerWorld('range', () => new ShootingRange());
registerWorld('yard', () => new TrainingYard());
registerWorld('armory', () => new ArmoryMenu());
