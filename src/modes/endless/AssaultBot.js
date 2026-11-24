import * as THREE from 'three';
import { Bot } from '../../bots/Bot.js';
import { rand } from '../../utils/math.js';

const ARRIVE_DIST = 0.15;
const PATH_STEP = 0.5;
const STUCK_TIME = 1.5;
const MIN_PLAYER_DIST = 6;
const ADVANCE_DIST = [3, 7];
const ADVANCE_SPREAD = 1.0;
const ADVANCE_TRIES = 14;
const RETRY_ENGAGE = [1, 2];

const _dir = new THREE.Vector3();
const _next = new THREE.Vector3();

export class AssaultBot extends Bot {
  constructor(parent, world, opts) {
    super(parent, world, opts);
    const b = this.behavior;
    b.assault = true;
    this.walkTo(opts.behavior.entry.clone(), 'enter');
  }

  update(dt, ctx) {
    if (this.alive) this.updateAssault(dt, ctx);
    super.update(dt, ctx);
  }

  walkTo(target, phase) {
    const b = this.behavior;
    b.type = 'assault';
    b.phase = phase;
    b.target = target;
    b.stuckT = 0;
    b.bestDist = Infinity;
    this.crouchTarget = 0;
  }

  updateAssault(dt, ctx) {
    const b = this.behavior;
    if (b.phase === 'engage') {
      b.engageLeft -= dt;
      if (b.engageLeft <= 0) this.advance(ctx);
      return;
    }

    const p = this.group.position;
    _dir.subVectors(b.target, p).setY(0);
    const dist = _dir.length();
    if (dist <= ARRIVE_DIST) {
      this.engage();
      return;
    }
    const step = Math.min(dist, b.walkSpeed * dt);
    _next.copy(p).addScaledVector(_dir.divideScalar(dist), step);
    if (b.phase === 'enter' || this.world.isFree(_next.x, _next.z, this.radius, this.baseY)) {
      p.x = _next.x;
      p.z = _next.z;
    }
    if (dist < b.bestDist - 0.02) {
      b.bestDist = dist;
      b.stuckT = 0;
    } else if ((b.stuckT += dt) > STUCK_TIME) {
      this.engage();
    }
  }

  engage() {
    const b = this.behavior;
    b.phase = 'engage';
    b.engageLeft = rand(...b.engageTime);
    Object.assign(b, b.strafe);
    this.initStrafe(b);
  }

  advance(ctx) {
    const target = this.pickAdvance(ctx.playerPos);
    if (target) this.walkTo(target, 'advance');
    else this.behavior.engageLeft = rand(...RETRY_ENGAGE);
  }

  pickAdvance(player) {
    const p = this.group.position;
    const area = this.behavior.botArea;
    const toPlayer = Math.atan2(player.x - p.x, player.z - p.z);
    const close = Math.hypot(player.x - p.x, player.z - p.z) < MIN_PLAYER_DIST + 2;
    for (let i = 0; i < ADVANCE_TRIES; i++) {
      const a = close ? rand(0, Math.PI * 2) : toPlayer + rand(-ADVANCE_SPREAD, ADVANCE_SPREAD);
      const len = rand(...ADVANCE_DIST);
      const cand = new THREE.Vector3(p.x + Math.sin(a) * len, this.baseY, p.z + Math.cos(a) * len);
      if (cand.x < area.minX || cand.x > area.maxX || cand.z < area.minZ || cand.z > area.maxZ) continue;
      if (Math.hypot(player.x - cand.x, player.z - cand.z) < MIN_PLAYER_DIST) continue;
      if (!this.pathClear(p, cand)) continue;
      return cand;
    }
    return null;
  }

  pathClear(from, to) {
    const dist = Math.hypot(to.x - from.x, to.z - from.z);
    const steps = Math.max(1, Math.ceil(dist / PATH_STEP));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const x = from.x + (to.x - from.x) * t;
      const z = from.z + (to.z - from.z) * t;
      if (!this.world.isFree(x, z, this.radius, this.baseY)) return false;
    }
    return true;
  }
}
