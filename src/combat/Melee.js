import * as THREE from 'three';
import { DEG } from '../utils/math.js';

/*
  Golpe cuerpo a cuerpo (tecla V o botón táctil): un golpe rápido con el arma.

  - Alcance corto (RANGE) en un abanico de rayos delante de la cámara: acierta aunque el enemigo no
    esté justo en el centro.
  - El impacto se resuelve en el momento del golpe (HIT_AT), no al pulsar: se siente físico.
  - Cancela la recarga y bloquea el disparo mientras dura (busy).
  - Solo funciona en los modos que lo permiten (mode.meleeAllowed()); la evaluación no, para no
    cambiar los rangos. El modo recibe el impacto en mode.onMeleeHit(hit, damage).
*/

export const MELEE = {
  damage: 140, // mata a un bot de un golpe; un zombi normal necesita dos
  range: 2.3, // m
  duration: 0.55, // s de la animación (y del bloqueo)
  hitAt: 0.13, // s: momento del impacto
  cooldown: 0.65, // s entre golpes
  fan: [-22, -11, 0, 11, 22], // grados: abanico de rayos (horizontal)
};

const _dir = new THREE.Vector3();
const _q = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);

export class Melee {
  constructor(game) {
    this.game = game;
    this.t = -1; // tiempo desde el inicio del golpe (-1 = sin golpe)
    this.cooldown = 0;
    this.resolved = false;
  }

  get busy() {
    return this.t >= 0 && this.t < MELEE.duration;
  }

  get allowed() {
    const m = this.game.mode;
    return !!m && !!m.meleeAllowed?.() && this.game.playing;
  }

  // Pulsar V: empieza el golpe si se puede.
  trigger() {
    if (!this.allowed || this.busy || this.cooldown > 0) return false;
    const g = this.game;
    g.weapon.cancelReload();
    g.weapon.aiming = false;
    this.t = 0;
    this.resolved = false;
    this.cooldown = MELEE.cooldown;
    g.viewmodel.melee(MELEE.duration);
    g.sfx.swing();
    return true;
  }

  update(dt) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.t < 0) return;
    this.t += dt;
    if (!this.resolved && this.t >= MELEE.hitAt) {
      this.resolved = true;
      this.resolve();
    }
    if (this.t >= MELEE.duration) this.t = -1;
  }

  // Abanico de rayos cortos: el primer enemigo que toque cualquiera de ellos (el más cercano).
  resolve() {
    const g = this.game;
    const cam = g.engine.camera;
    const targets = g.mode?.hitMeshes?.() ?? [];
    let best = null;
    for (const deg of MELEE.fan) {
      _q.setFromAxisAngle(UP, deg * DEG);
      _dir.set(0, 0, -1).applyQuaternion(cam.quaternion).applyQuaternion(_q);
      const hit = g.ballistics.cast(cam.position, _dir, targets, MELEE.range);
      if (hit?.bot && (!best || hit.distance < best.distance)) best = hit;
    }
    if (!best) return;
    g.sfx.meleeHit();
    g.effects.burst(best.point, best.normal, '#ffb26b', 8, 3);
    g.mode?.onMeleeHit?.(best, MELEE.damage);
  }

  reset() {
    this.t = -1;
    this.cooldown = 0;
  }
}
