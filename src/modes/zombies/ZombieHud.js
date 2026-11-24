import * as THREE from 'three';
import { h } from '../../ui/dom.js';
import { PERKS, POWERUPS } from './zombieData.js';
import { GRENADE_TYPES } from '../../combat/Grenades.js';
import { keyLabel } from '../../config/keybinds.js';
import { icon } from '../../ui/icons.js';
import { SAFE } from './safe.js';

const MAX_ARROWS = 6;
const THREAT_RANGE = 7; // m: zombis más cerca que esto y fuera de pantalla → flecha
const EDGE = 0.9;
const _v = new THREE.Vector3();
const fmt = (n) => Math.round(n).toLocaleString('es');

/*
  Capa de HUD del modo zombi (dentro de la capa de juego del HUD general: se oculta con él).
  Solo escribe en el DOM cuando cambia un valor.
  - Panel de oleada (número, zombis que quedan, aviso de noche de corredores).
  - Puntos para la armería, con "+N" al ganar.
  - Granadas y potenciadores activos con su cuenta atrás.
  - Cartel central (cuentas, oleada nueva, oleada superada y aviso de la armería).
  - Flechas de amenaza: zombis cerca y fuera de la vista.
  - El Jefe: su barra de vida mientras está vivo y, al matarlo, el código de la caja fuerte.
  - Teclado de la caja fuerte (se escribe con los números o tocando las teclas en el celular). Va
    encima de los controles táctiles para que se pueda tocar.
*/
export class ZombieHud {
  constructor(hud) {
    const layer = hud.refs.crosshair.parentElement;
    this.waveNum = h('strong', {}, '1');
    this.left = h('span', {}, '');
    this.tag = h('span', { class: 'zh-tag', hidden: true }, 'Noche de corredores');
    this.panel = h('div', { class: 'zh-panel' }, h('div', { class: 'zh-wave' }, h('small', {}, 'Ronda'), this.waveNum), h('div', { class: 'zh-meta' }, this.left, this.tag));

    this.cash = h('strong', {}, '0');
    this.gain = h('span', { class: 'zh-gain' });
    this.cashBox = h('div', { class: 'zh-cash' }, h('small', {}, 'Puntos'), this.cash, this.gain);

    this.powerTag = h('span', { class: 'zh-nopower' }, 'Sin electricidad · enciende el generador (Subestación)');
    this.grenades = h('span', { class: 'zh-nades' });
    this.perks = h('div', { class: 'zh-perks' });
    this.powers = h('div', { class: 'zh-powers' });
    this.side = h('div', { class: 'zh-side' }, this.powerTag, this.grenades, this.perks, this.powers);

    // Aviso de compra (lo que hay delante: puerta, arma de pared o bebida).
    this.pKey = h('kbd', {});
    this.pText = h('span', { class: 'zh-p-text' });
    this.pPrice = h('strong', { class: 'zh-p-price' });
    this.prompt = h('div', { class: 'zh-prompt', hidden: true }, this.pKey, this.pText, this.pPrice);

    this.bTitle = h('div', { class: 'zh-b-title' });
    this.bSub = h('div', { class: 'zh-b-sub' });
    this.banner = h('div', { class: 'zh-banner', hidden: true }, this.bTitle, this.bSub);

    this.arrows = [];
    this.arrowLayer = h('div', { class: 'zh-arrows' });
    for (let i = 0; i < MAX_ARROWS; i++) {
      const el = h('i', { class: 'zh-arrow', hidden: true });
      this.arrowLayer.append(el);
      this.arrows.push(el);
    }
    // Defensa: botellas que quedan en la barra (con su barra de vida).
    this.barCount = h('strong', {}, '');
    this.barFill = h('i');
    this.barBox = h('div', { class: 'zh-barbox', hidden: true }, h('small', {}, 'Barra'), this.barCount, h('div', { class: 'zh-barmeter' }, this.barFill));
    // Linterna: ícono (encendido o apagado), su tecla y la batería.
    this.lightKey = h('kbd', {});
    this.lightFill = h('i');
    this.lightState = h('span', { class: 'zh-light-state' });
    this.lightIcon = h('span', { class: 'zh-light-icon' });
    this.lightIcon.innerHTML = icon('flashlight', 18);
    this.lightBox = h('div', { class: 'zh-light' }, this.lightIcon, h('div', { class: 'zh-light-info' }, h('div', { class: 'zh-light-row' }, this.lightKey, this.lightState), h('div', { class: 'zh-battery' }, this.lightFill)));
    // Viñeta oscura (en calidad alta la pone el postproceso) y bordes rojos al estar herido.
    this.vignette = h('div', { class: 'zh-vignette', hidden: true });
    this.hurt = h('div', { class: 'zh-hurt' });
    // El Jefe: barra de vida arriba al centro.
    this.bossFill = h('i');
    this.bossBox = h('div', { class: 'zh-boss', hidden: true }, h('div', { class: 'zh-boss-name' }, 'El Jefe'), h('div', { class: 'zh-boss-meter' }, this.bossFill), h('small', {}, 'Lleva el código de la caja fuerte'));
    // Código de la caja fuerte (cuando el Jefe ya cayó y la caja sigue cerrada).
    this.codeVal = h('strong', {}, '');
    this.codeBox = h('div', { class: 'zh-code', hidden: true }, h('small', {}, 'Código de la caja fuerte'), this.codeVal);
    this.root = h('div', { class: 'zh-root' }, this.vignette, this.hurt, this.arrowLayer, this.panel, this.cashBox, this.barBox, this.side, this.lightBox, this.bossBox, this.codeBox, this.banner, this.prompt);
    layer.append(this.root);
    this.cache = new Map();
    this.buildKeypad(layer);
  }

