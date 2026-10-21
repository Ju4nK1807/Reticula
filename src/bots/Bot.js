import * as THREE from 'three';
import { buildBotModel, BOT_DIMENSIONS } from './botModel.js';
import { rand, randSign } from '../utils/math.js';

const JUMP_TIME = 0.6;
const JUMP_HEIGHT = 0.9;
const DEATH_TIME = 0.9;
const APPEAR_TIME = 0.12;
const RADIUS = 0.4;

const _v = new THREE.Vector3();
const _head = new THREE.Vector3();

/*
  Bot humanoide con hitboxes de cabeza, cuerpo y piernas.

  opts = {
    position: Vector3 (pies), color, hp = 100,
    appear: bool               → aparece con una animación rápida (no hay "peek" previo)
    lifetime: s | null         → si sigue vivo al cumplirse, se esconde o desaparece (escapa)
    behavior:
      { type: 'static' }
      { type: 'strafe', range, speed: [a, b], change: [a, b], crouchChance, jumpChance, stopChance }
      { type: 'peek', spot, delay, outSpeed, hold: [a, b], wide, jiggles, then: 'hide' | 'strafe', strafe: {...} }
    shooter: { reaction, interval, damage, accuracy } | null
  }

  ctx de update = { playerPos, playerEye, playerSpeed, playerCrouch, ballistics, onBotFire(bot, hit, damage) }
*/
export class Bot {
  constructor(parent, world, opts) {
    this.world = world;
    this.opts = opts;
    const model = buildBotModel(opts.color);
    this.group = model.group;
    this.group.rotation.order = 'YXZ';
    this.upper = model.upper;
    this.legs = model.legs;
    this.hitMeshes = model.hitMeshes;
    this.mats = model.mats;
    this.gunTip = model.gunTip;
    for (const m of this.hitMeshes) m.userData.bot = this;

    this.baseY = opts.position.y;
    this.group.position.copy(opts.position);
    this.hp = opts.hp ?? 100;
    this.maxHp = this.hp;
    this.state = 'alive'; // alive | dying | leaving | gone
    this.escaped = false;
    this.age = 0;
    this.crouch = 0;
    this.crouchTarget = 0;
    this.jumpT = -1;
    this.flashT = 0;
    this.deathT = 0;
    this.appearT = opts.appear ? 0 : APPEAR_TIME;
    this.leaveT = 0;

    this.seenTime = 0;
    this.losTimer = 0;
    this.hasLos = false;
    this.fireCooldown = 0;

    this.behavior = { ...opts.behavior };
    this.initBehavior();
    this.applyPose();
    parent.add(this.group);
    this.group.updateMatrixWorld(true);
  }

  get position() {
    return this.group.position;
  }

  get alive() {
    return this.state === 'alive';
  }

  get removable() {
    return this.state === 'gone';
  }

  headPosition(out = _head) {
    const p = this.group.position;
    return out.set(p.x, p.y + BOT_DIMENSIONS.headCenter - BOT_DIMENSIONS.crouchDrop * this.crouch, p.z);
  }

  chestPosition(out = _head) {
    const p = this.group.position;
    return out.set(p.x, p.y + BOT_DIMENSIONS.chestCenter - BOT_DIMENSIONS.crouchDrop * this.crouch, p.z);
  }

  initBehavior() {
    const b = this.behavior;
    if (b.type === 'strafe') this.initStrafe(b);
    if (b.type === 'peek') {
      const { spot } = b;
      b.hidden = spot.hidden.clone();
      b.exposed = spot.exposed.clone();
      if (b.wide && spot.kind !== 'rise') {
        _v.subVectors(b.exposed, b.hidden).normalize();
        b.exposed.addScaledVector(_v, 1.2);
      }
      b.phase = 'wait';
      b.timer = b.delay ?? 0;
      b.jiggles = b.jiggles ?? 0;
      this.group.position.copy(b.hidden);
      if (spot.kind === 'rise') this.crouch = this.crouchTarget = 1;
    }
  }

