/*
  Música de ambiente de terror, generada en vivo con Web Audio (sin archivos y nunca se repite igual).
  Suena por el bus de música de Sfx (volumen propio en Ajustes → Audio).

  Capas:
  - Zumbido grave (re) con un filtro que respira despacio, y viento que va y viene.
  - Tensión: disonancias (segunda menor y tritono) con trémolo; crece con la intensidad.
  - Acordes disonantes que aparecen y se desvanecen cada tantos segundos.
  - Cajita de música de circo desafinada: frases sueltas, que a veces se quedan sin cuerda.
  - Latidos: más rápidos y fuertes con la intensidad y con poca vida.
  - Sobresaltos: chirrido de cuerdas, metal que raspa, golpe lejano, susurros.

  setIntensity(0…1): 0 calma (entre rondas), 1 horda encima. setHealth(0…1): vida del jugador.
*/
const ROOT = 73.42; // re2
const semi = (n) => Math.pow(2, n / 12);
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (list) => list[Math.floor(Math.random() * list.length)];

// Acordes disonantes (semitonos sobre re3).
const CLUSTERS = [[0, 1, 6], [0, 3, 8, 9], [-2, 1, 5], [0, 6, 11], [-5, 0, 1], [3, 4, 10]];
// Re menor armónica: la escala de la cajita de música.
const SCALE = [0, 2, 3, 5, 7, 8, 11, 12, 14, 15, 17];
const BOX_ROOT = 587.33; // re5
const TICK = 0.2; // s entre vueltas del programador
const AHEAD = 0.35; // s que agenda por adelantado

export class HorrorMusic {
  constructor(sfx, { paused = () => false } = {}) {
    this.sfx = sfx;
    this.paused = paused;
    this.on = false;
    this.intensity = 0.2;
    this.target = 0.2;
    this.health = 1;
    this.bus = null;
  }

  start() {
    this.on = true;
    this.target = 0.2;
    this.health = 1;
    if (!this.timer) this.timer = setInterval(() => this.tick(), TICK * 1000);
    this.tick();
  }

  stop(fade = 2.5) {
    this.on = false;
    clearInterval(this.timer);
    this.timer = null;
    const { bus, sources } = this;
    this.bus = null;
    this.sources = [];
    if (!bus) return;
    const t = this.sfx.ctx.currentTime;
    bus.gain.cancelScheduledValues(t);
    bus.gain.setValueAtTime(bus.gain.value, t);
    bus.gain.linearRampToValueAtTime(0, t + fade);
    for (const s of sources) s.stop(t + fade + 0.05);
    setTimeout(() => bus.disconnect(), fade * 1000 + 200);
  }

  setIntensity(x) {
    this.target = Math.max(0, Math.min(1, x));
  }

  setHealth(f) {
    this.health = Math.max(0, Math.min(1, f));
  }

  // Arma las capas continuas la primera vez que hay contexto de audio (tras el primer gesto).
  build() {
    const ctx = this.sfx.ctx;
    if (!ctx || !this.sfx.music) return false;
    const t = ctx.currentTime;
    this.sources = [];
    this.bus = this.gain(0);
    this.bus.connect(this.sfx.music);
    this.bus.gain.linearRampToValueAtTime(1, t + 6); // entra de a poco
    this.wet = this.gain(0.55);
    this.bus.connect(this.wet).connect(this.sfx.reverbIn);

    // Zumbido: dos sierras casi iguales (baten) y un seno una octava abajo, con filtro que respira.
    const droneLp = this.filter('lowpass', 240, 3);
    this.lfo(0.035, 130, droneLp.frequency);
    this.droneGain = this.gain(0.12);
    for (const [type, f, g] of [['sawtooth', ROOT, 0.5], ['sawtooth', ROOT * 1.0045, 0.5], ['sine', ROOT / 2, 0.9]]) this.osc(type, f).connect(this.gain(g)).connect(droneLp);
    droneLp.connect(this.droneGain).connect(this.bus);
    this.lfo(0.06, 0.04, this.droneGain.gain);

    // Tensión: segunda menor y tritono, con trémolo nervioso.
    const tensBp = this.filter('bandpass', 520, 1.6);
    this.lfo(0.09, 220, tensBp.frequency);
    for (const n of [13, 18, 25]) this.osc('sawtooth', ROOT * semi(n)).connect(this.gain(0.33)).connect(tensBp);
    const trem = this.gain(0.6);
    this.lfo(5.5, 0.4, trem.gain);
    this.tensionGain = this.gain(0);
    tensBp.connect(trem).connect(this.tensionGain).connect(this.bus);

    // Viento entre los edificios.
    const wind = this.sfx.ctx.createBufferSource();
    wind.buffer = this.sfx.noise;
    wind.loop = true;
    this.sources.push(wind);
    const windBp = this.filter('bandpass', 520, 0.7);
    this.lfo(0.05, 320, windBp.frequency);
    const windGain = this.gain(0.05);
    this.lfo(0.11, 0.035, windGain.gain);
    wind.connect(windBp).connect(windGain).connect(this.bus);
    for (const s of this.sources) s.start(t);

    this.next = { pad: t + 3, box: t + rnd(8, 14), beat: t + 1, sting: t + rnd(18, 30) };
    return true;
  }

