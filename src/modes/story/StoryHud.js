import { h } from '../../ui/dom.js';
import { SPEAKERS, lineDuration } from './storyData.js';

/*
  HUD de la Historia (dentro de la capa de juego del HUD general):
  - Objetivo del capítulo arriba a la izquierda, con el progreso.
  - Subtítulos de radio abajo: quién habla (con su color) y lo que dice. Las líneas se encolan y cada
    una dura según su largo (lineDuration). Las de la transmisión de números las lee una voz sintética.
*/
export class StoryHud {
  constructor(hud) {
    const layer = hud.refs.crosshair.parentElement;
    this.chapter = h('small', {}, '');
    this.objective = h('strong', {}, '');
    this.progress = h('span', {}, '');
    this.panel = h('div', { class: 'st-objective' }, this.chapter, this.objective, this.progress);
    this.who = h('b', {}, '');
    this.text = h('span', {}, '');
    this.sub = h('div', { class: 'st-sub', hidden: true }, this.who, this.text);
    this.root = h('div', { class: 'st-root' }, this.panel, this.sub);
    layer.append(this.root);
    this.queue = [];
    this.current = null;
    this.t = 0;
    this.cache = new Map();
  }

  set(key, el, value, prop = 'textContent') {
    if (this.cache.get(key) === value) return;
    this.cache.set(key, value);
    el[prop] = value;
  }

  setVisible(on) {
    this.root.hidden = !on;
  }

  setChapter(ch) {
    this.set('chapter', this.chapter, `Capítulo ${ch.number} · ${ch.title}`);
    this.set('objective', this.objective, ch.objective);
  }

  say(lines) {
    for (const l of lines ?? []) this.queue.push(l);
  }

  clear() {
    this.queue.length = 0;
    this.current = null;
    this.sub.hidden = true;
    stopVoice();
  }

  update(dt, progressText) {
    this.set('progress', this.progress, progressText ?? '');
    if (this.current) {
      this.t -= dt;
      if (this.t > 0) return;
      this.current = null;
    }
    const next = this.queue.shift();
    if (!next) {
      this.set('subHidden', this.sub, true, 'hidden');
      return;
    }
    this.current = next;
    this.t = lineDuration(next);
    const sp = SPEAKERS[next.who] ?? SPEAKERS.narrador;
    this.set('subHidden', this.sub, false, 'hidden');
    this.who.textContent = sp.name ? `${sp.name}:` : '';
    this.who.style.color = sp.color;
    this.text.textContent = next.text;
    this.sub.classList.toggle('numbers', next.who === 'numeros');
    if (next.who === 'numeros') speakNumbers(next.text);
  }

  dispose() {
    stopVoice();
    this.root.remove();
  }
}

// --- Voz de la estación de números (speechSynthesis; si no hay, solo subtítulo) ---------------------

const DIGITS = ['cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve'];

/** "7 · 3 · 9" → "siete. tres. nueve." (lo que lee la voz). */
export function numbersToSpeech(text) {
  const words = (text.match(/\d/g) ?? []).map((d) => DIGITS[Number(d)]);
  return words.length ? `${words.join('. ')}.` : text;
}

export function speakNumbers(text) {
  try {
    const synth = globalThis.speechSynthesis;
    if (!synth || typeof SpeechSynthesisUtterance === 'undefined') return;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(numbersToSpeech(text));
    u.lang = 'es-ES';
    u.rate = 0.72;
    u.pitch = 0.55;
    u.volume = 0.9;
    const voice = synth.getVoices().find((v) => v.lang?.startsWith('es'));
    if (voice) u.voice = voice;
    synth.speak(u);
  } catch {
    // sin voz: queda el subtítulo
  }
}

export function stopVoice() {
  try {
    globalThis.speechSynthesis?.cancel();
  } catch {
    // nada
  }
}
