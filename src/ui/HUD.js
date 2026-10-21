import { crosshairSVG } from './Crosshair.js';

// HUD en DOM. Solo toca el DOM cuando un valor cambia, para no costar FPS.
export class HUD {
  constructor(el) {
    this.el = el;
    el.innerHTML = `
      <div class="hud-play">
        <div class="hud-vignette" data-ref="vignette"></div>
        <div class="hud-dmgdir" data-ref="dmgdir"><i></i></div>
        <div class="hud-crosshair" data-ref="crosshair"></div>
        <div class="hud-hitmarker" data-ref="hitmarker"></div>
        <div class="hud-top">
          <div class="hud-stat"><span class="k">Puntos</span><span class="v" data-ref="score">0</span></div>
          <div class="hud-timer" data-ref="time">0:30</div>
          <div class="hud-stat right"><span class="k" data-ref="accLabel">Precisión</span><span class="v" data-ref="acc">—</span></div>
        </div>
        <div class="hud-label" data-ref="label"></div>
        <div class="hud-health" data-ref="health" hidden>
          <span class="cross">+</span><div class="bar"><i data-ref="healthFill"></i></div><span data-ref="healthText"></span>
        </div>
        <div class="hud-ammo-box" data-ref="ammoBox">
          <div class="hud-weapon" data-ref="weapon"></div>
          <div class="hud-ammo"><span data-ref="ammo">25</span><small data-ref="mag">/ 25</small></div>
          <div class="hud-reload" data-ref="reload" hidden><div class="bar"><i data-ref="reloadFill"></i></div><span>Recargando</span></div>
        </div>
        <div class="hud-flash" data-ref="flash"></div>
        <div class="hud-brief" data-ref="brief" hidden></div>
      </div>
      <div class="hud-fps" data-ref="fps"></div>`;

    this.refs = {};
    el.querySelectorAll('[data-ref]').forEach((n) => (this.refs[n.dataset.ref] = n));
    this.cache = new Map();
    this.briefKey = null;
    this.setVisible(false);
  }

  text(ref, value) {
    const v = String(value);
    if (this.cache.get(ref) === v) return;
    this.cache.set(ref, v);
    this.refs[ref].textContent = v;
  }

  setVisible(visible) {
    this.refs.crosshair.parentElement.hidden = !visible;
  }

  setCrosshair(config) {
    this.refs.crosshair.innerHTML = crosshairSVG(config);
  }

  setLabel(text) {
    this.text('label', text);
  }

  setWeapon(text) {
    this.text('weapon', text);
  }

  // reloadProgress: 0-1 mientras recarga, null si no.
  setAmmo(ammo, magazine, reloadProgress) {
    this.text('ammo', ammo);
    this.text('mag', `/ ${magazine}`);
    this.refs.ammoBox.classList.toggle('low', ammo <= Math.ceil(magazine * 0.2));
    this.refs.ammoBox.classList.toggle('empty', ammo === 0);
    const reloading = reloadProgress !== null;
    this.refs.reload.hidden = !reloading;
    if (reloading) this.refs.reloadFill.style.width = `${Math.round(reloadProgress * 100)}%`;
  }

  setStats({ score, accLabel, accText, time }) {
    this.text('score', score);
    this.text('accLabel', accLabel);
    this.text('acc', accText);
    this.text('time', time);
  }

  // value 0-1, o null para ocultar la barra de vida.
  setHealth(value) {
    const show = value !== null;
    this.refs.health.hidden = !show;
    if (!show) return;
    this.refs.healthFill.style.width = `${Math.round(value * 100)}%`;
    this.refs.health.classList.toggle('low', value <= 0.3);
    this.text('healthText', Math.round(value * 100));
  }

  showFps(on) {
    this.refs.fps.hidden = !on;
  }

  setFps(fps) {
    this.text('fps', `${fps} FPS`);
  }

  restartAnimation(el, className) {
    el.classList.remove(className);
    void el.offsetWidth;
    el.classList.add(className);
  }

  // kind: 'hit' | 'head' | 'kill'
  hitmarker(kind = 'hit') {
    const el = this.refs.hitmarker;
    el.dataset.kind = kind;
    this.restartAnimation(el, 'show');
  }

  // angle: radianes del atacante respecto a la mira (positivo = a la izquierda).
  damage(angle) {
    this.restartAnimation(this.refs.vignette, 'show');
    const dir = this.refs.dmgdir;
    dir.style.transform = `translate(-50%, -50%) rotate(${-angle}rad)`;
    this.restartAnimation(dir, 'show');
  }

  flash(message, kind = 'info') {
    const el = this.refs.flash;
    el.textContent = message;
    el.dataset.kind = kind;
    this.restartAnimation(el, 'show');
  }

  // Panel de instrucciones previo a cada fase; null lo oculta.
  brief(info) {
    const el = this.refs.brief;
    if (!info) {
      el.hidden = true;
      this.briefKey = null;
      return;
    }
    const key = `${info.name}|${info.count}|${info.prev}`;
    if (key === this.briefKey) return;
    this.briefKey = key;
    el.hidden = false;
    el.innerHTML = '';
    const add = (tag, cls, txt) => {
      const n = document.createElement(tag);
      n.className = cls;
      n.textContent = txt;
      el.append(n);
    };
    if (info.prev) add('div', 'prev', `✓ ${info.prev}`);
    add('div', 'step', info.step);
    add('h2', 'name', info.name);
    add('p', 'desc', info.desc);
    add('div', 'count', info.count);
  }
}
