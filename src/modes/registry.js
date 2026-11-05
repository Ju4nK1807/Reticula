// Registro de modos del menú principal. Cada carpeta de modo tiene un index.js que llama a
// registerMode; modes/index.js los descubre solos, así que un modo nuevo no toca Game.js ni el menú.
//
// entry = {
//   id: string único,
//   title, desc: textos del menú,
//   order: posición en el menú (menor = más arriba),
//   primary: botón destacado (opcional),
//   locked(game): motivo (texto) si todavía no se puede jugar, o null (opcional),
//   create(game): devuelve una instancia del modo (ver modes/Mode.js),
// }
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

// Motivo de bloqueo estándar para los modos que dependen del rango de la evaluación.
export function requiresRank(game) {
  return game.store.data.profile.rank ? null : 'Requiere evaluación';
}

// Modos planeados que aún no existen: el menú los muestra desactivados hasta que su carpeta
// registre un modo con el mismo id (entonces este marcador desaparece solo).
export const PLANNED_MODES = [
  { id: 'campaign', title: 'Campaña', desc: 'Mapas y bots según tu rango', order: 30, needsRank: true },
  { id: 'coordination', title: 'Coordinación ojo-mano', desc: 'Secuencias, colores, periferia, doble tarea', order: 40 },
  { id: 'endless', title: 'Modo infinito', desc: 'Oleadas sin fin hasta caer', order: 50, needsRank: true },
];
