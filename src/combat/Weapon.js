import * as THREE from 'three';
import { DEG } from '../utils/math.js';
import { ALL_WEAPONS, DEFAULT_WEAPON, WEAPONS, getWeapon } from './weapons.js';

export const RIFLE = WEAPONS.rifle;

const MAX_TRACERS_PER_SHOT = 5;
const DRY_FIRE_COOLDOWN = 0.25;
const PART_RANK = { head: 3, body: 2, legs: 1 };
const PROP_IMPULSE = 0.035;

const _dir = new THREE.Vector3();
const _shot = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _end = new THREE.Vector3();
const _muzzle = new THREE.Vector3();
const _ray = new THREE.Vector3();
const _ndc = new THREE.Vector2();
const MUZZLE_DEPTH = 0.7;

function jitter(out, deg, right, up) {
  if (deg <= 0) return out;
  const a = Math.random() * Math.PI * 2;
  const r = Math.tan(deg * Math.sqrt(Math.random()) * DEG);
  return out.addScaledVector(right, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r).normalize();
}

export class Weapon {
  constructor(game) {
    this.game = game;
    this.stats = getWeapon(DEFAULT_WEAPON);
    this.enabled = false;
    this.scoped = false;
    this.cooldown = 0;
    this.bloom = 0;
    this.reloadLeft = 0;
    this.drawLeft = 0;
    this.aiming = false;
    this.reserveBy = null;
    this.reloadMul = 1;
    this.rateMul = 1;
    this.magazineBy = null;
    this.infinite = false;
    this.mode = 'semi';
    this.burstLeft = 0;
    this.ammoBy = Object.fromEntries(ALL_WEAPONS.map((id) => [id, WEAPONS[id].magazine]));
    this.onShot = null;
    this.onChange = null;
  }

  get id() {
    return this.stats.id;
  }

  get ammo() {
    return this.ammoBy[this.stats.id];
  }

  set ammo(v) {
    this.ammoBy[this.stats.id] = v;
  }

  get reloading() {
    return this.reloadLeft > 0;
  }

  get drawing() {
    return this.drawLeft > 0;
  }

  get reloadProgress() {
    return this.reloading ? 1 - this.reloadLeft / (this.stats.reloadTime * this.reloadMul) : null;
  }

  get canToggleMode() {
    return this.stats.fireModes.length > 1;
  }

  get auto() {
    return this.mode === 'auto';
  }

  set auto(v) {
    this.mode = v ? 'auto' : this.stats?.fireModes.includes('semi') ? 'semi' : this.stats?.fireModes[0] ?? 'semi';
  }

  setWeapon(id, { force = false } = {}) {
    const next = getWeapon(id);
    if (next === this.stats && !force) return false;
    this.cancelReload();
    this.stats = next;
    this.mode = next.fireModes[0];
    this.burstLeft = 0;
    this.bloom = 0;
    this.cooldown = 0;
    this.scoped = false;
    this.drawLeft = next.drawTime;
    this.game.viewmodel.setWeapon(next.id);
    this.game.viewmodel.startDraw(next.drawTime);
    this.game.sfx.draw?.();
    this.onChange?.();
    return true;
  }

  setMode(auto) {
    const modes = this.stats.fireModes;
    const want = auto ? 'auto' : 'semi';
    this.mode = modes.includes(want) ? want : modes[0];
    this.burstLeft = 0;
    this.bloom = 0;
    this.onChange?.();
    return this.auto;
  }

  toggleMode() {
    if (!this.canToggleMode) return null;
    const modes = this.stats.fireModes;
    this.mode = modes[(modes.indexOf(this.mode) + 1) % modes.length];
    this.burstLeft = 0;
    this.bloom = 0;
    this.onChange?.();
    return this.auto;
  }

  get modeLabel() {
    return { auto: 'AUTO', semi: 'SEMI', burst: 'RÁFAGA' }[this.mode] ?? 'SEMI';
  }

  refill() {
    for (const id of ALL_WEAPONS) this.ammoBy[id] = this.magazineOf(id);
    this.reloadLeft = 0;
    this.cooldown = 0;
    this.drawLeft = 0;
    this.game.viewmodel.cancelReload();
  }

  cancelReload() {
    if (!this.reloading) return;
    this.reloadLeft = 0;
    this.game.viewmodel.cancelReload();
  }

  get reserve() {
    const r = this.reserveBy?.[this.stats.id];
    return r === undefined || r === null ? Infinity : r;
  }

  set reserve(v) {
    if (this.reserveBy) this.reserveBy[this.stats.id] = v;
  }

  magazineOf(id) {
    return Math.round(WEAPONS[id].magazine * (this.magazineBy?.[id] ?? 1));
  }

  get magazine() {
    return this.magazineOf(this.stats.id);
  }

  reload() {
    if (this.infinite || this.reloading || this.drawing || this.ammo >= this.magazine) return;
    if (this.reserve <= 0) {
      this.game.hud.flash('Sin munición de reserva', 'bad');
      return;
    }
    this.reloadLeft = this.stats.reloadTime * this.reloadMul;
    this.scoped = false;
    this.game.sfx.reloadStart();
    this.game.viewmodel.startReload(this.stats.reloadTime * this.reloadMul);
  }

  trigger(time = performance.now()) {
    if (!this.enabled || this.auto) return;
    if (this.mode === 'burst') {
      if (this.burstLeft > 0 || this.cooldown > 0) return;
      this.burstLeft = this.stats.burst ?? 3;
      this.burstFire(time);
      return;
    }
    this.tryFire(time);
  }

