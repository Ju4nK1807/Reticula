import * as THREE from 'three';
import { DEG } from '../utils/math.js';

// Rifle genérico: un tiro a la cabeza mata, al cuerpo hacen falta 3, a las piernas 3.
export const RIFLE = {
  name: 'Rifle',
  rps: 9.75,
  magazine: 25,
  reloadTime: 2.2,
  damage: { head: 150, body: 40, legs: 34 },
};

const MAX_BLOOM = 2.2; // grados extra al mantener el disparo automático

const _dir = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _end = new THREE.Vector3();
const _muzzle = new THREE.Vector3();

// Disparo hitscan desde el centro de la cámara, con desviación por movimiento y por ráfaga,
// cargador limitado y recarga. El modo activo recibe cada disparo en `onShot(hit)`.
export class Weapon {
  constructor(game) {
    this.game = game;
    this.stats = RIFLE;
    this.auto = false;
    this.enabled = false;
    this.cooldown = 0;
    this.bloom = 0;
    this.ammo = RIFLE.magazine;
    this.reloadLeft = 0;
    this.onShot = null;
  }

  get reloading() {
    return this.reloadLeft > 0;
  }

  // Progreso de la recarga 0-1, o null si no está recargando.
  get reloadProgress() {
    return this.reloading ? 1 - this.reloadLeft / this.stats.reloadTime : null;
  }

  setMode(auto) {
    this.auto = auto;
    this.bloom = 0;
  }

  // Cargador lleno al empezar cada fase.
  refill() {
    this.ammo = this.stats.magazine;
    this.reloadLeft = 0;
    this.cooldown = 0;
    this.game.viewmodel.cancelReload();
  }

  reload() {
    if (this.reloading || this.ammo >= this.stats.magazine) return;
    this.reloadLeft = this.stats.reloadTime;
    this.game.sfx.reloadStart();
    this.game.viewmodel.startReload(this.stats.reloadTime);
  }

  trigger() {
    if (this.enabled && !this.auto) this.tryFire();
  }

  update(dt) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.bloom = Math.max(0, this.bloom - dt * 5);
    if (this.reloading) {
      this.reloadLeft -= dt;
      if (this.reloadLeft <= 0) {
        this.reloadLeft = 0;
        this.ammo = this.stats.magazine;
        this.game.sfx.reloadEnd();
      }
    }
    if (this.enabled && this.auto && this.game.input.mouseDown) this.tryFire();
  }

  tryFire() {
    if (this.cooldown > 0 || this.reloading) return;
    if (this.ammo <= 0) {
      // Cargador vacío: "clic" en seco y, si está activada, recarga automática.
      this.cooldown = 0.25;
      this.game.sfx.dryFire();
      if (this.game.settings.gameplay.autoReload) this.reload();
      else this.game.hud.flash('Sin balas · R para recargar', 'bad');
      return;
    }
    this.cooldown = 1 / this.stats.rps;
    this.ammo--;
    this.fire();
  }

  currentSpread() {
    const g = this.game;
    return this.bloom + (g.settings.gameplay.moveInaccuracy ? g.player.inaccuracy : 0);
  }

  fire() {
    const g = this.game;
    const cam = g.engine.camera;
    const spread = this.currentSpread();

    _dir.set(0, 0, -1).applyQuaternion(cam.quaternion);
    if (spread > 0) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.tan(spread * Math.sqrt(Math.random()) * DEG);
      _right.set(1, 0, 0).applyQuaternion(cam.quaternion);
      _up.set(0, 1, 0).applyQuaternion(cam.quaternion);
      _dir.addScaledVector(_right, Math.cos(a) * r).addScaledVector(_up, Math.sin(a) * r).normalize();
    }
    if (this.auto) this.bloom = Math.min(MAX_BLOOM, this.bloom + 0.3);

    const hit = g.ballistics.cast(cam.position, _dir, g.mode?.hitMeshes?.() ?? []);
    if (hit) _end.copy(hit.point);
    else _end.copy(cam.position).addScaledVector(_dir, 200);

    g.sfx.shot();
    g.viewmodel.kick();
    _muzzle.set(0.16, -0.14, -0.6).applyMatrix4(cam.matrixWorld);
    if (g.settings.gameplay.tracers) g.effects.tracer(_muzzle, _end, 'player');
    if (hit && hit.bot) g.effects.burst(hit.point, hit.normal, hit.part === 'head' ? '#ffffff' : '#ffb26b', 10, 3.5);
    else if (hit) {
      g.effects.decal(hit.point, hit.normal);
      g.effects.burst(hit.point, hit.normal, '#c9c2b4', 6, 2.5);
    }

    this.onShot?.(hit, spread);
  }
}
