import { crosshairSVG } from './Crosshair.js';
import { WEAPONS } from '../combat/weapons.js';
import { weaponIconEl } from './weaponIcons.js';

export class HUD {
  constructor(el) {
    this.el = el;
    el.innerHTML = `
      <div class="hud-play">
        <div class="hud-scope" data-ref="scope" hidden><i></i><b></b></div>
        <div class="hud-vignette" data-ref="vignette"></div>
        <div class="hud-whiteout" data-ref="whiteout"></div>
        <div class="hud-dmgdir" data-ref="dmgdir"><i></i></div>
        <div class="hud-crosshair" data-ref="crosshair"></div>
        <div class="hud-hitmarker" data-ref="hitmarker"></div>
        <div class="hud-top">
          <div class="hud-stat"><span class="k" data-ref="scoreLabel">Puntos</span><span class="v" data-ref="score">0</span></div>
          <div class="hud-timer" data-ref="time">0:30</div>
          <div class="hud-stat right"><span class="k" data-ref="accLabel">Precisión</span><span class="v" data-ref="acc">—</span></div>
        </div>
        <div class="hud-label" data-ref="label"></div>
        <div class="hud-health" data-ref="health" hidden>
          <span class="cross">+</span><div class="bar"><i data-ref="healthFill"></i></div><span data-ref="healthText"></span>
        </div>
        <div class="hud-slots" data-ref="slots"></div>
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
    this.spread = null;
    this.setSpread(0);
  }

  setSpread(px) {
    const v = Math.round(px * 2) / 2;
    if (v === this.spread) return;
    this.spread = v;
    this.refs.crosshair.style.setProperty('--xh-spread', `${v}px`);
  }

  setScoped(on) {
    if (this.scoped === on) return;
    this.scoped = on;
    this.refs.scope.hidden = !on;
    this.updateCrosshairVisibility();
  }

  setAds(on) {
    if (this.ads === on) return;
    this.ads = on;
    this.updateCrosshairVisibility();
  }

  updateCrosshairVisibility() {
    this.refs.crosshair.style.visibility = this.scoped || this.ads ? 'hidden' : '';
  }

  setWeaponSlots(weapons, activeId, locked = false) {
    const key = `${activeId}|${locked}|${weapons.map((w) => `${w.id}:${w.key}`).join(',')}`;
    if (this.slotsKey === key) return;
    this.slotsKey = key;
    const el = this.refs.slots;
    el.classList.toggle('locked', locked);
    el.classList.toggle('many', weapons.length > 4);
    this.slotAmmo = new Map();
    el.replaceChildren(
      ...weapons.map((w) => {
        const slot = document.createElement('div');
        slot.className = `hud-slot${w.id === activeId ? ' active' : ''}`;
        slot.title = WEAPONS[w.id]?.name ?? w.id;
        const k = document.createElement('kbd');
        k.textContent = w.key;
        const ammo = document.createElement('span');
        ammo.className = 'hud-slot-ammo';
        this.slotAmmo.set(w.id, { el: ammo, text: '' });
        slot.append(k, weaponIconEl(w.id), ammo);
        return slot;
      }),
    );
  }

  setSlotAmmo(texts) {
    for (const [id, s] of this.slotAmmo ?? []) {
      const t = texts(id);
      if (t !== s.text) s.el.textContent = s.text = t;
    }
  }

  setLabel(text) {
    this.text('label', text);
  }

  setWeapon(text) {
    this.text('weapon', text);
  }

  setAmmo(ammo, magazine, reloadProgress, reserve = Infinity, infinite = false) {
    this.text('ammo', infinite ? '∞' : ammo);
    this.text('mag', infinite ? 'sin recarga' : Number.isFinite(reserve) ? `/ ${reserve}` : `/ ${magazine}`);
    this.refs.ammoBox.classList.toggle('low', !infinite && ammo <= Math.ceil(magazine * 0.2));
    this.refs.ammoBox.classList.toggle('empty', !infinite && ammo === 0);
    const reloading = reloadProgress !== null;
    this.refs.reload.hidden = !reloading;
    if (reloading) this.refs.reloadFill.style.width = `${Math.round(reloadProgress * 100)}%`;
  }

  setStats({ score, scoreLabel = 'Puntos', accLabel, accText, time }) {
    this.text('scoreLabel', scoreLabel);
    this.text('score', score);
    const showAcc = accLabel !== null;
    if (this.refs.acc.parentElement.hidden === showAcc) this.refs.acc.parentElement.hidden = !showAcc;
    if (showAcc) {
      this.text('accLabel', accLabel);
      this.text('acc', accText);
    }
    this.text('time', time);
  }

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

  setFps({ fps, ms, low1 }) {
    this.text('fps', `${fps} FPS · ${ms} ms · 1% low ${low1}`);
  }

  restartAnimation(el, className) {
    el.classList.remove(className);
    void el.offsetWidth;
    el.classList.add(className);
  }

  hitmarker(kind = 'hit') {
    const el = this.refs.hitmarker;
    el.dataset.kind = kind;
    this.restartAnimation(el, 'show');
  }

  whiteout(k) {
    const el = this.refs.whiteout;
    el.style.setProperty('--k', String(Math.min(1, Math.max(0, k))));
    this.restartAnimation(el, 'show');
  }

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
