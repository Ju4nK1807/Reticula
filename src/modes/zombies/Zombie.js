import * as THREE from 'three';
import { acquireZombieSkin, loadZombieModel, releaseZombieSkin } from './zombieSkin.js';
import { pushCircleOut } from '../../physics/obb.js';
import { DEFENSE } from './zombieData.js';
import { BossBrain } from './bossBrain.js';

const RADIUS = 0.42;
const TURN = 5;
const STEER = 4.5;
const ACCEL = 5;
const DIRECT_RANGE = 2.6;
const LINE_EVERY = 0.2;
const SEPARATION = 1.1;
const ROAR_TIME = 1.6;
const RISE_TIME = 1.3;
const TEAR_EVERY = 1.1;
const BLEED = 0.14;
const DEATH_TIME = 2.2;
const SINK_TIME = 0.7;
const ATTACK_HIT_AT = 0.45;
const STAGGER_TIME = 0.32;
const LEGLESS_SPEED = 0.85;

const hitboxGeo = new THREE.BoxGeometry(1, 1, 1);
const hitboxMat = new THREE.MeshBasicMaterial({ visible: false });
const _dir = { x: 0, z: 0 };
const _near = { x: 0, z: 0 };
const _v = new THREE.Vector3();
const _head = new THREE.Vector3();

const UPRIGHT = [
  ['head', 0.28, 0.3, 0.3, 1.6, 0.17],
  ['body', 0.52, 0.62, 0.32, 1.16, 0.04],
  ['legs', 0.42, 0.86, 0.28, 0.44, 0],
];
const RUNNING = [
  ['head', 0.28, 0.3, 0.3, 1.4, 0.3],
  ['body', 0.52, 0.6, 0.34, 1.02, 0.14],
  ['legs', 0.42, 0.8, 0.3, 0.42, 0],
];
const CRAWLING = [
  ['head', 0.3, 0.3, 0.32, 0.42, 0.72],
  ['body', 0.52, 0.38, 0.95, 0.32, 0.12],
  ['legs', 0.46, 0.28, 0.8, 0.18, -0.72],
];

export class Zombie {
  constructor(run, stats, position) {
    this.run = run;
    this.stats = stats;
    this.type = stats.type;
    this.heavy = !!stats.heavy;
    this.opts = { behavior: {} };
    this.hp = stats.hp;
    this.maxHp = stats.hp;
    this.state = 'chase';
    this.escaped = false;
    this.t = 0;
    this.floorY = 0;
    this.attackT = 0;
    this.hitDone = false;
    this.staggerT = 0;
    this.flashT = 0;
    this.yaw = 0;
    this.speedNow = 0;
    this.moveSpeed = 0;
    this.heading = null;
    this.lineT = Math.random() * LINE_EVERY;
    this.lineClear = false;
    this.pace = 0.92 + Math.random() * 0.16;
    this.stunT = 0;
    this.headless = false;
    this.aggroT = 0;
    this.attackOn = 'player';
    this.entry = null;
    this.passed = false;
    this.tearT = 0;
    this.riseT = 0;
    this.scale = stats.height / 1.78;
    this.radius = RADIUS * this.scale;
    this.dieAnim = Math.random() < 0.5 ? 'die' : 'die2';
    this.attackAnim = 'attack';
    this.groanT = stats.heavy ? 0.2 : 1 + Math.random() * 4;
    this.legless = false;
    this.bleedT = 0;
    this.brain = stats.boss ? new BossBrain(this) : null;

    this.group = new THREE.Group();
    this.group.position.copy(position);
    this.hitMeshes = [];
    this.buildHitboxes(stats.low ? CRAWLING : stats.type === 'runner' ? RUNNING : UPRIGHT);
    run.root.add(this.group);
    this.group.updateMatrixWorld(true);

    this.skin = null;
    loadZombieModel().then((template) => {
      if (!template || this.disposed) return;
      this.skin = acquireZombieSkin(template, { height: stats.height, kind: stats.look ?? 'normal', bulk: stats.bulk ?? 1 });
      run.root.add(this.skin.root);
      this.syncSkin();
      if (this.headless) this.skin.decapitate();
      if (this.legless) this.skin.amputateLegs();
      this.skin.desync();
    });
  }

