import { Emitter } from './Emitter.js';

const LOCK_ERROR_THROTTLE = 400; // ms: un fallo de captura dispara varios eventos a la vez

// Solo Chromium (Chrome, Edge, Opera, Brave) aplica `unadjustedMovement`. Firefox y Safari aceptan
// la llamada pero ignoran la opción, así que no se puede detectar por error: se detecta el motor.
// userAgentData solo existe en contextos seguros; la cadena UA cubre el resto (p. ej. http en LAN).
function detectRawInput() {
  const brands = navigator.userAgentData?.brands;
  if (brands) return brands.some((b) => b.brand === 'Chromium');
  return /Chrome\/\d+/.test(navigator.userAgent) && !/Firefox\//.test(navigator.userAgent);
}

// Pointer Lock, mouse y teclado. Eventos: 'lock', 'unlock', 'lockerror', 'shoot' (timeStamp), 'key'.
export class Input extends Emitter {
  constructor(lockTarget) {
    super();
    this.lockTarget = lockTarget;
    this.locked = false;
    this.mouseDown = false;
    this.aimDown = false; // clic derecho mantenido (apuntar con mira telescópica)
    // Modo táctil: no hay Pointer Lock; "capturar" es solo entrar en partida y los controles
    // táctiles (core/TouchControls.js) aportan el movimiento analógico y la mirada.
    this.touch = false;
    this.axis = { x: 0, y: 0 }; // joystick: x derecha, y adelante (-1…1)
    this.rawInputSupported = detectRawInput();
    this.rawInput = null; // tras la primera captura: true si se usa raw input (sin aceleración del SO)
    this.lastLockError = -Infinity;
    this.keys = new Set();
    this.dx = 0;
    this.dy = 0;

    document.addEventListener('pointerlockchange', () => {
      if (this.touch) return;
      const locked = document.pointerLockElement === this.lockTarget;
      if (locked === this.locked) return;
      this.locked = locked;
      this.dx = this.dy = 0;
      if (!locked) this.releaseAll();
      this.emit(locked ? 'lock' : 'unlock');
    });
    document.addEventListener('pointerlockerror', () => this.lockError());

    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.dx += e.movementX;
      this.dy += e.movementY;
    });
    document.addEventListener('mousedown', (e) => {
      if (this.locked && e.button === 2) this.aimDown = true;
      if (!this.locked || e.button !== 0) return;
      this.mouseDown = true;
      // timeStamp comparte origen con performance.now(): sirve para medir reacción sin
      // depender de los FPS.
      this.emit('shoot', e.timeStamp);
    });
    document.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDown = false;
      if (e.button === 2) this.aimDown = false;
    });
    document.addEventListener('keydown', (e) => {
      if (this.locked) {
        this.keys.add(e.code);
        if (e.code === 'Space' || e.code === 'Tab') e.preventDefault();
      }
      this.emit('key', e);
    });
    document.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.releaseAll());
    lockTarget.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  releaseAll() {
    this.mouseDown = false;
    this.aimDown = false;
    this.axis.x = this.axis.y = 0;
    this.keys.clear();
  }

  isDown(code) {
    return this.keys.has(code);
  }

  // Debe llamarse desde un gesto del usuario (clic). Devuelve true si la petición se aceptó
  // (en Safari la confirmación llega después por 'pointerlockchange' o 'pointerlockerror').
  async lock() {
    if (this.locked) return true;
    if (this.touch) {
      this.setTouchLocked(true);
      return true;
    }
    const raw = this.rawInputSupported;
    try {
      await this.requestLock(raw);
      this.rawInput = raw;
      return true;
    } catch (err) {
      // Algunos sistemas (p. ej. Chromium en Linux) no admiten unadjustedMovement: se reintenta sin él.
      // Otros errores (como el bloqueo de ~1 s tras salir con Esc) no se reintentan.
      if (raw && err?.name === 'NotSupportedError') {
        try {
          await this.requestLock(false);
          this.rawInput = false;
          return true;
        } catch {
          // cae al aviso de abajo
        }
      }
      this.lockError();
      return false;
    }
  }

  requestLock(raw) {
    return this.lockTarget.requestPointerLock(raw ? { unadjustedMovement: true } : undefined);
  }

  // Un solo aviso por intento fallido, aunque lleguen el rechazo de la promesa y el evento del documento.
  lockError() {
    const now = performance.now();
    if (now - this.lastLockError < LOCK_ERROR_THROTTLE) return;
    this.lastLockError = now;
    this.emit('lockerror');
  }

  // Equivalente táctil de capturar / soltar el puntero.
  setTouchLocked(locked) {
    if (locked === this.locked) return;
    this.locked = locked;
    this.dx = this.dy = 0;
    if (!locked) this.releaseAll();
    this.emit(locked ? 'lock' : 'unlock');
  }

  unlock() {
    if (this.touch) {
      this.setTouchLocked(false);
      return;
    }
    if (document.pointerLockElement) document.exitPointerLock();
  }

  consumeMouse() {
    const delta = { dx: this.dx, dy: this.dy };
    this.dx = this.dy = 0;
    return delta;
  }
}