  burstFire(time = performance.now()) {
    if (!this.tryFire(time)) {
      this.burstLeft = 0;
      return;
    }
    this.burstLeft--;
    if (this.burstLeft === 0) this.cooldown += this.stats.burstDelay ?? 0.25;
  }

  update(dt) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.burstLeft > 0 && this.cooldown <= 0) {
      if (this.enabled) this.burstFire();
      else this.burstLeft = 0;
    }
    this.bloom = Math.max(0, this.bloom - dt * this.stats.bloomRecovery);
    this.drawLeft = Math.max(0, this.drawLeft - dt);
    if (this.reloading) {
      this.reloadLeft -= dt;
      if (this.reloadLeft <= 0) {
        this.reloadLeft = 0;
        const take = Math.min(this.magazine - this.ammo, this.reserve);
        this.ammo += take;
        if (Number.isFinite(this.reserve)) this.reserve -= take;
        this.game.sfx.reloadEnd();
      }
    }
    if (this.enabled && this.auto && this.game.input.mouseDown) this.tryFire(performance.now());
  }

  tryFire(time) {
    if (this.cooldown > 0 || this.reloading || this.drawing || this.game.melee?.busy || this.game.grenades?.busy) return false;
    if (this.infinite) {
      this.ammo = this.magazine;
    } else if (this.ammo <= 0) {
      this.cooldown = DRY_FIRE_COOLDOWN;
      this.game.sfx.dryFire();
      if (this.reserve <= 0) this.game.hud.flash('Sin munición: cambia de arma o busca munición', 'bad');
      else if (this.game.settings.gameplay.autoReload) this.reload();
      else this.game.hud.flash('Sin balas · R para recargar', 'bad');
      return false;
    }
    this.cooldown = 1 / (this.stats.rps * this.rateMul);
    if (!this.infinite) this.ammo--;
    this.fire(time);
    return true;
  }

  currentSpread() {
    const g = this.game;
    const s = this.stats;
    const move = g.settings.gameplay.moveInaccuracy ? g.player.inaccuracy * s.moveSpread : 0;
    const hip = s.zoom && !this.scoped ? s.hipSpread : 0;
    return (this.bloom + move) * this.aimFactor + hip;
  }

  get aimFactor() {
    return this.aiming && this.stats.ads ? this.stats.ads.spread : 1;
  }

  muzzlePoint(out) {
    const g = this.game;
    const cam = g.engine.camera;
    if (!g.viewmodel.muzzleNdc || !g.engine.showOverlay) return out.set(0.16, -0.14, -0.6).applyMatrix4(cam.matrixWorld);
    g.viewmodel.muzzleNdc(_ndc);
    _ray.set(_ndc.x, _ndc.y, 0.5).unproject(cam).sub(cam.position).normalize();
    return out.copy(cam.position).addScaledVector(_ray, MUZZLE_DEPTH);
  }

  fire(time = performance.now()) {
    const g = this.game;
    const s = this.stats;
    const cam = g.engine.camera;
    const spread = this.currentSpread();
    const targets = g.mode?.hitMeshes?.() ?? [];

    _dir.set(0, 0, -1).applyQuaternion(cam.quaternion);
    _right.set(1, 0, 0).applyQuaternion(cam.quaternion);
    _up.set(0, 1, 0).applyQuaternion(cam.quaternion);
    jitter(_dir, spread, _right, _up);

    const byBot = new Map();
    let firstHit = null;
    this.muzzlePoint(_muzzle);
    for (let i = 0; i < s.pellets; i++) {
      _shot.copy(_dir);
      jitter(_shot, s.pelletSpread * this.aimFactor, _right, _up);
      const hit = g.ballistics.cast(cam.position, _shot, targets);
      if (hit) _end.copy(hit.point);
      else _end.copy(cam.position).addScaledVector(_shot, 200);
      if (g.settings.gameplay.tracers && i < MAX_TRACERS_PER_SHOT) g.effects.tracer(_muzzle, _end, 'player');
      if (hit?.bot) {
        g.effects.burst(hit.point, hit.normal, hit.part === 'head' ? '#ffffff' : '#ffb26b', s.pellets > 1 ? 4 : 10, 3.5);
        const entry = byBot.get(hit.bot) ?? { count: 0, best: hit };
        entry.count++;
        if ((PART_RANK[hit.part] ?? 0) > (PART_RANK[entry.best.part] ?? 0)) entry.best = hit;
        byBot.set(hit.bot, entry);
      } else if (hit?.prop) {
        g.world?.props?.hit(hit.prop, hit.point, _shot, PROP_IMPULSE * s.damage.body);
        if (i < MAX_TRACERS_PER_SHOT) g.effects.burst(hit.point, hit.normal, '#d8c9a8', s.pellets > 1 ? 3 : 6, 2.5);
      } else if (hit?.object?.userData.bottle) {
      } else if (hit) {
        g.effects.decal(hit.point, hit.normal);
        if (i < MAX_TRACERS_PER_SHOT) g.effects.burst(hit.point, hit.normal, '#c9c2b4', s.pellets > 1 ? 3 : 6, 2.5);
      }
      firstHit ??= hit;
    }

    let result = firstHit;
    let most = 0;
    for (const { count, best } of byBot.values()) {
      if (count > most) {
        most = count;
        result = { ...best, pelletHits: count };
      }
    }

    if (this.auto || !s.fireModes.includes('auto')) this.bloom = Math.min(s.maxBloom, this.bloom + s.bloomPerShot);

    g.sfx.shot(s.sound, s.soundRate ?? 1);
    g.viewmodel.kick(s.recoil);
    if (g.settings.gameplay.casings !== false) g.casings?.eject(s.id);
    this.onShot?.(result, spread, time);
  }
}
