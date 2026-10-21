// Efectos de sonido procedurales con Web Audio API (sin archivos externos).
// `pan` (-1 izquierda … 1 derecha) ubica los sonidos de los enemigos en estéreo.
export class Sfx {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noise = null;
    this.volume = 0.6;
  }

  // El AudioContext solo puede arrancar tras un gesto del usuario.
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
      this.noise = this.createNoiseBuffer(0.5);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  createNoiseBuffer(seconds) {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  output(pan = 0) {
    if (!pan || !this.ctx.createStereoPanner) return this.master;
    const p = this.ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    p.connect(this.master);
    return p;
  }

  // Envolvente percusiva: ataque corto y caída exponencial.
  envelope(peak, attack, decay, when, pan = 0) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(peak, when + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, when + attack + decay);
    g.connect(this.output(pan));
    return g;
  }

  tone(type, f0, f1, duration, peak, delay = 0, pan = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(f1, t + duration);
    osc.connect(this.envelope(peak, 0.004, duration, t, pan));
    osc.start(t);
    osc.stop(t + duration + 0.05);
  }

  noiseBurst({ type = 'bandpass', f0, f1, q = 0.9, peak, decay, pan = 0, delay = 0 }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(f0, t);
    filter.frequency.exponentialRampToValueAtTime(f1, t + decay);
    filter.Q.value = q;
    src.connect(filter).connect(this.envelope(peak, 0.002, decay, t, pan));
    src.start(t);
    src.stop(t + decay + 0.1);
  }

  shot() {
    this.noiseBurst({ f0: 2400, f1: 500, peak: 0.42, decay: 0.09 });
    this.tone('sine', 170, 50, 0.08, 0.32);
  }

  botShot(pan = 0) {
    this.noiseBurst({ type: 'lowpass', f0: 1800, f1: 300, q: 0.5, peak: 0.22, decay: 0.12, pan });
  }

  hit() {
    this.tone('triangle', 1100, 1500, 0.06, 0.18);
  }

  headshot() {
    this.tone('sine', 2200, 2200, 0.16, 0.2);
    this.tone('triangle', 1450, 1450, 0.12, 0.12);
  }

  kill() {
    this.tone('triangle', 880, 880, 0.08, 0.12, 0.03);
    this.tone('triangle', 1320, 1320, 0.12, 0.12, 0.09);
  }

  hurt() {
    this.tone('sine', 120, 60, 0.18, 0.4);
    this.noiseBurst({ type: 'lowpass', f0: 600, f1: 150, q: 0.4, peak: 0.25, decay: 0.15 });
  }

  // Aviso de enemigo entrando (pasos/puerta), ubicado en estéreo.
  cue(pan = 0) {
    for (let i = 0; i < 3; i++) {
      this.noiseBurst({ type: 'lowpass', f0: 500, f1: 120, q: 0.6, peak: 0.35, decay: 0.06, pan, delay: i * 0.16 });
    }
  }

  dryFire() {
    this.tone('square', 2400, 1800, 0.02, 0.06);
  }

  // Sacar el cargador…
  reloadStart() {
    this.noiseBurst({ f0: 3000, f1: 1500, q: 2, peak: 0.18, decay: 0.05 });
    this.tone('square', 420, 300, 0.04, 0.05, 0.04);
  }

  // …y meter el nuevo + cerrojo.
  reloadEnd() {
    this.noiseBurst({ f0: 2600, f1: 1200, q: 2, peak: 0.2, decay: 0.05 });
    this.noiseBurst({ f0: 3500, f1: 2000, q: 3, peak: 0.22, decay: 0.04, delay: 0.09 });
  }

  tick() {
    this.tone('sine', 1500, 1500, 0.025, 0.05);
  }

  beep(high = false) {
    this.tone('sine', high ? 990 : 660, high ? 990 : 660, high ? 0.22 : 0.12, 0.18);
  }

  error() {
    this.tone('square', 180, 120, 0.16, 0.08);
  }

  complete() {
    [660, 880, 1320].forEach((f, i) => this.tone('triangle', f, f, 0.12, 0.15, i * 0.08));
  }
}