  buildHitboxes(layout) {
    for (const m of this.hitMeshes) m.removeFromParent();
    this.hitMeshes = [];
    this.layout = layout;
    this.headBox = null;
    for (const [part, w, h, d, y, z] of layout) {
      if (part === 'head' && this.headless) continue;
      const m = new THREE.Mesh(hitboxGeo, hitboxMat);
      m.scale.set(w * this.scale, h * this.scale, d * this.scale);
      m.position.set(0, y * this.scale, z * this.scale);
      m.userData.bot = this;
      m.userData.part = part;
      this.group.add(m);
      this.hitMeshes.push(m);
      if (part === 'head') this.headBox = m;
    }
  }

  get alive() {
    return this.state !== 'dying' && this.state !== 'gone';
  }

  get removable() {
    return this.state === 'gone';
  }

  get position() {
    return this.group.position;
  }

  chestPosition(out = _v) {
    const p = this.group.position;
    return out.set(p.x, p.y + this.layout[1][4] * this.scale, p.z);
  }

  headPosition(out = _v) {
    if (this.headBox) return this.headBox.getWorldPosition(out);
    const p = this.group.position;
    return out.set(p.x, p.y + this.layout[0][4] * this.scale, p.z);
  }

  bodyCollider(out) {
    const p = this.group.position;
    out.x = p.x;
    out.z = p.z;
    out.r = this.radius;
    out.y0 = p.y;
    out.h = (this.stats.low ? 0.6 : 1.8) * this.scale;
    return out;
  }

  damage(amount, part = 'body') {
    if (!this.alive) return { killed: false };
    this.hp -= amount;
    this.aggroT = DEFENSE.aggroTime;
    this.flashT = 0.07;
    if (this.hp <= 0) {
      this.state = 'dying';
      this.t = 0;
      this.run.onZombieDeath?.(this, part);
      return { killed: true };
    }
    const headHit = part === 'head' && !this.headless;
    if (!this.heavy && (amount >= this.maxHp * 0.35 || headHit) && this.state !== 'attack') {
      this.state = 'stagger';
      this.staggerT = STAGGER_TIME;
    }
    return { killed: false };
  }

