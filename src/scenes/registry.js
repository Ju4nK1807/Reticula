import { ShootingRange } from './ShootingRange.js';
import { TrainingYard } from './TrainingYard.js';

// Registro de mapas. Cada modo registra los suyos (en su index.js) con registerWorld y luego los
// usa con game.useWorld(key); así un mapa nuevo no obliga a editar Game.js.
// Los mapas se construyen la primera vez que se usan y Game los reutiliza.
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

// Mapas base: el campo de tiro también es el fondo del menú.
registerWorld('range', () => new ShootingRange());
registerWorld('yard', () => new TrainingYard());
