const modes = new Map();

export function registerMode(entry) {
  const { id, title, create } = entry ?? {};
  if (!id || !title || typeof create !== 'function') {
    throw new TypeError('registerMode: se necesitan id, title y create(game)');
  }
  if (modes.has(id)) throw new Error(`Ya existe un modo registrado como "${id}"`);
  modes.set(id, { order: 100, primary: false, desc: '', locked: null, ...entry });
}

export function getMode(id) {
  return modes.get(id) ?? null;
}

export function listModes() {
  return [...modes.values()].sort((a, b) => a.order - b.order);
}

export function requiresRank(game) {
  return game.store.data.profile.rank ? null : 'Requiere evaluación';
}

export const PLANNED_MODES = [
  { id: 'campaign', title: 'Campaña', desc: 'Mapas y bots según tu rango', order: 30, needsRank: true },
  { id: 'coordination', title: 'Coordinación ojo-mano', desc: 'Secuencias, colores, periferia, doble tarea', order: 40 },
  { id: 'endless', title: 'Modo infinito', desc: 'Oleadas sin fin hasta caer', order: 50, needsRank: true },
];
