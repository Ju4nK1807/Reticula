import { Emitter } from './Emitter.js';
import { DEFAULT_KEYS } from '../config/keybinds.js';

const LOCK_ERROR_THROTTLE = 400;

function detectRawInput() {
  const brands = navigator.userAgentData?.brands;
  if (brands) return brands.some((b) => b.brand === 'Chromium');
  return /Chrome\/\d+/.test(navigator.userAgent) && !/Firefox\//.test(navigator.userAgent);
}

export class Input extends Emitter {
  constructor(lockTarget) {
    super();
    this.lockTarget = lockTarget;
    this.locked = false;
    this.mouseDown = false;
    this.aimDown = false;
    this.touch = false;
    this.axis = { x: 0, y: 0 };
    this.rawInputSupported = detectRawInput();
    this.rawInput = null;
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
    let wheelAcc = 0;
    document.addEventListener(
      'wheel',
      (e) => {
        if (!this.locked) return;
        wheelAcc += e.deltaY;
        if (Math.abs(wheelAcc) < 40) return;
        this.emit('wheel', Math.sign(wheelAcc));
        wheelAcc = 0;
      },
      { passive: true },
    );
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

  isAction(id) {
    return this.keys.has(this.bindings?.[id] ?? DEFAULT_KEYS[id]);
  }

  codeFor(id) {
    return this.bindings?.[id] ?? DEFAULT_KEYS[id];
  }

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
      if (raw && err?.name === 'NotSupportedError') {
        try {
          await this.requestLock(false);
          this.rawInput = false;
          return true;
        } catch {
        }
      }
      this.lockError();
      return false;
    }
  }

  requestLock(raw) {
    return this.lockTarget.requestPointerLock(raw ? { unadjustedMovement: true } : undefined);
  }

  lockError() {
    const now = performance.now();
    if (now - this.lastLockError < LOCK_ERROR_THROTTLE) return;
    this.lastLockError = now;
    this.emit('lockerror');
  }

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