  // Teclado de la caja fuerte. onKeypad(tecla): '0'-'9', 'back', 'ok' o 'close' (lo pone el modo).
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
    // Encima de los controles táctiles (que tapan el HUD): en la raíz de la app.
    (layer.closest('#app') ?? layer).append(this.keypad);
  }

  /** state = { entry, msg, tone: '' | 'bad' | 'good', help } o null para cerrarlo. */
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

  // "+N" que sube junto a los puntos (se reinicia la animación con cada ganancia).
  popGain(n) {
    this.gain.textContent = `+${fmt(n)}`;
    this.gain.classList.remove('show');
    void this.gain.offsetWidth;
    this.gain.classList.add('show');
  }

  // p = { key, text, price, ok } o null para ocultarlo. ok = false: no alcanzan los puntos.
  setPrompt(p) {
    this.set('pShow', this.prompt, !p, 'hidden');
    if (!p) return;
    this.set('pKey', this.pKey, p.key ?? '', 'textContent');
    this.set('pKeyHide', this.pKey, !p.key, 'hidden');
    this.set('pText', this.pText, p.text);
    this.set('pPrice', this.pPrice, p.price ? `${fmt(p.price)} pts` : '');
    this.prompt.classList.toggle('poor', p.poor ?? (p.ok === false && !!p.price));
  }

  banner_(title, sub) {
    const show = !!title;
    this.set('bShow', this.banner, !show, 'hidden');
    if (!show) return;
    this.set('bTitle', this.bTitle, title);
    this.set('bSub', this.bSub, sub ?? '');
  }

  update(game, run, mode) {
    this.updateLight(game, mode.flashlight);
    const wave = String(Math.max(1, run.wave || mode.nextWave));
    if (this.cache.get('wave') !== wave) {
      this.set('wave', this.waveNum, wave);
      // El número de la oleada late al cambiar (como una marca nueva en la pared).
      this.waveNum.classList.remove('pop');
      void this.waveNum.offsetWidth;
      this.waveNum.classList.add('pop');
    }
    this.set('power', this.powerTag, game.world.powered !== false, 'hidden');
    this.set('vignette', this.vignette, game.engine.detail === 'alta', 'hidden');
    const hurt = Math.max(0, Math.min(1, (0.5 - run.health / run.maxHealth) / 0.4));
    this.set('hurt', this.hurt, hurt.toFixed(2), '__o');
    if (this.hurt.style.opacity !== hurt.toFixed(2)) this.hurt.style.opacity = hurt.toFixed(2);
    const left = run.remaining;
    const idle = mode.state === 'countdown' ? 'Preparación' : 'Descanso';
    this.set('left', this.left, run.state === 'wave' ? `${left} ${left === 1 ? 'zombi' : 'zombis'}` : idle);
    this.set('tag', this.tag, !(run.state === 'wave' && run.cfg?.runnerNight), 'hidden');
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
    // Granada elegida y cuántas quedan de ese tipo (y del resto).
    const type = game.grenades.type;
    const bag = mode.grenadeBag;
    const others = Object.entries(bag).filter(([t, n]) => t !== type && n > 0).map(([t, n]) => `${GRENADE_TYPES[t].name.slice(0, 4)}. ×${n}`);
    const keys = game.touchMode ? '' : `  ·  ${keyLabel(game.settings.keys, 'grenade')} / ${keyLabel(game.settings.keys, 'grenadeNext')}`;
    this.set('nades', this.grenades, `${GRENADE_TYPES[type].name} ×${bag[type] ?? 0}${others.length ? ` (${others.join(', ')})` : ''}${keys}`);
    // Bebidas tomadas.
    const perks = [...run.perks].join('|');
    if (this.cache.get('perks') !== perks) {
      this.cache.set('perks', perks);
      this.perks.replaceChildren(...[...run.perks].map((id) => h('span', { class: 'zh-perk', style: { '--c': PERKS[id].color }, title: PERKS[id].desc }, PERKS[id].name)));
    }

    // Potenciadores activos (con su tiempo).
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

    // Cartel central según el estado del modo.
    if (mode.state === 'countdown') this.banner_('Prepárate', `La horda llega en ${Math.ceil(mode.timer)}`);
    else if (mode.state === 'intermission') {
      const shop = game.touchMode ? 'Toca «Armería»' : `${keyLabel(game.settings.keys, 'interact')}: armería`;
      // Pausa entre rondas: el cartel anuncia la que viene.
      this.banner_(`Ronda ${run.wave + 1}`, `Ronda ${run.wave} superada · empieza en ${Math.ceil(mode.timer)} s · ${shop}`);
    } else if (mode.state === 'wave' && mode.waveBannerT > 0) this.banner_(`Ronda ${run.wave}`, run.cfg?.runnerNight ? 'Noche de corredores: vienen rápido' : `${run.cfg?.count ?? ''} zombis`);
    else this.banner_(null);

    this.updateBoss(run);
    this.updateArrows(game, run);
  }

  // Barra de vida del Jefe (mientras vive) y el código de la caja fuerte (cuando lo soltó).
  updateBoss(run) {
    const b = run.boss;
    this.set('bossShow', this.bossBox, !b, 'hidden');
    if (b) {
      const pct = `${Math.max(0, Math.round((b.hp / b.maxHp) * 100))}%`;
      this.set('bossFill', this.bossFill, pct, '__w');
      if (this.bossFill.style.width !== pct) this.bossFill.style.width = pct;
    }
    const s = run.safe;
    const showCode = !!s && s.known && !s.unlocked;
    this.set('codeShow', this.codeBox, !showCode, 'hidden');
    if (showCode) this.set('codeVal', this.codeVal, s.code.split('').join(' '));
  }

  // Estado de la linterna: prendida (amarilla), apagada (gris), batería baja (roja, late) o vacía.
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

  // Flechas alrededor de la mira hacia los zombis cercanos que no se ven.
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
      const angle = game.angleTo(p); // + = a la izquierda
      const el = this.arrows[n++];
      el.hidden = false;
      el.style.transform = `translate(-50%, -50%) rotate(${-angle}rad) translateY(-120px)`;
      el.style.opacity = String(0.45 + 0.55 * (1 - d / THREAT_RANGE));
    }
    for (let i = n; i < MAX_ARROWS; i++) if (!this.arrows[i].hidden) this.arrows[i].hidden = true;
  }

  dispose() {
    this.root.remove();
    this.keypad.remove();
  }
}
