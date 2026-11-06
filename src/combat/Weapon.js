import * as THREE from 'three';
import { DEG } from '../utils/math.js';
import { DEFAULT_WEAPON, WEAPONS, WEAPON_ORDER, getWeapon } from './weapons.js';

// Compatibilidad: el rifle sigue siendo el arma de referencia.
export const RIFLE = WEAPONS.rifle;

const MAX_TRACERS_PER_SHOT = 5; // la escopeta no satura el pool de trazadoras
const DRY_FIRE_COOLDOWN = 0.25;
const PART_RANK = { head: 3, body: 2, legs: 1 };

const _dir = new THREE.Vector3();
const _shot = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _end = new THREE.Vector3();
const _muzzle = new THREE.Vector3();

// Desvía `out` (unitario) un ángulo aleatorio dentro de un cono de `deg` grados (distribución uniforme).
function jitter(out, deg, right, up) {
  if (deg <= 0) return out;
  const a = Math.random() * Math.PI * 2;
  const r = Math.tan(deg * Math.sqrt(Math.random()) * DEG);
  return out.addScaledVector(right, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r).normalize();
}

/*
  Arma del jugador: disparo hitscan desde el centro de la cámara con dispersión (movimiento, ráfaga,
  disparo sin apuntar), perdigones, cargador por arma, recarga, desenfunde y mira telescópica.

  El modo recibe cada disparo en onShot(hit, spread, time):
  - hit: resultado de Ballistics.cast o null. Con perdigones, el impacto del objetivo que recibió más
    perdigones (y su mejor zona) con hit.pelletHits = cuántos le dieron. Phase multiplica el daño.
  - time: instante del clic (ms, misma base que performance.now()).
  onChange() avisa al cambiar de arma o de modo de disparo (HUD, mira).
*/
export class Weapon {
  constructor(game) {
    this.game = game;
    this.stats = getWeapon(DEFAULT_WEAPON);
    this.auto = false;
    this.enabled = false;
    this.scoped = false;
    this.cooldown = 0;
    this.bloom = 0;
    this.reloadLeft = 0;
    this.drawLeft = 0;
    this.ammoBy = Object.fromEntries(WEAPON_ORDER.map((id) => [id, WEAPONS[id].magazine]));
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

  // Progreso de la recarga 0-1, o null si no está recargando.
  get reloadProgress() {
    return this.reloading ? 1 - this.reloadLeft / this.stats.reloadTime : null;
  }

  get canToggleMode() {
    return this.stats.fireModes.length > 1;
  }

  // Cambia de arma (conserva la munición de cada una). `force` re-equipa aunque sea la misma.
  setWeapon(id, { force = false } = {}) {
    const next = getWeapon(id);
    if (next === this.stats && !force) return false;
    this.cancelReload();
    this.stats = next;
    this.auto = next.fireModes[0] === 'auto';
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

  // Fija el modo de disparo si el arma lo admite. Devuelve el modo efectivo.
  setMode(auto) {
    const modes = this.stats.fireModes;
    this.auto = auto ? modes.includes('auto') : !modes.includes('semi');
    this.bloom = 0;
    this.onChange?.();
    return this.auto;
  }

  toggleMode() {
    if (!this.canToggleMode) return null;
    return this.setMode(!this.auto);
  }

  // Todas las armas con el cargador lleno (al empezar una fase o partida).
  refill() {
    for (const id of WEAPON_ORDER) this.ammoBy[id] = WEAPONS[id].magazine;
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

  reload() {
    if (this.reloading || this.drawing || this.ammo >= this.stats.magazine) return;
    this.reloadLeft = this.stats.reloadTime;
    this.scoped = false;
    this.game.sfx.reloadStart();
    this.game.viewmodel.startReload(this.stats.reloadTime);
  }

  // Disparo semiautomático; `time` = timeStamp del clic.
  trigger(time = performance.now()) {
    if (this.enabled && !this.auto) this.tryFire(time);
  }

  update(dt) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.bloom = Math.max(0, this.bloom - dt * this.stats.bloomRecovery);
    this.drawLeft = Math.max(0, this.drawLeft - dt);
    if (this.reloading) {
      this.reloadLeft -= dt;
      if (this.reloadLeft <= 0) {
        this.reloadLeft = 0;
        this.ammo = this.stats.magazine;
        this.game.sfx.reloadEnd();
      }
    }
    if (this.enabled && this.auto && this.game.input.mouseDown) this.tryFire(performance.now());
  }

  tryFire(time) {
    if (this.cooldown > 0 || this.reloading || this.drawing) return;
    if (this.ammo <= 0) {
      // Cargador vacío: "clic" en seco y, si está activada, recarga automática.
      this.cooldown = DRY_FIRE_COOLDOWN;
      this.game.sfx.dryFire();
      if (this.game.settings.gameplay.autoReload) this.reload();
      else this.game.hud.flash('Sin balas · R para recargar', 'bad');
      return;
    }
    this.cooldown = 1 / this.stats.rps;
    this.ammo--;
    this.fire(time);
  }

  // Dispersión actual (grados): ráfaga + disparo sin apuntar + movimiento según el arma.
  currentSpread() {
    const g = this.game;
    const s = this.stats;
    const move = g.settings.gameplay.moveInaccuracy ? g.player.inaccuracy * s.moveSpread : 0;
    const hip = s.zoom && !this.scoped ? s.hipSpread : 0;
    return this.bloom + hip + move;
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

    // Cada perdigón: dispersión propia dentro del cono del arma, alrededor de la dirección del disparo.
    const byBot = new Map();
    let firstHit = null;
    _muzzle.set(0.16, -0.14, -0.6).applyMatrix4(cam.matrixWorld);
    for (let i = 0; i < s.pellets; i++) {
      _shot.copy(_dir);
      jitter(_shot, s.pelletSpread, _right, _up);
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
      } else if (hit) {
        g.effects.decal(hit.point, hit.normal);
        if (i < MAX_TRACERS_PER_SHOT) g.effects.burst(hit.point, hit.normal, '#c9c2b4', s.pellets > 1 ? 3 : 6, 2.5);
      }
      firstHit ??= hit;
    }

    // Resultado del disparo: el objetivo que más perdigones recibió (o lo primero que tocó).
    let result = firstHit;
    let most = 0;
    for (const { count, best } of byBot.values()) {
      if (count > most) {
        most = count;
        result = { ...best, pelletHits: count };
      }
    }

    // La ráfaga abre la dispersión en automático y en las armas que solo son semiautomáticas
    // (pistola). El rifle en semiautomático no acumula, como siempre.
    if (this.auto || !s.fireModes.includes('auto')) this.bloom = Math.min(s.maxBloom, this.bloom + s.bloomPerShot);

    g.sfx.shot(s.sound);
    g.viewmodel.kick(s.recoil);
    this.onShot?.(result, spread, time);
  }
}
