import * as THREE from 'three';
import { DEG } from '../utils/math.js';

export const MELEE = {
  damage: 140,
  range: 2.3,
  duration: 0.55,
  hitAt: 0.13,
  cooldown: 0.65,
  fan: [-22, -11, 0, 11, 22],
};

const _dir = new THREE.Vector3();
const _q = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);

export class Melee {
  constructor(game) {
    this.game = game;
    this.t = -1;
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