  update(dt, ctx) {
    this.t += dt;
    this.flashT -= dt;
    this.aggroT -= dt;
    if (this.state === 'dying') return this.updateDeath(dt);
    if (this.state === 'gone') return;

    if (this.headless) {
      this.run.onBleed?.(this, this.maxHp * BLEED * dt);
      if (!this.alive) return this.updateDeath(dt);
      if ((this.bleedT -= dt) <= 0) {
        this.bleedT = 0.18 + Math.random() * 0.12;
        this.run.onNeckSpurt?.(this);
      }
    }

    const p = this.group.position;
    const player = ctx.playerPos;
    const pdx = player.x - p.x;
    const pdz = player.z - p.z;
    const dy = Math.abs((player.y ?? 0) - this.floorY);
    const dist = Math.hypot(pdx, pdz) + (dy > 1 ? dy * 4 : 0);
    this.distToPlayer = dist;
    const reach = this.stats.attackRange * Math.max(1, this.scale * 0.9);

    const obj = ctx.objective;
    const chasePlayer = !obj || dist < DEFENSE.aggroRange || (this.aggroT > 0 && dist < DEFENSE.aggroLeash);
    let dx = pdx;
    let dz = pdz;
    let tdist = dist;
    let nav = this.run.nav;
    if (!chasePlayer) {
      obj.bar.nearest(p.x, p.z, _near);
      dx = _near.x - p.x;
      dz = _near.z - p.z;
      tdist = obj.bar.distance(p.x, p.z);
      nav = obj.nav;
    }

    this.groanT -= dt;
    if (this.groanT <= 0) {
      this.groanT = (dist < 8 ? 2 : 4) + Math.random() * 4;
      this.run.onGroan?.(this, dist);
    }

    if (this.riseT > 0) {
      this.riseT = Math.max(0, this.riseT - dt);
      const k = 1 - this.riseT / RISE_TIME;
      p.y = -1.9 * this.scale * (1 - k * (2 - k));
      this.turnTowards(Math.atan2(dx, dz), dt);
      this.group.rotation.y = this.yaw;
      this.group.updateMatrixWorld(true);
      this.updateSkin(dt, 'attack');
      return;
    }

    if (this.brain?.update(dt, ctx, dist, pdx, pdz)) {
      this.separate(dt, ctx, 0.5);
      p.y = this.floorY = this.run.world?.floorAt?.(p.x, p.z, this.floorY) ?? 0;
      this.group.rotation.y = this.yaw;
      this.group.updateMatrixWorld(true);
      this.updateSkin(dt, this.brain.anim);
      return;
    }

    if (this.state === 'stagger') {
      this.staggerT -= dt;
      if (this.staggerT <= 0) this.state = 'chase';
      this.speedNow = 0;
    } else if (this.state === 'tear') {
      const b = this.entry.barricade;
      this.speedNow = 0;
      this.moveSpeed = 0;
      this.turnTowards(Math.atan2(b.inward.x, b.inward.z), dt);
      if (dist <= reach) {
        this.state = 'attack';
        this.attackOn = 'player';
        this.attackT = 0;
        this.hitDone = false;
      } else if (b.boards <= 0) this.state = 'chase';
      else if ((this.tearT += dt) >= TEAR_EVERY) {
        this.tearT = 0;
        this.run.onTearBoard?.(this, b);
      }
    } else if (this.state === 'attack') {
      this.speedNow = 0;
      this.attackT += dt;
      const onBar = this.attackOn === 'bar' && !!obj;
      if (onBar) {
        obj.bar.nearest(p.x, p.z, _near);
        this.turnTowards(Math.atan2(_near.x - p.x, _near.z - p.z), dt);
      } else this.turnTowards(Math.atan2(pdx, pdz), dt);
      const targetDist = onBar ? obj.bar.distance(p.x, p.z) : dist;
      if (!this.hitDone && this.attackT >= this.stats.attackEvery * ATTACK_HIT_AT) {
        this.hitDone = true;
        if (targetDist <= reach + 0.35) {
          if (onBar) this.run.onZombieAttackBar?.(this);
          else this.run.onZombieAttack?.(this);
        }
      }
      if (this.attackT >= this.stats.attackEvery) {
        this.attackT = 0;
        this.hitDone = false;
        if (targetDist > reach * 1.15 || chasePlayer === onBar) this.state = this.blockedByBarricade() ? 'tear' : 'chase';
      }
    } else {
      this.chase(dt, ctx, dx, dz, tdist, nav);
      if (tdist <= reach && this.state === 'chase') {
        this.state = 'attack';
        this.attackOn = chasePlayer ? 'player' : 'bar';
        this.attackT = 0;
        this.hitDone = false;
        this.attackAnim = Math.random() < 0.5 ? 'attack' : 'attack2';
      }
    }
    if (this.state !== 'chase') this.separate(dt, ctx, 0.5);
    this.stunT = Math.max(0, this.stunT - dt);
    p.y = this.floorY = this.run.world?.floorAt?.(p.x, p.z, this.floorY) ?? 0;
    this.group.rotation.y = this.yaw;
    this.group.updateMatrixWorld(true);
    this.updateSkin(dt, this.animKey());
  }

