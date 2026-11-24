import * as THREE from 'three';
import { h } from '../../ui/dom.js';
import { PERKS, POWERUPS } from './zombieData.js';
import { GRENADE_TYPES } from '../../combat/Grenades.js';
import { keyLabel } from '../../config/keybinds.js';
import { icon } from '../../ui/icons.js';
import { SAFE } from './safe.js';

const MAX_ARROWS = 6;
const THREAT_RANGE = 7;
const EDGE = 0.9;
const _v = new THREE.Vector3();
const fmt = (n) => Math.round(n).toLocaleString('es');
const SKULL_SVG =
  '<svg viewBox="0 0 32 32" width="100%" height="100%" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" d="M16 2C8.8 2 4 7.2 4 13.6c0 3.9 1.8 6.6 4.4 8.2V26a2 2 0 0 0 2 2h1.4v-3h2v3h4.4v-3h2v3h1.4a2 2 0 0 0 2-2v-4.2c2.6-1.6 4.4-4.3 4.4-8.2C28 7.2 23.2 2 16 2Zm-5.6 9.4a3.2 3.4 0 1 1 0 6.8 3.2 3.4 0 0 1 0-6.8Zm11.2 0a3.2 3.4 0 1 1 0 6.8 3.2 3.4 0 0 1 0-6.8ZM16 18.4l1.8 3.4h-3.6Z"/></svg>';

export class ZombieHud {
  constructor(hud) {
    const layer = hud.refs.crosshair.parentElement;
    this.waveNum = h('strong', {}, '1');
    this.panel = h('div', { class: 'zh-panel', title: 'Ronda' }, h('div', { class: 'zh-wave' }, this.waveNum));

    this.cash = h('strong', {}, '0');
    this.gain = h('span', { class: 'zh-gain' });
    this.cashBox = h('div', { class: 'zh-cash' }, h('small', {}, 'Puntos'), this.cash, this.gain);

    this.powerTag = h('span', { class: 'zh-nopower' }, 'Sin electricidad · enciende el generador (Subestación)');
    this.grenades = h('span', { class: 'zh-nades' });
    this.perks = h('div', { class: 'zh-perks' });
    this.powers = h('div', { class: 'zh-powers' });
    this.side = h('div', { class: 'zh-side' }, this.powerTag, this.grenades, this.perks, this.powers);

    this.pKey = h('kbd', {});
    this.pText = h('span', { class: 'zh-p-text' });
    this.pPrice = h('strong', { class: 'zh-p-price' });
    this.prompt = h('div', { class: 'zh-prompt', hidden: true }, this.pKey, this.pText, this.pPrice);

    this.arrows = [];
    this.arrowLayer = h('div', { class: 'zh-arrows' });
    for (let i = 0; i < MAX_ARROWS; i++) {
      const el = h('i', { class: 'zh-arrow', hidden: true });
      this.arrowLayer.append(el);
      this.arrows.push(el);
    }
    this.barCount = h('strong', {}, '');
    this.barFill = h('i');
    this.barBox = h('div', { class: 'zh-barbox', hidden: true }, h('small', {}, 'Barra'), this.barCount, h('div', { class: 'zh-barmeter' }, this.barFill));
    this.lightKey = h('kbd', {});
    this.lightFill = h('i');
    this.lightState = h('span', { class: 'zh-light-state' });
    this.lightIcon = h('span', { class: 'zh-light-icon' });
    this.lightIcon.innerHTML = icon('flashlight', 18);
    this.lightBox = h('div', { class: 'zh-light' }, this.lightIcon, h('div', { class: 'zh-light-info' }, h('div', { class: 'zh-light-row' }, this.lightKey, this.lightState), h('div', { class: 'zh-battery' }, this.lightFill)));
    this.vignette = h('div', { class: 'zh-vignette', hidden: true });
    this.hurt = h('div', { class: 'zh-hurt' });
    this.codeVal = h('strong', {}, '');
    this.codeBox = h('div', { class: 'zh-code', hidden: true }, h('small', {}, 'Código de la caja fuerte'), this.codeVal);
    this.lifeNum = h('span', { class: 'zh-life-num' }, '100');
    this.lifeFill = h('i', { class: 'zh-life-fill' });
    this.lifeLag = h('i', { class: 'zh-life-lag' });
    const skull = h('span', { class: 'zh-life-skull' });
    skull.innerHTML = SKULL_SVG;
    this.life = h('div', { class: 'zh-life' }, skull, h('div', { class: 'zh-life-bar' }, this.lifeLag, this.lifeFill, h('b', { class: 'zh-life-veins' })), this.lifeNum);
    this.root = h('div', { class: 'zh-root' }, this.vignette, this.hurt, this.arrowLayer, this.panel, this.cashBox, this.barBox, this.side, this.lightBox, this.codeBox, this.life, this.prompt);
    layer.append(this.root);
    this.layer = layer;
    layer.classList.add('zh-on');
    this.cache = new Map();
    this.buildKeypad(layer);
  }

