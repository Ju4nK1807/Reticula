// Efectos de sonido con Web Audio API. Los disparos son grabaciones reales (CC0, "The Free Firearm
// Sound Library", ver public/sounds/credits.json) que se cargan al iniciar el audio; mientras llegan,
// o si fallan, suenan los disparos procedurales de siempre. El resto de sonidos son procedurales.
// `pan` (-1 izquierda … 1 derecha) ubica los sonidos de los enemigos en estéreo.
//
// Mezcla: efectos (master) y música (music) → out (volumen general) → compresor → altavoces. Una
// reverberación (convolución con una respuesta generada) y un eco entre edificios (retardo filtrado)
// les dan espacio a los disparos y a las voces de los zombis.
import { VOICES } from './zombieVoices.js';

const SAMPLE_BASE = `${import.meta.env?.BASE_URL ?? './'}sounds/`;
// Volumen de cada grabación (igualan la sensación de potencia entre armas).
const SAMPLES = { pistol: 0.55, smg: 0.5, rifle: 0.72, shotgun: 0.62, sniper: 0.8, enemy: 0.32 };
// Cuerpo de cada disparo sobre la grabación: golpe grave (Hz de inicio) y potencia (también más eco).
const SHOT_BODY = { pistol: [95, 0.3], smg: [90, 0.22], rifle: [80, 0.38], shotgun: [62, 0.55], sniper: [58, 0.6] };
const MAX_VOICES = 7; // voces de zombi sonando a la vez (más se pisan y saturan)
export class Sfx {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noise = null;
    this.volume = 0.6;
    this.musicVolume = 0.5;
    this.voices = 0;
    this.space = 1; // cuánto espacio (reverb + eco): 1 normal; el modo zombi lo sube (barrio abierto)
  }

  // El AudioContext solo puede arrancar tras un gesto del usuario.
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      const ctx = this.ctx;
      // Compresor al final: muchos disparos y voces juntos no saturan.
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.knee.value = 10;
      comp.ratio.value = 5;
      comp.attack.value = 0.003;
      comp.release.value = 0.2;
      comp.connect(ctx.destination);
      this.out = ctx.createGain();
      this.out.gain.value = this.volume;
      this.out.connect(comp);
      this.master = ctx.createGain(); // efectos
      this.master.connect(this.out);
      this.music = ctx.createGain();
      this.music.gain.value = this.musicVolume;
      this.music.connect(this.out);
      this.noise = this.createNoiseBuffer(2);
      // Reverberación: cola de ~2.6 s, oscura (barrio de noche).
      this.reverb = ctx.createConvolver();
      this.reverb.buffer = this.createImpulse(2.6, 2.8);
      this.reverbIn = ctx.createGain();
      this.reverbIn.gain.value = this.space;
      const revTone = ctx.createBiquadFilter();
      revTone.type = 'lowpass';
      revTone.frequency.value = 4200;
      this.reverbIn.connect(revTone).connect(this.reverb).connect(this.master);
      // Eco de las fachadas: rebotes apagados que se van perdiendo.
      this.echoIn = ctx.createGain();
      this.echoIn.gain.value = this.space;
      const delay = ctx.createDelay(1);
      delay.delayTime.value = 0.27;
      const fb = ctx.createGain();
      fb.gain.value = 0.32;
      const echoTone = ctx.createBiquadFilter();
      echoTone.type = 'lowpass';
      echoTone.frequency.value = 1500;
      this.echoIn.connect(delay).connect(echoTone).connect(fb).connect(delay);
      const echoOut = ctx.createGain();
      echoOut.gain.value = 0.55;
      echoTone.connect(echoOut).connect(this.master);
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
  playSample(name, { gain = SAMPLES[name] ?? 0.5, pan = 0, rate = 1, wet = 0, echo = 0 } = {}) {
    const buffer = this.samples?.[name];
    if (!this.ctx || !buffer) return false;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = rate * (0.96 + Math.random() * 0.08);
    const g = this.ctx.createGain();
    g.gain.value = gain;
    src.connect(g);
    g.connect(this.output(pan, wet, echo));
    src.start();
    return true;
  }

  setVolume(v) {
    this.volume = v;
    if (this.out) this.out.gain.value = v;
  }

  setMusicVolume(v) {
    this.musicVolume = v;
    if (this.music) this.music.gain.value = v;
  }

  // Cuánto espacio (reverb y eco) tienen los sonidos: 1 normal, más en lugares abiertos y con ecos.
  setSpace(v) {
    this.space = v;
    if (this.reverbIn) {
      this.reverbIn.gain.value = v;
      this.echoIn.gain.value = v;
    }
  }

  // Respuesta al impulso para la reverberación: ruido estéreo con caída exponencial.
  createImpulse(seconds, decay) {
    const rate = this.ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const fade = rate * 0.012;
    const buffer = this.ctx.createBuffer(2, len, rate);
    for (let c = 0; c < 2; c++) {
      const d = buffer.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay) * Math.min(1, i / fade);
    }
    return buffer;
  }

  createNoiseBuffer(seconds) {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  // Salida de un sonido: en estéreo según `pan` y, con `wet`/`echo`, también a la reverb y al eco.
  output(pan = 0, wet = 0, echo = 0) {
    let node = this.master;
    if (pan && this.ctx.createStereoPanner) {
      node = this.ctx.createStereoPanner();
      node.pan.value = Math.max(-1, Math.min(1, pan));
      node.connect(this.master);
    }
    if (!wet && !echo) return node;
    const split = this.ctx.createGain();
    split.connect(node);
    if (wet && this.reverbIn) this.send(split, this.reverbIn, wet);
    if (echo && this.echoIn) this.send(split, this.echoIn, echo);
    return split;
  }

  send(from, to, amount) {
    const g = this.ctx.createGain();
    g.gain.value = amount;
    from.connect(g).connect(to);
  }

  // Envolvente percusiva: ataque corto y caída exponencial.
  envelope(peak, attack, decay, when, pan = 0, wet = 0) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), when + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, when + attack + decay);
    g.connect(this.output(pan, wet));
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

  noiseBurst({ type = 'bandpass', f0, f1, q = 0.9, peak, decay, pan = 0, delay = 0, wet = 0 }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(f0, t);
    filter.frequency.exponentialRampToValueAtTime(f1, t + decay);
    filter.Q.value = q;
    src.connect(filter).connect(this.envelope(peak, 0.002, decay, t, pan, wet));
    src.start(t, Math.random() * 1.4); // cada golpe de ruido arranca en otro punto del búfer
    src.stop(t + decay + 0.1);
  }

  // Disparo del jugador según el arma (perfil de combat/weapons.js). `rate` < 1 = más grave (revólver,
  // ametralladora), > 1 = más agudo: las armas nuevas reutilizan la grabación de su familia.
  shot(profile = 'rifle', rate = 1) {
    const [thump, power] = SHOT_BODY[profile] ?? SHOT_BODY.rifle;
    if (this.playSample(profile, { rate, gain: (SAMPLES[profile] ?? 0.5) * (rate < 1 ? 1.15 : 1), wet: 0.16 + power * 0.25, echo: 0.2 + power * 0.35 })) {
      this.shotBody(thump / Math.sqrt(rate), power * (rate < 1 ? 1.2 : 1));
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

  // Lo que la grabación sola no tiene: el golpe en el pecho (grave), el chasquido de la boca y la cola
  // del estampido que rebota en el barrio.
  shotBody(f, power) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(f, t);
    osc.frequency.exponentialRampToValueAtTime(f * 0.4, t + 0.16);
    osc.connect(this.envelope(0.5 * power, 0.003, 0.18, t));
    osc.start(t);
    osc.stop(t + 0.25);
    this.noiseBurst({ type: 'highpass', f0: 5000, f1: 2500, q: 0.7, peak: 0.12 * power, decay: 0.025 });
    this.noiseBurst({ type: 'lowpass', f0: 700, f1: 140, q: 0.5, peak: 0.1 * power, decay: 0.9, delay: 0.05, wet: 0.5 });
  }

  // Sacar el arma.
  draw() {
    this.noiseBurst({ f0: 2200, f1: 1200, q: 2.5, peak: 0.1, decay: 0.05 });
    this.tone('square', 520, 380, 0.03, 0.04, 0.05);
  }

  botShot(pan = 0) {
    if (this.playSample('enemy', { pan, wet: 0.3, echo: 0.4 })) return;
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

  // Te alcanzan: golpe sordo en el cuerpo y desgarro húmedo.
  hurt() {
    this.tone('sine', 120, 50, 0.2, 0.45);
    this.noiseBurst({ type: 'lowpass', f0: 600, f1: 150, q: 0.4, peak: 0.28, decay: 0.15 });
    this.noiseBurst({ type: 'bandpass', f0: 1800, f1: 600, q: 1.4, peak: 0.16, decay: 0.12, delay: 0.03 });
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

  // Incendiaria: vidrio que se rompe y la llamarada que prende.
  ignite(distance = 0, pan = 0) {
    const k = Math.max(0.25, 1 - distance / 50);
    this.noiseBurst({ type: 'highpass', f0: 3000, f1: 5000, q: 1.2, peak: 0.22 * k, decay: 0.09, pan });
    this.noiseBurst({ type: 'lowpass', f0: 500, f1: 1800, q: 0.5, peak: 0.5 * k, decay: 0.7, delay: 0.04, pan });
    this.noiseBurst({ type: 'bandpass', f0: 700, f1: 400, q: 0.6, peak: 0.18 * k, decay: 1.6, delay: 0.2, pan });
  }

  // Aturdidora: estallido seco y agudo con zumbido.
  stunBang(distance = 0, pan = 0) {
    const k = Math.max(0.25, 1 - distance / 50);
    this.noiseBurst({ type: 'highpass', f0: 1800, f1: 600, q: 0.6, peak: 0.7 * k, decay: 0.25, pan });
    this.tone('sine', 3200, 3000, 0.9, 0.06 * k, 0.05, pan);
  }

  // Señuelo: pitido corto.
  decoyBeep(pan = 0) {
    this.tone('square', 1320, 1320, 0.05, 0.05, 0, pan);
  }

  // Granada que rebota en el suelo.
  bounce(pan = 0) {
    this.noiseBurst({ type: 'bandpass', f0: 1700, f1: 900, q: 3, peak: 0.08, decay: 0.05, pan });
  }

  // Casquillo que rebota en el suelo: latón (tintineo agudo) o cartucho de escopeta (plástico, sordo).
  casing(pan = 0, kind = 'brass', strength = 1) {
    if (!this.ctx) return;
    const k = Math.min(1, strength);
    if (kind === 'shell') {
      this.noiseBurst({ type: 'bandpass', f0: 900, f1: 500, q: 2, peak: 0.05 * k, decay: 0.05, pan });
      return;
    }
    const f = 3000 + Math.random() * 1600;
    this.tone('sine', f, f * 0.97, 0.07, 0.035 * k, 0, pan);
    this.tone('sine', f * 1.51, f * 1.48, 0.05, 0.02 * k, 0, pan);
  }

  // Golpe de un objeto con física contra algo (o un balazo): madera, metal, plástico o lata.
  propHit(material = 'wood', pan = 0, strength = 1) {
    if (!this.ctx) return;
    const k = Math.max(0.15, Math.min(1, strength));
    const r = 0.9 + Math.random() * 0.2;
    if (material === 'metal') {
      for (const [f, p, d] of [[310, 0.12, 0.35], [520, 0.08, 0.26], [870, 0.05, 0.18]]) this.tone('triangle', f * r, f * r * 0.98, d, p * k, 0, pan);
      this.noiseBurst({ type: 'bandpass', f0: 1800 * r, f1: 700, q: 1.5, peak: 0.12 * k, decay: 0.06, pan });
    } else if (material === 'can') {
      this.tone('triangle', 1900 * r, 1700 * r, 0.09, 0.07 * k, 0, pan);
      this.noiseBurst({ type: 'highpass', f0: 2500, f1: 4000, q: 0.8, peak: 0.08 * k, decay: 0.05, pan });
    } else if (material === 'plastic') {
      this.noiseBurst({ type: 'bandpass', f0: 1100 * r, f1: 450, q: 1.2, peak: 0.14 * k, decay: 0.07, pan });
    } else {
      this.noiseBurst({ type: 'lowpass', f0: 900 * r, f1: 160, q: 0.7, peak: 0.28 * k, decay: 0.1, pan });
      this.tone('sine', 150 * r, 80, 0.09, 0.2 * k, 0, pan);
    }
  }

  // Botella que se rompe: estallido de vidrio y tintineo de los pedazos.
  glass(pan = 0) {
    if (!this.ctx) return;
    this.noiseBurst({ type: 'highpass', f0: 2500, f1: 6000, q: 0.7, peak: 0.32, decay: 0.12, pan });
    for (let i = 0; i < 4; i++) {
      const f = 2600 + Math.random() * 3200;
      this.tone('triangle', f, f * 0.96, 0.08, 0.05, 0.04 + i * 0.05 + Math.random() * 0.03, pan);
    }
  }

  // Lanzar la granada (quitar la anilla + lanzamiento).
  throwGrenade() {
    this.tone('square', 2400, 2100, 0.03, 0.04);
    this.noiseBurst({ type: 'highpass', f0: 500, f1: 1800, q: 0.7, peak: 0.1, decay: 0.16, delay: 0.06 });
  }

  // Gruñido de zombi: cada tipo con su voz (el caminante alterna gruñido y lamento).
  groan(pan = 0, distance = 5, type = 'walker') {
    const kind = { runner: 'shriek', brute: 'brute', crawler: 'gurgle' }[type] ?? (Math.random() < 0.55 ? 'groan' : 'moan');
    this.zombieVoice(kind, pan, distance);
  }

  /**
   * Voz de zombi sintetizada (perfiles en zombieVoices.js):
   *  - cuerdas vocales: diente de sierra con temblor al azar y un subarmónico (voz doble, ronca);
   *  - aliento: ruido filtrado;
   *  - garganta rota: saturación;
   *  - carraspeo: la amplitud tiembla a pocas decenas de Hz (vocal fry), cada vez más lento;
   *  - boca: tres formantes que pasan de una vocal a otra mientras suena.
   * Lejos suena más baja, apagada y con más eco.
   */
  zombieVoice(kind, pan = 0, distance = 5) {
    const V = VOICES[kind];
    if (!this.ctx || !V || this.voices >= MAX_VOICES || distance > 45) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.01;
    const rnd = (a, b) => a + Math.random() * (b - a);
    const dur = rnd(...V.dur);
    const near = Math.max(0.1, 1 - distance / 40);
    const f = rnd(...V.f);
    const sources = [];
    const osc = (type, freq) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      sources.push(o);
      return o;
    };
    const noise = () => {
      const n = ctx.createBufferSource();
      n.buffer = this.noise;
      n.loop = true;
      sources.push(n);
      return n;
    };
    const filter = (type, freq, q = 1) => {
      const b = ctx.createBiquadFilter();
      b.type = type;
      b.frequency.value = freq;
      b.Q.value = q;
      return b;
    };
    const gain = (v) => {
      const g = ctx.createGain();
      g.gain.value = v;
      return g;
    };

    // Cuerdas vocales y subarmónico, con el contorno de tono de la voz.
    const voice = osc('sawtooth', f);
    const sub = osc('square', f / 2);
    for (const [o, m] of [[voice, 1], [sub, 0.5]]) {
      o.frequency.setValueAtTime(f * m * V.bend[0], t);
      for (let k = 1; k < V.bend.length; k++) o.frequency.linearRampToValueAtTime(f * m * V.bend[k], t + (dur * k) / (V.bend.length - 1));
    }
    // Temblor irregular del tono (ruido muy filtrado): la voz nunca es una nota limpia.
    const jitter = gain(f * V.jitter);
    noise().connect(filter('lowpass', 16)).connect(jitter);
    jitter.connect(voice.frequency);
    jitter.connect(sub.frequency);
    const mix = gain(0.5);
    voice.connect(mix);
    sub.connect(gain(V.sub)).connect(mix);
    // Garganta rota.
    const shaper = ctx.createWaveShaper();
    shaper.curve = this.driveCurve(V.drive);
    mix.connect(shaper);
    // Carraspeo (y el aliento entra acá, sin distorsión: si no, suena a estática).
    const fry = gain(1 - V.fryDepth / 2);
    noise().connect(filter('bandpass', V.breathF, 0.8)).connect(gain(V.breath * 0.5)).connect(fry);
    const fryLfo = osc('square', V.fry[0]);
    fryLfo.frequency.linearRampToValueAtTime(V.fry[1], t + dur);
    fryLfo.connect(gain(V.fryDepth / 2)).connect(fry.gain);
    shaper.connect(fry);
    // Boca: formantes en paralelo, de una vocal a otra.
    const env = ctx.createGain();
    const peak = V.gain * near * rnd(0.8, 1.1);
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(peak, t + dur * V.attack);
    env.gain.setValueAtTime(peak, t + dur * 0.62);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    for (let k = 0; k < 3; k++) {
      const bp = filter('bandpass', V.formants[0][k], V.q[k]);
      const drift = rnd(0.92, 1.08);
      for (let s = 1; s < V.formants.length; s++) bp.frequency.linearRampToValueAtTime(V.formants[s][k] * drift, t + (dur * s) / (V.formants.length - 1));
      fry.connect(bp).connect(gain([1, 0.6, 0.3][k])).connect(env);
    }
    // Lejos: apagada y con más eco.
    env.connect(filter('lowpass', 900 + 7000 * near * near, 0.7)).connect(this.output(pan, 0.25 + (1 - near) * 0.6, 0.1 + (1 - near) * 0.3));

    this.voices++;
    for (const n of sources) {
      n.start(t, n.buffer ? Math.random() * 1.5 : 0);
      n.stop(t + dur + 0.1);
    }
    voice.onended = () => {
      this.voices = Math.max(0, this.voices - 1);
      env.disconnect();
    };
  }

  // Curva de saturación (tanh): `k` alto = voz más rota.
  driveCurve(k) {
    this.curves ??= {};
    if (this.curves[k]) return this.curves[k];
    const n = 1024;
    const c = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      c[i] = Math.tanh(k * x) / Math.tanh(k);
    }
    return (this.curves[k] = c);
  }

  // Inicio de oleada: bocina grave.
  horn() {
    this.tone('sawtooth', 110, 104, 0.9, 0.18);
    this.tone('sawtooth', 165, 156, 0.9, 0.1);
  }

  purchase() {
    [880, 1320].forEach((f, i) => this.tone('triangle', f, f, 0.08, 0.12, i * 0.06));
  }

  powerup() {
    [660, 990, 1320, 1760].forEach((f, i) => this.tone('sine', f, f * 1.02, 0.1, 0.12, i * 0.05));
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