  desiredDirection(dt, ctx, dx, dz, dist, nav = this.run.nav) {
    const p = this.group.position;
    _dir.x = dx / (dist || 1);
    _dir.z = dz / (dist || 1);
    if (dist <= DIRECT_RANGE || !nav || ctx.decoy) return _dir;
    this.lineT -= dt;
    if (this.lineT <= 0) {
      this.lineT = LINE_EVERY;
      this.lineClear = nav.clearLine?.(p.x, p.z, p.x + dx, p.z + dz) ?? false;
    }
    if (!this.lineClear) nav.direction(p.x, p.z, _dir);
    return _dir;
  }

  chase(dt, ctx, dx, dz, dist, nav = this.run.nav) {
    const p = this.group.position;
    if (ctx.decoy) {
      dx = ctx.decoy.x - p.x;
      dz = ctx.decoy.z - p.z;
      dist = Math.hypot(dx, dz);
    }
    if (this.blockedByBarricade()) {
      this.state = 'tear';
      this.tearT = 0;
      this.speedNow = 0;
      return;
    }
    const want = this.desiredDirection(dt, ctx, dx, dz, dist, nav);
    if (!this.heading) this.heading = { x: want.x, z: want.z };
    const h = this.heading;
    const k = Math.min(1, dt * STEER);
    h.x += (want.x - h.x) * k;
    h.z += (want.z - h.z) * k;
    const hl = Math.hypot(h.x, h.z) || 1;
    h.x /= hl;
    h.z /= hl;

    const roaring = this.heavy && this.t < ROAR_TIME;
    const target = roaring ? 0 : this.stats.speed * this.pace * (this.stunT > 0 ? 0.45 : 1);
    this.speedNow += (target - this.speedNow) * Math.min(1, dt * ACCEL);
    const x0 = p.x;
    const z0 = p.z;
    p.x += h.x * this.speedNow * dt;
    p.z += h.z * this.speedNow * dt;
    this.separate(dt, ctx, 1);
    this.collideWorld(ctx.colliders);
    this.holdAtBarricade();
    const moved = Math.hypot(p.x - x0, p.z - z0) / Math.max(dt, 1e-4);
    this.moveSpeed += (moved - this.moveSpeed) * Math.min(1, dt * 8);
    this.turnTowards(Math.atan2(h.x, h.z), dt);
  }

  barricadeSide() {
    const b = this.entry?.barricade;
    if (!b || this.passed) return null;
    const p = this.group.position;
    const ox = p.x - b.mouth.x;
    const oz = p.z - b.mouth.z;
    const side = ox * b.inward.x + oz * b.inward.z;
    if (side > 0.35) {
      this.passed = true;
      return null;
    }
    const lateral = Math.abs(ox * b.inward.z - oz * b.inward.x);
    return lateral < b.width / 2 + 1.2 ? side : null;
  }

  blockedByBarricade() {
    const side = this.barricadeSide();
    return side !== null && this.entry.barricade.boards > 0 && side > -(this.radius + 0.4);
  }

  holdAtBarricade() {
    const side = this.barricadeSide();
    const b = this.entry?.barricade;
    if (side === null || b.boards <= 0) return;
    const limit = -(this.radius + 0.3);
    if (side > limit) this.group.position.addScaledVector(b.inward, limit - side);
  }

  rise() {
    this.riseT = RISE_TIME;
    this.floorY = 0;
    this.group.position.y = -1.9 * this.scale;
  }