  initStrafe(b) {
    b.type = 'strafe';
    b.anchor = this.group.position.clone();
    b.offset = 0;
    b.vel = randSign() * rand(...b.speed);
    b.timer = rand(...b.change);
    b.lateral = null; // se fija en el primer update, perpendicular a la línea hacia el jugador
  }

  // Daño recibido. Devuelve { killed }.
  damage(amount) {
    if (!this.alive) return { killed: false };
    this.hp -= amount;
    this.flashT = 0.08;
    if (this.hp <= 0) {
      this.state = 'dying';
      this.deathT = 0;
      return { killed: true };
    }
    return { killed: false };
  }

  // Se va sin morir: vuelve a su escondite si lo tiene, si no se desvanece.
  leave() {
    if (!this.alive) return;
    const b = this.behavior;
    if (b.type === 'peek') {
      b.phase = 'back';
      b.final = true;
    } else {
      this.state = 'leaving';
      this.leaveT = 0;
    }
  }

  update(dt, ctx) {
    this.age += dt;
    this.appearT = Math.min(APPEAR_TIME, this.appearT + dt);

    if (this.state === 'dying') return this.updateDeath(dt);
    if (this.state === 'leaving') {
      this.leaveT += dt;
      if (this.leaveT > 0.15) {
        this.state = 'gone';
        this.escaped = true;
      }
    }

    if (this.state === 'alive') {
      if (this.opts.lifetime && this.age > this.opts.lifetime) this.leave();
      const b = this.behavior;
      if (b.type === 'strafe') this.updateStrafe(dt, b, ctx);
      else if (b.type === 'peek') this.updatePeek(dt, b);
      if (this.opts.shooter) this.updateShooting(dt, ctx);
    }

    this.face(ctx.playerPos);
    this.crouch += (this.crouchTarget - this.crouch) * Math.min(1, dt * 14);
    if (this.jumpT >= 0) {
      this.jumpT += dt;
      if (this.jumpT > JUMP_TIME) this.jumpT = -1;
    }
    this.flashT -= dt;
    this.applyPose();
  }

  face(target) {
    const p = this.group.position;
    this.group.rotation.y = Math.atan2(target.x - p.x, target.z - p.z);
  }

  updateStrafe(dt, b, ctx) {
    if (!b.lateral) {
      _v.subVectors(ctx.playerPos, b.anchor).setY(0).normalize();
      b.lateral = new THREE.Vector3(-_v.z, 0, _v.x);
    }
    b.timer -= dt;
    if (b.timer <= 0) {
      b.timer = rand(...b.change);
      if (Math.random() < (b.stopChance ?? 0.15)) b.vel = 0;
      else {
        const dir = b.vel === 0 ? randSign() : Math.random() < 0.65 ? -Math.sign(b.vel) : Math.sign(b.vel);
        b.vel = dir * rand(...b.speed);
      }
      if (Math.random() < (b.crouchChance ?? 0)) this.crouchTarget = this.crouchTarget ? 0 : 1;
      if (this.jumpT < 0 && this.crouchTarget === 0 && Math.random() < (b.jumpChance ?? 0)) this.jumpT = 0;
    }
    const speed = this.crouchTarget ? b.vel * 0.5 : b.vel;
    let offset = b.offset + speed * dt;
    if (Math.abs(offset) > b.range) {
      offset = Math.sign(offset) * b.range;
      b.vel = -b.vel;
    }
    _v.copy(b.anchor).addScaledVector(b.lateral, offset);
    if (this.world.isFree(_v.x, _v.z, RADIUS, this.baseY)) {
      b.offset = offset;
      this.group.position.x = _v.x;
      this.group.position.z = _v.z;
    } else {
      b.vel = -b.vel;
    }
  }

