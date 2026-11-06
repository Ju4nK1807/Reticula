// Efectos de sonido con Web Audio API. Los disparos son grabaciones reales (CC0, "The Free Firearm
// Sound Library", ver public/sounds/credits.json) que se cargan al iniciar el audio; mientras llegan,
// o si fallan, suenan los disparos procedurales de siempre. El resto de sonidos son procedurales.
// `pan` (-1 izquierda … 1 derecha) ubica los sonidos de los enemigos en estéreo.

const SAMPLE_BASE = `${import.meta.env?.BASE_URL ?? './'}sounds/`;
// Volumen de cada grabación (igualan la sensación de potencia entre armas).
const SAMPLES = { pistol: 0.55, smg: 0.5, rifle: 0.72, shotgun: 0.62, sniper: 0.8, enemy: 0.32 };
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
      this.loadSamples();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  // Descarga y decodifica las grabaciones (son pequeñas: ~90 kB en total).
  loadSamples() {
    this.samples = {};
    for (const name of Object.keys(SAMPLES)) {
      fetch(`${SAMPLE_BASE}${name}.mp3`)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.status))))
        .then((data) => this.ctx.decodeAudioData(data))
        .then((buffer) => {
          this.samples[name] = buffer;
        })
        .catch(() => {}); // sin la grabación se usa el sonido procedural
    }
  }

  // Reproduce una grabación con una pequeña variación de tono (dos disparos nunca suenan idénticos).
  playSample(name, { gain = SAMPLES[name] ?? 0.5, pan = 0, rate = 1 } = {}) {
    const buffer = this.samples?.[name];
    if (!this.ctx || !buffer) return false;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = rate * (0.96 + Math.random() * 0.08);
    const g = this.ctx.createGain();
    g.gain.value = gain;
    src.connect(g);
    g.connect(this.output(pan));
    src.start();
    return true;
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

  // Disparo del jugador según el arma (perfil de combat/weapons.js).
  shot(profile = 'rifle') {
    if (this.playSample(profile)) {
      // Detalle mecánico sobre la grabación: corredera de la escopeta y cerrojo del francotirador.
      if (profile === 'shotgun') this.noiseBurst({ f0: 1400, f1: 900, q: 2, peak: 0.12, decay: 0.05, delay: 0.32 });
      if (profile === 'sniper') this.noiseBurst({ f0: 2600, f1: 1600, q: 3, peak: 0.1, decay: 0.04, delay: 0.62 });
      return;
    }
    if (!this.ctx) return;
    switch (profile) {
      case 'pistol':
        this.noiseBurst({ f0: 3200, f1: 800, peak: 0.36, decay: 0.07 });
        this.tone('sine', 230, 70, 0.06, 0.28);
        break;
      case 'smg':
        this.noiseBurst({ f0: 2800, f1: 700, peak: 0.3, decay: 0.055 });
        this.tone('sine', 190, 60, 0.05, 0.22);
        break;
      case 'shotgun':
        this.noiseBurst({ type: 'lowpass', f0: 2200, f1: 180, q: 0.5, peak: 0.6, decay: 0.26 });
        this.tone('sine', 95, 38, 0.22, 0.5);
        this.noiseBurst({ f0: 1400, f1: 900, q: 2, peak: 0.12, decay: 0.05, delay: 0.32 }); // corredera
        break;
      case 'sniper':
        this.noiseBurst({ f0: 3600, f1: 300, peak: 0.55, decay: 0.3 });
        this.tone('sine', 140, 32, 0.36, 0.5);
        this.noiseBurst({ type: 'lowpass', f0: 900, f1: 150, q: 0.4, peak: 0.12, decay: 0.45, delay: 0.16 }); // eco
        this.noiseBurst({ f0: 2600, f1: 1600, q: 3, peak: 0.1, decay: 0.04, delay: 0.62 }); // cerrojo
        break;
      default:
        this.noiseBurst({ f0: 2400, f1: 500, peak: 0.42, decay: 0.09 });
        this.tone('sine', 170, 50, 0.08, 0.32);
    }
  }

  // Sacar el arma.
  draw() {
    this.noiseBurst({ f0: 2200, f1: 1200, q: 2.5, peak: 0.1, decay: 0.05 });
    this.tone('square', 520, 380, 0.03, 0.04, 0.05);
  }

  botShot(pan = 0) {
    if (this.playSample('enemy', { pan })) return;
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

  // Golpe cuerpo a cuerpo: silbido del arma al cortar el aire y golpe sordo si acierta.
  swing() {
    this.noiseBurst({ type: 'highpass', f0: 700, f1: 2600, q: 0.7, peak: 0.14, decay: 0.14 });
  }

  meleeHit() {
    this.tone('sine', 150, 55, 0.14, 0.42);
    this.noiseBurst({ type: 'lowpass', f0: 1200, f1: 200, q: 0.6, peak: 0.32, decay: 0.09 });
  }

  // Granada: explosión grave con cola larga (y más lejos, más apagada).
  explosion(distance = 0, pan = 0) {
    const k = Math.max(0.25, 1 - distance / 60);
    this.tone('sine', 90, 28, 0.9, 0.85 * k, 0, pan);
    this.noiseBurst({ type: 'lowpass', f0: 2600, f1: 120, q: 0.4, peak: 0.75 * k, decay: 0.85, pan });
    this.noiseBurst({ type: 'bandpass', f0: 900, f1: 300, q: 0.8, peak: 0.25 * k, decay: 1.4, delay: 0.08, pan });
  }

  // Granada que rebota en el suelo.
  bounce(pan = 0) {
    this.noiseBurst({ type: 'bandpass', f0: 1700, f1: 900, q: 3, peak: 0.08, decay: 0.05, pan });
  }

  // Lanzar la granada (quitar la anilla + lanzamiento).
  throwGrenade() {
    this.tone('square', 2400, 2100, 0.03, 0.04);
    this.noiseBurst({ type: 'highpass', f0: 500, f1: 1800, q: 0.7, peak: 0.1, decay: 0.16, delay: 0.06 });
  }

  // Sonidos de la interfaz: muy cortos y bajos para que navegar el menú no canse.
  uiMove() {
    this.tone('sine', 2100, 1700, 0.03, 0.025);
  }

  uiSelect() {
    this.tone('triangle', 520, 880, 0.08, 0.06);
    this.tone('sine', 1760, 1760, 0.06, 0.02, 0.025);
  }

  uiBack() {
    this.tone('triangle', 640, 380, 0.08, 0.05);
  }

  complete() {
    [660, 880, 1320].forEach((f, i) => this.tone('triangle', f, f, 0.12, 0.15, i * 0.08));
  }
}