  separate(dt, ctx, strength) {
    const p = this.group.position;
    let sx = 0;
    let sz = 0;
    for (const o of ctx.zombies) {
      if (o === this || !o.alive) continue;
      const ox = p.x - o.group.position.x;
      const oz = p.z - o.group.position.z;
      const d2 = ox * ox + oz * oz;
      const min = this.radius + o.radius + 0.15;
      if (d2 >= min * min) continue;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        sx += (ox / d) * (1 - d / min);
        sz += (oz / d) * (1 - d / min);
      } else {
        sx += this.pace > o.pace ? 0.5 : -0.5;
      }
    }
    if (!sx && !sz) return;
    const push = SEPARATION * strength * Math.max(1, this.stats.speed) * dt;
    p.x += sx * push;
    p.z += sz * push;
  }

  decapitate() {
    if (this.headless) return false;
    this.headless = true;
    this.headBox?.removeFromParent();
    this.headBox = null;
    this.hitMeshes = this.hitMeshes.filter((m) => m.userData.part !== 'head');
    this.skin?.decapitate();
    return true;
  }

  loseLegs() {
    if (this.legless || this.stats.low || this.heavy || !this.alive) return false;
    this.legless = true;
    this.stats = { ...this.stats, low: true, speed: Math.min(this.stats.speed, LEGLESS_SPEED), attackRange: Math.min(this.stats.attackRange, 1.15) };
    this.buildHitboxes(CRAWLING);
    this.group.updateMatrixWorld(true);
    this.skin?.amputateLegs();
    if (this.state === 'stagger' || this.state === 'attack') this.state = 'chase';
    return true;
  }

  wound(point, part) {
    this.skin?.wound(point, part === 'head' ? 6 : 9);
  }

  stun(t) {
    if (!this.alive) return;
    this.stunT = Math.max(this.stunT, t);
    if (!this.heavy && this.state !== 'attack') {
      this.state = 'stagger';
      this.staggerT = STAGGER_TIME;
    }
  }

  animKey() {
    if (this.state === 'attack') return this.heavy ? 'heavy' : this.legless ? 'attack2' : this.attackAnim;
    if (this.state === 'tear') return 'attack2';
    if (this.state === 'stagger') return this.stats.low ? (this.legless ? 'drag' : 'crawl') : 'hit';
    if (this.legless) return 'drag';
    if (this.stats.low) return 'crawl';
    if (this.type === 'runner') return 'run';
    if (this.heavy) return this.t < ROAR_TIME ? 'scream' : 'fast';
    return this.stats.speed * this.pace > 1.05 ? 'fast' : 'walk';
  }

  turnTowards(target, dt) {
    let d = target - this.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.yaw += Math.sign(d) * Math.min(Math.abs(d), TURN * dt);
  }

  collideWorld(colliders) {
    const p = this.group.position;
    const r = this.radius;
    for (const b of colliders) {
      if (b.max.y < 0.3 || b.min.y > 1.6) continue;
      if (p.x + r < b.min.x || p.x - r > b.max.x || p.z + r < b.min.z || p.z - r > b.max.z) continue;
      const out = pushCircleOut(b, p.x, p.z, r);
      if (out) {
        p.x = out[0];
        p.z = out[1];
      }
    }
  }

  updateDeath(dt) {
    if (this.t > DEATH_TIME) this.group.position.y = this.floorY - ((this.t - DEATH_TIME) / SINK_TIME) * 0.9 * this.scale;
    if (this.t > DEATH_TIME + SINK_TIME) this.state = 'gone';
    this.updateSkin(dt, this.dieAnim, true);
  }

  updateSkin(dt, anim, falling = false) {
    const s = this.skin;
    if (!s) return;
    this.syncSkin();
    const attacking = anim === 'attack' || anim === 'attack2' || anim === 'heavy';
    s.update(dt, {
      distance: this.distToPlayer ?? 0,
      anim,
      speed: this.state === 'chase' ? this.moveSpeed : this.speedNow,
      cycle: this.state === 'tear' ? TEAR_EVERY : attacking ? this.stats.attackEvery : 0,
      flash: this.flashT > 0 ? 0.55 : 0,
      falling,
    });
    if (!falling) this.followHead();
  }

  followHead() {
    const box = this.headBox;
    if (!box || !this.skin?.headCenter(_head)) return;
    this.group.worldToLocal(_head);
    box.position.copy(_head);
    box.updateMatrix();
    box.updateMatrixWorld(true);
  }

  syncSkin() {
    const r = this.skin.root;
    r.position.copy(this.group.position);
    r.rotation.y = this.group.rotation.y;
  }

  dispose() {
    this.disposed = true;
    if (this.skin) releaseZombieSkin(this.skin);
    this.skin = null;
    this.group.removeFromParent();
  }
}