  tick() {
    if (!this.on) return;
    if (!this.bus && !this.build()) return;
    const ctx = this.sfx.ctx;
    const now = ctx.currentTime;
    this.intensity += (this.target - this.intensity) * 0.06;
    const I = this.intensity;
    const fear = 1 - this.health;
    // En pausa la música baja; la tensión sigue la intensidad.
    this.bus.gain.setTargetAtTime(this.paused() ? 0.3 : 1, now, 0.4);
    this.tensionGain.gain.setTargetAtTime(Math.max(0, I - 0.25) * 0.14, now, 1.2);
    this.droneGain.gain.setTargetAtTime(0.1 + I * 0.06, now, 1.5);
    const until = now + AHEAD;
    const n = this.next;
    if (n.pad < until) {
      this.pad(n.pad, I);
      n.pad += rnd(13, 21);
    }
    if (n.box < until) {
      this.musicBox(n.box, I);
      n.box += rnd(22, 40) * (0.7 + I * 0.8); // más seguido en la calma
    }
    // Latidos: desde intensidad media o con poca vida.
    const beatVol = Math.min(0.55, Math.max(0, I - 0.45) * 0.5 + Math.max(0, fear - 0.35) * 0.9);
    const bpm = 54 + I * 40 + fear * 50;
    while (n.beat < until) {
      if (beatVol > 0.02) this.heartbeat(n.beat, beatVol);
      n.beat += 60 / bpm;
    }
    if (n.sting < until) {
      this.sting(n.sting, I);
      n.sting += rnd(22, 55) / (0.6 + I);
    }
  }

