import * as THREE from 'three';
import { h } from '../../ui/dom.js';

const MAX_ARROWS = 8;
const ARROW_FAR = 30; // m: a esta distancia la flecha se ve más tenue
const INTRO_BANNER = 1.8; // s que se muestra "Oleada N" al empezar
const EDGE = 0.92; // margen de pantalla (NDC) para considerar a un enemigo "visible"

const _v = new THREE.Vector3();

/*
  Capa de HUD propia del modo infinito. Se monta dentro de la capa de juego del HUD general, así
  que se oculta y se muestra con él. Solo toca el DOM cuando cambia un valor.

  - Panel de oleada: número, enemigos restantes y racha.
  - Cartel central: cuenta antes de la oleada, "Oleada N" y resumen al superarla.
  - Flechas de amenaza alrededor de la mira para enemigos fuera de la pantalla. Se ponen rojas si el
    enemigo te tiene en la mira (puede dispararte).
*/
export class EndlessHud {
  constructor(hud) {
    const playLayer = hud.refs.crosshair.parentElement;
    this.waveNum = h('strong', {}, '1');
    this.remaining = h('span', {}, '');
    this.streak = h('span', { class: 'eh-streak' }, '');
    this.panel = h(
      'div',
      { class: 'eh-panel' },
      h('div', { class: 'eh-wave' }, h('small', {}, 'Oleada'), this.waveNum),
      h('div', { class: 'eh-meta' }, this.remaining, this.streak),
    );

    this.bTitle = h('div', { class: 'eh-b-title' });
    this.bSub = h('div', { class: 'eh-b-sub' });
    this.bCount = h('div', { class: 'eh-b-count' });
    this.banner = h('div', { class: 'eh-banner', hidden: true }, this.bTitle, this.bSub, this.bCount);

    this.arrows = [];
    this.arrowLayer = h('div', { class: 'eh-arrows' });
    for (let i = 0; i < MAX_ARROWS; i++) {
      const el = h('i', { class: 'eh-arrow', hidden: true });
      this.arrowLayer.append(el);
      this.arrows.push(el);
    }

    this.root = h('div', { class: 'eh-root' }, this.arrowLayer, this.panel, this.banner);
    playLayer.append(this.root);
    this.cache = new Map();
    this.waveClear = null; // { wave, bonus, heal, perfect } de la última oleada superada
  }

  set(key, el, fn) {
    // fn() devuelve el valor a mostrar; solo se escribe si cambió.
    const v = fn();
    if (this.cache.get(key) === v) return;
    this.cache.set(key, v);
    el.textContent = v;
  }

  reset() {
    this.cache.clear();
    this.waveClear = null;
    this.banner.hidden = true;
    for (const a of this.arrows) a.hidden = true;
  }

  setVisible(visible) {
    this.root.hidden = !visible;
  }

  update(game, run, mode) {
    const wave = mode.state === 'wave' || mode.state === 'dying' ? run.wave : mode.nextWave;
    this.set('wave', this.waveNum, () => String(wave));
    this.set('remaining', this.remaining, () =>
      mode.state === 'wave' ? `${run.remaining} enemigo${run.remaining === 1 ? '' : 's'}` : 'Descanso',
    );
    this.set('streak', this.streak, () => (run.streak >= 2 ? `Racha ×${run.streak}` : ''));
    this.updateBanner(run, mode);
    this.updateArrows(game, run, mode);
  }

  updateBanner(run, mode) {
    let title = '';
    let sub = '';
    let count = '';
    if (mode.state === 'countdown') {
      title = `Oleada ${mode.nextWave}`;
      sub = 'Prepárate · los enemigos entran por las 8 puertas';
      count = String(Math.max(1, Math.ceil(mode.timer)));
    } else if (mode.state === 'clear' && this.waveClear) {
      const c = this.waveClear;
      title = c.perfect ? `Oleada ${c.wave} perfecta` : `Oleada ${c.wave} superada`;
      sub = `+${c.bonus} pts${c.heal > 0 ? ` · +${c.heal} vida` : ''} · siguiente oleada en`;
      count = String(Math.max(1, Math.ceil(mode.timer)));
    } else if (mode.state === 'wave' && run.elapsed - run.waveStartedAt < INTRO_BANNER) {
      title = `Oleada ${run.wave}`;
      sub = `${run.cfg.count} enemigos`;
    }
    const key = `${title}|${sub}|${count}`;
    if (this.cache.get('banner') === key) return;
    this.cache.set('banner', key);
    this.banner.hidden = !title;
    this.banner.classList.toggle('perfect', mode.state === 'clear' && !!this.waveClear?.perfect);
    this.bTitle.textContent = title;
    this.bSub.textContent = sub;
    this.bCount.textContent = count;
  }

  updateArrows(game, run, mode) {
    const cam = game.engine.camera;
    let n = 0;
    if (mode.state === 'wave' || mode.state === 'clear') {
      for (const bot of run.bots) {
        if (n >= MAX_ARROWS) break;
        if (!bot.alive) continue;
        bot.chestPosition(_v).project(cam);
        const visible = _v.z < 1 && Math.abs(_v.x) <= EDGE && Math.abs(_v.y) <= EDGE;
        if (visible) continue;
        const el = this.arrows[n++];
        const angle = game.angleTo(bot.position);
        const dist = game.player.position.distanceTo(bot.position);
        el.hidden = false;
        el.style.transform = `rotate(${(-angle).toFixed(3)}rad) translateY(-150px)`;
        el.style.opacity = String(Math.max(0.45, 1 - dist / ARROW_FAR / 2).toFixed(2));
        el.classList.toggle('threat', !!bot.hasLos);
      }
    }
    for (let i = n; i < MAX_ARROWS; i++) this.arrows[i].hidden = true;
  }

  dispose() {
    this.root.remove();
  }
}