  buildKeypad(layer) {
    this.onKeypad = null;
    this.kpSlots = Array.from({ length: SAFE.digits }, () => h('span', { class: 'zh-kp-slot' }, ''));
    this.kpMsg = h('div', { class: 'zh-kp-msg' }, '');
    this.kpHelp = h('div', { class: 'zh-kp-help' }, '');
    const key = (k, label, cls = '') => {
      const b = h('button', { type: 'button', class: `zh-kp-key ${cls}`, 'data-k': k }, label);
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.onKeypad?.(k);
      });
      return b;
    };
    const keys = h('div', { class: 'zh-kp-keys' }, ...'123456789'.split('').map((d) => key(d, d)), key('back', '⌫', 'muted'), key('0', '0'), key('ok', 'Abrir', 'ok'));
    this.keypad = h('div', { class: 'zh-keypad', hidden: true }, h('div', { class: 'zh-kp-title' }, 'Caja fuerte'), h('div', { class: 'zh-kp-screen' }, ...this.kpSlots), this.kpMsg, keys, key('close', 'Cerrar', 'close'), this.kpHelp);
    (layer.closest('#app') ?? layer).append(this.keypad);
  }

  setKeypad(state) {
    this.set('kpShow', this.keypad, !state, 'hidden');
    if (!state) return;
    this.kpSlots.forEach((el, i) => {
      const ch = state.entry[i] ?? '';
      if (el.textContent !== ch) el.textContent = ch;
      el.classList.toggle('on', i === state.entry.length);
    });
    this.set('kpMsg', this.kpMsg, state.msg ?? '');
    this.set('kpTone', this.keypad, `zh-keypad${state.tone ? ` ${state.tone}` : ''}`, 'className');
    this.set('kpHelp', this.kpHelp, state.help ?? '');
  }

  set(key, el, value, prop = 'textContent') {
    if (this.cache.get(key) === value) return;
    this.cache.set(key, value);
    el[prop] = value;
  }

  setVisible(on) {
    this.root.hidden = !on;
  }

  popGain(n) {
    this.gain.textContent = `+${fmt(n)}`;
    this.gain.classList.remove('show');
    void this.gain.offsetWidth;
    this.gain.classList.add('show');
  }

  setPrompt(p) {
    this.set('pShow', this.prompt, !p, 'hidden');
    if (!p) return;
    this.set('pKey', this.pKey, p.key ?? '', 'textContent');
    this.set('pKeyHide', this.pKey, !p.key, 'hidden');
    this.set('pText', this.pText, p.text);
    this.set('pPrice', this.pPrice, p.price ? `${fmt(p.price)} pts` : '');
    this.prompt.classList.toggle('poor', p.poor ?? (p.ok === false && !!p.price));
  }

  update(game, run, mode) {
    this.updateLight(game, mode.flashlight);
    this.updateLife(run);
    const wave = String(Math.max(1, run.wave || mode.nextWave));
    if (this.cache.get('wave') !== wave) {
      this.set('wave', this.waveNum, wave);
      this.waveNum.classList.remove('pop');
      void this.waveNum.offsetWidth;
      this.waveNum.classList.add('pop');
    }
    this.set('power', this.powerTag, game.world.powered !== false, 'hidden');
    this.set('vignette', this.vignette, game.engine.detail === 'alta', 'hidden');
    const hurt = Math.max(0, Math.min(1, (0.5 - run.health / run.maxHealth) / 0.4));
    this.set('hurt', this.hurt, hurt.toFixed(2), '__o');
    if (this.hurt.style.opacity !== hurt.toFixed(2)) this.hurt.style.opacity = hurt.toFixed(2);
    this.set('cash', this.cash, fmt(run.cash));
    if (run.bar) {
      const left = run.bar.left;
      const total = run.bar.total;
      this.set('barShow', this.barBox, false, 'hidden');
      this.set('barCount', this.barCount, `${left} / ${total} botellas`);
      const k = left / total;
      this.set('barFill', this.barFill, `${Math.round(k * 100)}%`, '__w');
      if (this.barFill.style.width !== `${Math.round(k * 100)}%`) this.barFill.style.width = `${Math.round(k * 100)}%`;
      this.set('barLow', this.barBox, k < 0.35 ? 'zh-barbox low' : 'zh-barbox', 'className');
    }
    const type = game.grenades.type;
    const bag = mode.grenadeBag;
    const others = Object.entries(bag).filter(([t, n]) => t !== type && n > 0).map(([t, n]) => `${GRENADE_TYPES[t].name.slice(0, 4)}. ×${n}`);
    const keys = game.touchMode ? '' : `  ·  ${keyLabel(game.settings.keys, 'grenade')} / ${keyLabel(game.settings.keys, 'grenadeNext')}`;
    this.set('nades', this.grenades, `${GRENADE_TYPES[type].name} ×${bag[type] ?? 0}${others.length ? ` (${others.join(', ')})` : ''}${keys}`);
    const perks = [...run.perks].join('|');
    if (this.cache.get('perks') !== perks) {
      this.cache.set('perks', perks);
      this.perks.replaceChildren(...[...run.perks].map((id) => h('span', { class: 'zh-perk', style: { '--c': PERKS[id].color }, title: PERKS[id].desc }, PERKS[id].name)));
    }

    const active = Object.entries(run.timers)
      .filter(([, t]) => t > 0)
      .map(([id, t]) => `${id}:${Math.ceil(t)}`)
      .join('|');
    if (this.cache.get('powers') !== active) {
      this.cache.set('powers', active);
      this.powers.replaceChildren(
        ...Object.entries(run.timers)
          .filter(([, t]) => t > 0)
          .map(([id, t]) => h('span', { class: 'zh-power', style: { '--c': POWERUPS[id].color } }, `${POWERUPS[id].name} ${Math.ceil(t)} s`)),
      );
    }

    this.updateCode(run);
    this.updateArrows(game, run);
  }

  updateCode(run) {
    const s = run.safe;
    const showCode = !!s && s.known && !s.unlocked;
    this.set('codeShow', this.codeBox, !showCode, 'hidden');
    if (showCode) this.set('codeVal', this.codeVal, s.code.split('').join(' '));
  }

  updateLight(game, fl) {
    this.set('lightShow', this.lightBox, !fl, 'hidden');
    if (!fl) return;
    this.set('lightKey', this.lightKey, game.touchMode ? '' : keyLabel(game.settings.keys, 'flashlight'));
    this.set('lightKeyHide', this.lightKey, game.touchMode, 'hidden');
    const empty = !fl.on && fl.battery < 0.08;
    this.set('lightState', this.lightState, fl.on ? 'Linterna' : empty ? 'Sin batería' : 'Apagada');
    const pct = Math.round(fl.battery * 100);
    if (this.cache.get('lightPct') !== pct) {
      this.cache.set('lightPct', pct);
      this.lightFill.style.width = `${pct}%`;
    }
    const cls = `zh-light${fl.on ? ' on' : ''}${fl.low ? ' low' : ''}${empty ? ' empty' : ''}`;
    this.set('lightCls', this.lightBox, cls, 'className');
  }

  updateArrows(game, run) {
    const cam = game.engine.camera;
    let n = 0;
    for (const z of run.bots) {
      if (n >= MAX_ARROWS || !z.alive) continue;
      const p = z.position;
      const d = Math.hypot(p.x - cam.position.x, p.z - cam.position.z);
      if (d > THREAT_RANGE) continue;
      _v.copy(p).setY(p.y + 1).project(cam);
      const onScreen = _v.z < 1 && Math.abs(_v.x) < EDGE && Math.abs(_v.y) < EDGE;
      if (onScreen) continue;
      const angle = game.angleTo(p);
      const el = this.arrows[n++];
      el.hidden = false;
      el.style.transform = `translate(-50%, -50%) rotate(${-angle}rad) translateY(-120px)`;
      el.style.opacity = String(0.45 + 0.55 * (1 - d / THREAT_RANGE));
    }
    for (let i = n; i < MAX_ARROWS; i++) if (!this.arrows[i].hidden) this.arrows[i].hidden = true;
  }

  updateLife(run) {
    const k = Math.max(0, Math.min(1, run.health / run.maxHealth));
    const pct = `${(k * 100).toFixed(1)}%`;
    if (this.cache.get('lifePct') !== pct) {
      const prev = this.cache.get('lifeK') ?? 1;
      this.cache.set('lifePct', pct);
      this.cache.set('lifeK', k);
      this.lifeFill.style.width = pct;
      this.lifeLag.style.width = pct;
      if (k < prev - 0.01) {
        this.life.classList.remove('hit');
        void this.life.offsetWidth;
        this.life.classList.add('hit');
      }
    }
    this.set('lifeNum', this.lifeNum, String(Math.ceil(run.health)));
    const state = k <= 0.3 ? 'low' : k <= 0.6 ? 'mid' : '';
    if (this.cache.get('lifeState') !== state) {
      this.cache.set('lifeState', state);
      this.life.classList.toggle('low', state === 'low');
      this.life.classList.toggle('mid', state === 'mid');
    }
  }

  dispose() {
    this.layer?.classList.remove('zh-on');
    this.root.remove();
    this.keypad.remove();
  }
}
