/*
  Caja fuerte del modo zombi (reemplaza a la caja misteriosa): está cerrada con un código de
  SAFE.digits cifras, distinto en cada partida. El código lo lleva el Jefe (zombieData.ZOMBIE_TYPES.boss):
  al matarlo se revela en el HUD. Con el código puesto en el teclado, la caja queda abierta el resto de la
  partida y cada uso cuesta zombieData.BOX_PRICE por un arma al azar (zombieData.rollBox).

  Lógica pura (sin Three.js ni DOM): ver tests/safe.test.js.
*/

export const SAFE = {
  digits: 4,
  lockout: 3, // s bloqueado el teclado tras un código equivocado
};

/** Código nuevo: SAFE.digits cifras (puede empezar en 0). */
export function makeSafeCode(rng = Math.random) {
  let code = '';
  for (let i = 0; i < SAFE.digits; i++) code += Math.min(9, Math.floor(rng() * 10));
  return code;
}

export class SafeLock {
  constructor(code = makeSafeCode()) {
    this.code = String(code);
    this.known = false; // el jugador ya lo tiene (mató al Jefe)
    this.unlocked = false;
    this.entry = ''; // lo que va escrito en el teclado
    this.lockT = 0; // s que le quedan al bloqueo por un código equivocado
    this.fails = 0;
  }

  /** El Jefe soltó el código. Devuelve el código. */
  reveal() {
    this.known = true;
    return this.code;
  }

  get full() {
    return this.entry.length >= SAFE.digits;
  }

  /** Escribe una cifra (no hace nada si el teclado está lleno, bloqueado o la caja ya abierta). */
  press(digit) {
    const d = String(digit);
    if (this.unlocked || this.lockT > 0 || this.full || !/^[0-9]$/.test(d)) return false;
    this.entry += d;
    return true;
  }

  /** Borra la última cifra. */
  back() {
    if (this.lockT > 0) return false;
    this.entry = this.entry.slice(0, -1);
    return true;
  }

  clear() {
    this.entry = '';
  }

  /**
   * Prueba lo escrito: 'open' (correcto: la caja queda abierta), 'wrong' (se bloquea SAFE.lockout s y se
   * borra), 'short' (faltan cifras), 'locked' (bloqueada por un error reciente) o 'already' (ya abierta).
   */
  submit() {
    if (this.unlocked) return 'already';
    if (this.lockT > 0) return 'locked';
    if (!this.full) return 'short';
    if (this.entry === this.code) {
      this.unlocked = true;
      this.entry = '';
      return 'open';
    }
    this.fails++;
    this.entry = '';
    this.lockT = SAFE.lockout;
    return 'wrong';
  }

  update(dt) {
    if (this.lockT > 0) this.lockT = Math.max(0, this.lockT - dt);
  }
}