  updatePeek(dt, b) {
    const p = this.group.position;
    const rise = b.spot.kind === 'rise';
    const moveTo = (target, speed) => {
      _v.subVectors(target, p).setY(0);
      const d = _v.length();
      const step = speed * dt;
      if (d <= step) {
        p.x = target.x;
        p.z = target.z;
        return true;
      }
      p.addScaledVector(_v.divideScalar(d), step);
      return false;
    };

    switch (b.phase) {
      case 'wait':
        b.timer -= dt;
        if (b.timer <= 0) b.phase = 'out';
        break;
      case 'out': {
        const arrived = rise ? ((this.crouchTarget = 0), this.crouch < 0.08) : moveTo(b.exposed, b.outSpeed);
        if (arrived) {
          b.phase = 'hold';
          b.timer = b.jiggles > 0 ? rand(0.08, 0.18) : rand(...b.hold);
        }
        break;
      }
      case 'hold':
        b.timer -= dt;
        if (b.timer > 0) break;
        if (b.jiggles > 0) {
          // Jiggle: asomarse un instante y volver a cubrirse antes del peek real.
          b.jiggles--;
          b.phase = 'back';
        } else if (b.then === 'strafe') {
          Object.assign(b, b.strafe);
          this.initStrafe(b);
        } else {
          b.final = true;
          b.phase = 'back';
        }
        break;
      case 'back': {
        const arrived = rise ? ((this.crouchTarget = 1), this.crouch > 0.92) : moveTo(b.hidden, b.outSpeed);
        if (!arrived) break;
        if (b.final) {
          this.state = 'gone';
          this.escaped = true;
        } else {
          b.phase = 'wait';
          b.timer = rand(0.1, 0.3);
        }
        break;
      }
    }
  }

  updateShooting(dt, ctx) {
    const s = this.opts.shooter;
    if (this.appearT < APPEAR_TIME) return;
    this.losTimer -= dt;
    if (this.losTimer <= 0) {
      this.losTimer = 0.1;
      this.hasLos = ctx.ballistics.lineOfSight(this.headPosition(), ctx.playerEye);
    }
    this.seenTime = this.hasLos ? this.seenTime + dt : Math.max(0, this.seenTime - dt * 2);
    if (this.seenTime < s.reaction) return;
    this.fireCooldown -= dt;
    if (this.fireCooldown > 0) return;
    this.fireCooldown = s.interval * rand(0.8, 1.2);
    // Moverse rápido o agacharse hace más difícil que el bot acierte.
    const moving = Math.min(1, ctx.playerSpeed / 5.4);
    const chance = s.accuracy * (1 - 0.5 * moving) * (ctx.playerCrouch > 0.5 ? 0.85 : 1);
    ctx.onBotFire(this, Math.random() < chance, s.damage);
  }

  updateDeath(dt) {
    this.deathT += dt;
    const k = Math.min(1, this.deathT / 0.35);
    this.group.rotation.x = -k * k * 1.45;
    if (this.deathT > 0.55) this.group.position.y = this.baseY - (this.deathT - 0.55) * 2.5;
    if (this.deathT > DEATH_TIME) this.state = 'gone';
    this.flashT -= dt;
    this.applyPose();
  }

  applyPose() {
    const c = this.crouch;
    const legScale = 1 - (BOT_DIMENSIONS.crouchDrop / BOT_DIMENSIONS.legHeight) * c;
    for (const leg of this.legs) {
      leg.scale.y = legScale;
      leg.position.y = (BOT_DIMENSIONS.legHeight * legScale) / 2;
    }
    this.upper.position.y = BOT_DIMENSIONS.legHeight - BOT_DIMENSIONS.crouchDrop * c;

    if (this.state !== 'dying') {
      const jump = this.jumpT >= 0 ? Math.sin((Math.PI * this.jumpT) / JUMP_TIME) * JUMP_HEIGHT : 0;
      this.group.position.y = this.baseY + jump;
    }

    const appear = this.appearT / APPEAR_TIME;
    const leave = this.state === 'leaving' ? 1 - this.leaveT / 0.15 : 1;
    this.group.scale.set(1, Math.max(0.02, appear * leave), 1);

    const flash = this.flashT > 0 ? 0.9 : 0;
    this.mats.body.emissiveIntensity = flash;
    this.mats.legs.emissiveIntensity = flash;
    this.mats.head.emissiveIntensity = flash;
    this.group.updateMatrixWorld(true);
  }

  dispose() {
    this.group.removeFromParent();
    for (const m of Object.values(this.mats)) m.dispose();
  }
}
