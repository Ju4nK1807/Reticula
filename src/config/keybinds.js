export const ACTIONS = [
  { id: 'forward', group: 'Movimiento', label: 'Avanzar', key: 'KeyW' },
  { id: 'back', group: 'Movimiento', label: 'Retroceder', key: 'KeyS' },
  { id: 'left', group: 'Movimiento', label: 'Izquierda', key: 'KeyA' },
  { id: 'right', group: 'Movimiento', label: 'Derecha', key: 'KeyD' },
  { id: 'sprint', group: 'Movimiento', label: 'Correr (sprint, mantener)', key: 'ShiftLeft' },
  { id: 'walk', group: 'Movimiento', label: 'Caminar (más preciso)', key: 'KeyZ' },
  { id: 'crouch', group: 'Movimiento', label: 'Agacharse', key: 'KeyC' },
  { id: 'jump', group: 'Movimiento', label: 'Saltar', key: 'Space' },
  { id: 'reload', group: 'Combate', label: 'Recargar', key: 'KeyR' },
  { id: 'melee', group: 'Combate', label: 'Cuchillo', key: 'KeyV' },
  { id: 'grenade', group: 'Combate', label: 'Lanzar granada', key: 'KeyG' },
  { id: 'grenadeNext', group: 'Combate', label: 'Cambiar de granada', key: 'KeyQ' },
  { id: 'fireMode', group: 'Combate', label: 'Modo de disparo', key: 'KeyB' },
  { id: 'interact', group: 'Combate', label: 'Usar / comprar (modo zombi)', key: 'KeyE' },
  { id: 'flashlight', group: 'Combate', label: 'Linterna (modo zombi)', key: 'KeyF' },
  { id: 'sensDown', group: 'Otros', label: 'Bajar sensibilidad 3 %', key: 'BracketLeft' },
  { id: 'sensUp', group: 'Otros', label: 'Subir sensibilidad 3 %', key: 'BracketRight' },
  { id: 'restart', group: 'Otros', label: 'Reiniciar la fase', key: 'Backspace' },
];

export const DEFAULT_KEYS = Object.fromEntries(ACTIONS.map((a) => [a.id, a.key]));

export const isReservedCode = (code) => code === 'Escape' || /^Digit[1-9]$/.test(code) || /^Numpad[1-9]$/.test(code);

export function actionFor(keys, code) {
  for (const a of ACTIONS) if ((keys?.[a.id] ?? a.key) === code) return a.id;
  return null;
}

const NAMES = {
  Space: 'Espacio',
  ShiftLeft: 'Shift',
  ShiftRight: 'Shift der.',
  ControlLeft: 'Ctrl',
  ControlRight: 'Ctrl der.',
  AltLeft: 'Alt',
  AltRight: 'Alt Gr',
  MetaLeft: 'Win',
  Tab: 'Tab',
  CapsLock: 'Bloq Mayús',
  Backspace: 'Retroceso',
  Enter: 'Enter',
  BracketLeft: '[',
  BracketRight: ']',
  Semicolon: 'Ñ',
  Quote: '´',
  Backquote: 'º',
  Backslash: 'ç',
  Comma: ',',
  Period: '.',
  Slash: '-',
  Minus: "'",
  Equal: '¡',
  IntlBackslash: '<',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Insert: 'Insert',
  Delete: 'Supr',
  Home: 'Inicio',
  End: 'Fin',
  PageUp: 'RePág',
  PageDown: 'AvPág',
};

export function codeLabel(code) {
  if (!code) return '—';
  if (NAMES[code]) return NAMES[code];
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^Numpad/.test(code)) return `Num ${code.slice(6)}`;
  if (/^F\d+$/.test(code)) return code;
  return code;
}

export const keyLabel = (keys, id) => codeLabel(keys?.[id] ?? DEFAULT_KEYS[id]);

export function rebind(keys, id, code) {
  if (isReservedCode(code)) throw new Error('Tecla reservada');
  const old = keys[id] ?? DEFAULT_KEYS[id];
  const other = actionFor(keys, code);
  keys[id] = code;
  if (other && other !== id) {
    keys[other] = old;
    return other;
  }
  return null;
}

export function normalizeKeys(keys = {}) {
  const out = { ...DEFAULT_KEYS };
  const used = new Set();
  for (const a of ACTIONS) {
    const code = keys[a.id];
    if (typeof code === 'string' && code && !isReservedCode(code) && !used.has(code)) out[a.id] = code;
  }
  used.clear();
  for (const a of ACTIONS) {
    if (used.has(out[a.id])) out[a.id] = a.key;
    used.add(out[a.id]);
  }
  return out;
}
