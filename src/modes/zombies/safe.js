export const SAFE = {
  digits: 4,
  lockout: 3,
};

export function makeSafeCode(rng = Math.random) {
  let code = '';
  for (let i = 0; i < SAFE.digits; i++) code += Math.min(9, Math.floor(rng() * 10));
  return code;
}

export class SafeLock {
  constructor(code = makeSafeCode()) {
    this.code = String(code);
    this.known = false;
    this.unlocked = false;
    this.entry = '';
    this.lockT = 0;
    this.fails = 0;
  }

  reveal() {
    this.known = true;
    return this.code;
  }

  get full() {
    return this.entry.length >= SAFE.digits;
  }

  press(digit) {
    const d = String(digit);
    if (this.unlocked || this.lockT > 0 || this.full || !/^[0-9]$/.test(d)) return false;
    this.entry += d;
    return true;
  }

  back() {
    if (this.lockT > 0) return false;
    this.entry = this.entry.slice(0, -1);
    return true;
  }

  clear() {
    this.entry = '';
  }

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
