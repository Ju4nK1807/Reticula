import { Emitter } from './Emitter.js';

// Pointer Lock, mouse y teclado. Eventos: 'lock', 'unlock', 'lockerror', 'shoot', 'key'.
export class Input extends Emitter {
  constructor(lockTarget) {
    super();
    this.lockTarget = lockTarget;
    this.locked = false;
    this.mouseDown = false;
    this.rawInput = null; // true si el navegador aceptó unadjustedMovement
    this.keys = new Set();
    this.dx = 0;
    this.dy = 0;

    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === this.lockTarget;
      if (locked === this.locked) return;
      this.locked = locked;
      this.dx = this.dy = 0;
      if (!locked) this.releaseAll();
      this.emit(locked ? 'lock' : 'unlock');
    });
    document.addEventListener('pointerlockerror', () => this.emit('lockerror'));

    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.dx += e.movementX;
      this.dy += e.movementY;
    });
    document.addEventListener('mousedown', (e) => {
      if (!this.locked || e.button !== 0) return;
      this.mouseDown = true;
      this.emit('shoot');
    });
    document.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDown = false;
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
    this.keys.clear();
  }

  isDown(code) {
    return this.keys.has(code);
  }

  // Debe llamarse desde un gesto del usuario (clic).
  async lock() {
    if (this.locked) return true;
    try {
      // Raw input: sin aceleración del sistema operativo (Chrome/Edge).
      await this.lockTarget.requestPointerLock({ unadjustedMovement: true });
      this.rawInput = true;
      return true;
    } catch {
      try {
        await this.lockTarget.requestPointerLock();
        this.rawInput = false;
        return true;
      } catch {
        this.emit('lockerror');
        return false;
      }
    }
  }

  unlock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  consumeMouse() {
    const delta = { dx: this.dx, dy: this.dy };
    this.dx = this.dy = 0;
    return delta;
  }
}
