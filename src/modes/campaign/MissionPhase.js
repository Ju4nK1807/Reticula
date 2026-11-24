import * as THREE from 'three';
import { Phase } from '../evaluation/Phase.js';
import { BOT_DIMENSIONS } from '../../bots/botModel.js';
import { botProfile } from './campaignData.js';
import { missionRating, starsFor } from './progress.js';
import { clock } from '../../utils/format.js';
import { DEG, rand } from '../../utils/math.js';

const FIRST_SPAWN = 0.8;
const SPAWN_GAP = [0.6, 1.6];
const ENCOUNTER_GAP = 1.4;
const MIXED_WEIGHTS = [
  ['peek', 0.45],
  ['strafe', 0.3],
  ['flick', 0.25],
];
const OPEN_TRIES = 60;
const MAX_YAW = 75;
const _head = new THREE.Vector3();

function pickWeighted(list) {
  let r = Math.random();
  for (const [v, w] of list) if ((r -= w) <= 0) return v;
  return list[0][0];
}

export class MissionPhase extends Phase {
  static info = { id: 'mission', name: 'Misión', desc: '', auto: false, health: true };

  constructor(mode, level) {
    super(mode);
    this.level = level;
    this.profile = botProfile(level.difficulty);
    this.duration = level.time;
    this.points = { head: 120, body: 50, legs: 30, kill: 100, miss: -30, escaped: -120 };
    this.encounters = level.encounters.map((e) => ({ ...e, spawned: 0 }));
    this.encIndex = 0;
    this.spawnTimer = FIRST_SPAWN;
    this.completed = false;
  }

  get total() {
    return this.level.total;
  }

  get encounter() {
    return this.encounters[this.encIndex] ?? null;
  }

  get remaining() {
    const pending = this.encounters.slice(this.encIndex).reduce((s, e) => s + (e.count - e.spawned), 0);
    return pending + this.bots.filter((b) => b.alive).length;
  }

  begin() {}

  update(dt) {
    super.update(dt);
    if (this.finished) return;
    const enc = this.encounter;
    if (!enc) return;
    const alive = this.bots.filter((b) => b.alive).length;
    this.spawnTimer -= dt;
    if (enc.spawned < enc.count && alive < enc.concurrent && this.spawnTimer <= 0) {
      this.spawn(enc);
      this.spawnTimer = rand(...SPAWN_GAP);
    }
    if (enc.spawned >= enc.count && alive === 0 && this.bots.length === 0) {
      this.encIndex++;
      this.spawnTimer = ENCOUNTER_GAP;
      if (!this.encounter) {
        this.completed = true;
        this.finished = true;
      }
    }
  }

  spawn(enc) {
    const type = enc.type === 'mixed' ? pickWeighted(MIXED_WEIGHTS) : enc.type;
    const ok = type === 'peek' ? this.spawnPeek(enc) : type === 'strafe' ? this.spawnStrafe() : this.spawnFlick();
    if (!ok) this.spawnFlick();
    enc.spawned++;
  }

  common() {
    const p = this.profile;
    return { scale: p.scale, shooter: { ...p.shooter } };
  }

  spawnFlick() {
    const position = this.openSpot({ minDist: 8, maxDist: 42, highChance: 0.25 });
    this.spawnBot({ ...this.common(), position, appear: true, lifetime: this.profile.flickLifetime, behavior: { type: 'static' } });
    return true;
  }

  spawnStrafe() {
    const position = this.openSpot({ minDist: 11, maxDist: 32, highChance: 0 });
    this.spawnBot({
      ...this.common(),
      position,
      appear: true,
      lifetime: this.profile.strafeLifetime,
      behavior: { type: 'strafe', ...this.profile.strafe },
    });
    return true;
  }

  spawnPeek(enc) {
    const p = this.profile;
    const areas = enc.areas ?? ['front'];
    const spot = this.pickCoverSpot(areas, p.scale);
    if (!spot) return false;
    const jiggles = Math.random() < p.jiggleChance ? 1 + Math.floor(Math.random() * 2) : 0;
    const then = spot.area !== 'high' && Math.random() < 0.5 ? 'strafe' : 'hide';
    this.spawnBot({
      ...this.common(),
      position: spot.hidden.clone(),
      lifetime: p.peekLifetime,
      behavior: {
        type: 'peek',
        spot,
        delay: rand(0.2, 0.9),
        outSpeed: p.peekSpeed,
        hold: p.hold,
        wide: Math.random() < p.wideChance,
        jiggles,
        then,
        strafe: { ...p.strafe },
      },
    });
    if (spot.area === 'flank' || spot.area === 'back') {
      this.game.sfx.cue(this.game.panFor(spot.exposed));
      this.game.hud.flash(spot.area === 'back' ? '¡Detrás!' : '¡Flanco!', 'bad');
    }
    return true;
  }

  openSpot({ minDist, maxDist, highChance }) {
    const w = this.world;
    const eye = this.game.player.eye;
    const a = w.openArea;
    const s = this.profile.scale;
    let fallback = null;
    for (let i = 0; i < OPEN_TRIES; i++) {
      const high = w.highSpots.length && Math.random() < highChance;
      const pos = high
        ? w.highSpots[Math.floor(Math.random() * w.highSpots.length)].clone()
        : new THREE.Vector3(rand(a.minX, a.maxX), 0, rand(a.minZ, a.maxZ));
      const dx = pos.x - eye.x;
      const dz = pos.z - eye.z;
      const dist = Math.hypot(dx, dz);
      if (dist < minDist || dist > maxDist) continue;
      if (Math.abs(Math.atan2(-dx, -dz) / DEG) > MAX_YAW) continue;
      if (!high && !w.isFree(pos.x, pos.z, 0.5 * s, 0, 1.8 * s)) continue;
      if (this.bots.some((b) => b.alive && b.position.distanceTo(pos) < 1.5)) continue;
      _head.set(pos.x, pos.y + BOT_DIMENSIONS.headCenter * s, pos.z);
      if (!this.game.ballistics.lineOfSight(eye, _head)) continue;
      fallback ??= pos;
      if (this.angleFromAim(_head) < 6) continue;
      return pos;
    }
    return fallback ?? new THREE.Vector3(0, 0, (a.minZ + a.maxZ) / 2);
  }

  hudStats() {
    return {
      score: Math.round(this.score),
      accLabel: 'Enemigos',
      accText: `${this.stats.kills}/${this.total}`,
      time: clock(Math.max(0, this.duration - this.elapsed)),
    };
  }

  results() {
    const r = {
      ...this.baseResults(),
      total: this.total,
      health: this.health,
      died: this.died,
      completed: this.completed,
      time: Math.min(this.elapsed, this.duration),
      timeLimit: this.duration,
      missed: this.total - this.stats.kills,
    };
    r.rating = missionRating(r);
    r.stars = starsFor(r.rating, this.level.goals, r.died);
    return r;
  }
}