  // --- Eventos ---------------------------------------------------------------------------------------
  // Acorde disonante que aparece despacio y se deshace.
  pad(t, I) {
    const dur = rnd(8, 12);
    const lp = this.filter('lowpass', 600 + I * 900, 0.8);
    const env = this.gain(0);
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.035, t + 4);
    env.gain.setValueAtTime(0.035, t + dur - 5);
    env.gain.linearRampToValueAtTime(0, t + dur);
    lp.connect(env).connect(this.bus);
    for (const st of pick(CLUSTERS)) {
      for (const cents of [-7, 7]) {
        const o = this.oneShot('triangle', ROOT * 2 * semi(st), t, dur);
        o.detune.value = cents;
        o.connect(lp);
      }
    }
  }

  // Cajita de música: una frase de vals inventada al azar; a veces se queda sin cuerda (se frena y
  // se desafina hacia abajo).
  musicBox(t, I) {
    const notes = 6 + Math.floor(Math.random() * 6);
    const unwind = Math.random() < 0.45;
    const pan = rnd(-0.5, 0.5);
    const out = this.sfx.ctx.createStereoPanner();
    out.pan.value = pan;
    const g = this.gain(0.05 * (1 - I * 0.5));
    out.connect(g).connect(this.bus);
    g.connect(this.gain(1.4)).connect(this.wet); // la cajita suena lejos: mucha reverb
    let step = Math.floor(rnd(3, 7));
    let at = t;
    let beat = rnd(0.34, 0.44);
    for (let i = 0; i < notes; i++) {
      step = Math.max(0, Math.min(SCALE.length - 1, step + pick([-2, -1, -1, 1, 1, 2, 3, -3])));
      const k = i / notes;
      const drop = unwind ? -k * k * 90 : rnd(-12, 12); // centésimas
      this.bell(BOX_ROOT * semi(SCALE[step]), at, drop, out);
      if (i % 3 === 0 && Math.random() < 0.5) this.bell(BOX_ROOT * semi(SCALE[Math.max(0, step - 7)] ?? 0) / 2, at, drop, out, 0.5);
      at += beat * (i % 3 === 2 ? 1.25 : 1);
      if (unwind) beat *= 1.07;
    }
  }

  bell(f, t, cents, out, level = 1) {
    for (const [mul, g, d] of [[1, 1, 1.8], [2.76, 0.28, 0.7], [5.4, 0.1, 0.35]]) {
      const o = this.oneShot('sine', f * mul, t, d + 0.05);
      o.detune.value = cents;
      const env = this.gain(0);
      env.gain.setValueAtTime(0.0001, t);
      env.gain.exponentialRampToValueAtTime(g * level, t + 0.005);
      env.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(env).connect(out);
    }
  }

  // Latido: dos golpes graves (lub-dub).
  heartbeat(t, vol) {
    for (const [dt, k] of [[0, 1], [0.27, 0.65]]) {
      const o = this.oneShot('sine', 60, t + dt, 0.25);
      o.frequency.setValueAtTime(62, t + dt);
      o.frequency.exponentialRampToValueAtTime(36, t + dt + 0.16);
      const env = this.gain(0);
      env.gain.setValueAtTime(0.0001, t + dt);
      env.gain.exponentialRampToValueAtTime(vol * k, t + dt + 0.012);
      env.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.22);
      o.connect(env).connect(this.bus);
    }
  }

  // Sobresaltos sueltos.
  sting(t, I) {
    const kind = pick(I > 0.5 ? ['screech', 'screech', 'scrape', 'boom'] : ['scrape', 'boom', 'whisper', 'whisper', 'screech']);
    const pan = this.sfx.ctx.createStereoPanner();
    pan.pan.value = rnd(-0.8, 0.8);
    pan.connect(this.bus);
    pan.connect(this.wet);
    if (kind === 'screech') {
      // Cuerdas que chirrían y caen.
      const dur = rnd(2.2, 3.4);
      const f = rnd(1300, 1900);
      const bp = this.filter('bandpass', f, 6);
      bp.frequency.setValueAtTime(f, t);
      bp.frequency.exponentialRampToValueAtTime(f * 0.55, t + dur);
      const trem = this.gain(0.6);
      const lfo = this.oneShot('sine', 9, t, dur);
      lfo.connect(this.gain(0.4)).connect(trem.gain);
      const env = this.swell(t, dur, 0.06);
      for (const d of [0, 11]) {
        const o = this.oneShot('sawtooth', f, t, dur);
        o.detune.value = d;
        o.frequency.exponentialRampToValueAtTime(f * 0.55, t + dur);
        o.connect(bp);
      }
      bp.connect(trem).connect(env).connect(pan);
    } else if (kind === 'scrape') {
      // Metal que raspa contra metal.
      const dur = rnd(1.6, 2.6);
      const bp = this.filter('bandpass', 500, 14);
      bp.frequency.setValueAtTime(rnd(350, 600), t);
      bp.frequency.linearRampToValueAtTime(rnd(1400, 2200), t + dur * 0.6);
      bp.frequency.linearRampToValueAtTime(rnd(600, 900), t + dur);
      this.noiseShot(t, dur).connect(bp).connect(this.swell(t, dur, 0.22)).connect(pan);
    } else if (kind === 'boom') {
      // Golpe lejano (una puerta, algo que cae).
      const o = this.oneShot('sine', 48, t, 2.2);
      o.frequency.exponentialRampToValueAtTime(30, t + 1.8);
      const env = this.gain(0);
      env.gain.setValueAtTime(0.0001, t);
      env.gain.exponentialRampToValueAtTime(0.32, t + 0.02);
      env.gain.exponentialRampToValueAtTime(0.0001, t + 2);
      o.connect(env).connect(pan);
      this.noiseShot(t, 1.2).connect(this.filter('lowpass', 220, 0.6)).connect(this.swell(t, 1.2, 0.18, 0.02)).connect(pan);
    } else {
      // Susurros: sílabas de aire que no se entienden.
      const syll = 5 + Math.floor(Math.random() * 6);
      let at = t;
      for (let i = 0; i < syll; i++) {
        const d = rnd(0.12, 0.3);
        const bp = this.filter('bandpass', pick([2400, 3200, 4200, 1800]), 3);
        this.noiseShot(at, d).connect(bp).connect(this.swell(at, d, 0.08, 0.3)).connect(pan);
        at += d + rnd(0.04, 0.2);
      }
    }
  }

  // --- Piezas ----------------------------------------------------------------------------------------
  gain(v) {
    const g = this.sfx.ctx.createGain();
    g.gain.value = v;
    return g;
  }

  filter(type, f, q = 1) {
    const b = this.sfx.ctx.createBiquadFilter();
    b.type = type;
    b.frequency.value = f;
    b.Q.value = q;
    return b;
  }

  // Oscilador continuo (capas que suenan todo el tiempo).
  osc(type, f) {
    const o = this.sfx.ctx.createOscillator();
    o.type = type;
    o.frequency.value = f;
    this.sources.push(o);
    return o;
  }

  // Modulación lenta de un parámetro.
  lfo(rate, depth, param) {
    const o = this.osc('sine', rate * rnd(0.85, 1.15));
    o.connect(this.gain(depth)).connect(param);
  }

  oneShot(type, f, t, dur) {
    const o = this.sfx.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    o.start(t);
    o.stop(t + dur + 0.1);
    return o;
  }

  noiseShot(t, dur) {
    const n = this.sfx.ctx.createBufferSource();
    n.buffer = this.sfx.noise;
    n.loop = true;
    n.start(t, Math.random() * 1.5);
    n.stop(t + dur + 0.1);
    return n;
  }

  // Sube y baja (fracción `rise` de la duración subiendo).
  swell(t, dur, peak, rise = 0.4) {
    const env = this.gain(0);
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(peak, t + dur * rise);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    return env;
  }
}
