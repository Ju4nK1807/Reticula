import * as THREE from 'three';
import { Bot } from '../../bots/Bot.js';
import { BOT_DIMENSIONS } from '../../bots/botModel.js';
import { RIFLE } from '../../combat/Weapon.js';
import { SphereTarget } from '../../targets/SphereTarget.js';
import { angularDistance, pointFromAngles } from '../../targets/spawn.js';
import { clock, pct } from '../../utils/format.js';
import { DEG, rand } from '../../utils/math.js';

// Puntos por defecto. Cada fallo resta: la evaluación es estricta a propósito.
export const DEFAULT_POINTS = { head: 150, body: 60, legs: 40, kill: 100, miss: -80, escaped: -120 };

const _v = new THREE.Vector3();
const _head = new THREE.Vector3();
const _from = new THREE.Vector3();
const _to = new THREE.Vector3();

// Base de las fases de evaluación: bots, conteo de disparos, puntos, vida del jugador y spawns.
export class Phase {
  static info = { id: 'phase', name: 'Fase', desc: '', auto: false, health: false };

  constructor(evaluation) {
    this.ev = evaluation;
    this.game = evaluation.game;
    this.world = this.game.world;
    this.root = evaluation.root;
    this.duration = 30;
    this.elapsed = 0;
    this.finished = false;
    this.bots = [];
    this.usedSpots = new Set();
    this.points = { ...DEFAULT_POINTS };
    this.score = 0;
    this.health = 100;
    this.died = false;
    this.stats = { shots: 0, hits: 0, head: 0, body: 0, legs: 0, kills: 0, escaped: 0, damageTaken: 0 };
    this.onBotFire = this.onBotFire.bind(this);
  }

  get info() {
    return this.constructor.info;
  }

  get accuracy() {
    return this.stats.shots ? this.stats.hits / this.stats.shots : null;
  }

  begin() {}

  botContext() {
    const p = this.game.player;
    return {
      playerPos: p.position,
      playerEye: p.eye,
      playerSpeed: p.horizontalSpeed,
      playerCrouch: p.crouch,
      ballistics: this.game.ballistics,
      onBotFire: this.onBotFire,
    };
  }

  update(dt) {
    this.elapsed += dt;
    const ctx = this.botContext();
    for (const bot of this.bots) bot.update(dt, ctx);
    this.bots = this.bots.filter((bot) => {
      if (!bot.removable) return true;
      if (bot.escaped) this.onEscape(bot);
      const spot = bot.opts.behavior.spot;
      if (spot) this.usedSpots.delete(spot.id);
      this.onRemoved(bot);
      bot.dispose();
      return false;
    });
    if (this.elapsed >= this.duration) this.finished = true;
  }

  hitMeshes() {
    const out = [];
    for (const bot of this.bots) if (bot.alive) out.push(...bot.hitMeshes);
    return out;
  }

  spawnBot(opts) {
    const bot = new Bot(this.root, this.world, { color: this.game.settings.enemyColor, ...opts });
    const spot = opts.behavior?.spot;
    if (spot) this.usedSpots.add(spot.id);
    this.bots.push(bot);
    return bot;
  }

  spawnSphere(opts) {
    const target = new SphereTarget(this.root, opts);
    this.bots.push(target);
    return target;
  }

  // Punto visible para una diana, en ángulos respecto al frente del mapa (-Z) desde el ojo del jugador.
  // minSep: separación mínima (grados) con `avoid`; minAim: separación mínima con la mira actual.
  sphereSpot({ yaw, pitch, dist, avoid = [], minSep = 0, minAim = 0 }) {
    const eye = this.game.player.eye;
    let fallback = null;
    for (let i = 0; i < 40; i++) {
      const angles = { yaw: rand(...yaw), pitch: rand(...pitch) };
      const d = Array.isArray(dist) ? rand(...dist) : dist;
      const pos = pointFromAngles(angles.yaw, angles.pitch, d, eye);
      if (!this.game.ballistics.lineOfSight(eye, pos)) continue;
      fallback ??= { pos, angles };
      if (avoid.some((b) => angularDistance(angles, b) < minSep)) continue;
      if (minAim && this.angleFromAim(pos) < minAim) continue;
      return { pos, angles };
    }
    return fallback ?? { pos: pointFromAngles(0, 4, 12, eye), angles: { yaw: 0, pitch: 4 } };
  }

  damageFor(part) {
    return RIFLE.damage[part];
  }

  // Recibe cada disparo del jugador (hit = resultado de Ballistics.cast o null).
  handleShot(hit) {
    const s = this.stats;
    const { hud, sfx } = this.game;
    s.shots++;
    if (!hit?.bot || !hit.bot.alive) {
      this.score += this.points.miss;
      this.onMiss(hit);
      return;
    }
    const { bot, part } = hit;
    s.hits++;
    s[part]++;
    const dmg = this.damageFor(part, bot);
    const { killed } = dmg > 0 ? bot.damage(dmg) : { killed: false };
    this.score += this.points[part];
    hud.hitmarker(killed ? 'kill' : part === 'head' ? 'head' : 'hit');
    if (part === 'head') sfx.headshot();
    else sfx.hit();
    this.onHit(bot, part, killed);
    if (killed) {
      s.kills++;
      this.score += this.points.kill;
      sfx.kill();
      this.onKill(bot, part);
    }
  }

  onHit() {}
  onMiss() {}
  onKill() {}
  onRemoved() {}
  onPause() {}

  onEscape() {
    this.stats.escaped++;
    this.score += this.points.escaped;
    this.game.hud.flash('Se escapó', 'bad');
  }

  // Un bot disparó al jugador: bala visible que pasa junto a la cámara y daño si acierta.
  onBotFire(bot, hit, damage) {
    const g = this.game;
    bot.gunTip.getWorldPosition(_from);
    const eye = g.player.eye;
    _v.subVectors(eye, _from).normalize();
    const side = new THREE.Vector3(-_v.z, 0, _v.x);
    const miss = hit ? 0.35 : rand(0.9, 1.6);
    _to
      .copy(eye)
      .addScaledVector(side, (Math.random() < 0.5 ? -1 : 1) * miss)
      .add(new THREE.Vector3(0, rand(-0.3, 0.3), 0))
      .addScaledVector(_v, 6);
    g.effects.tracer(_from, _to, 'enemy');
    g.sfx.botShot(g.panFor(_from));
    if (hit && this.info.health) this.takeDamage(damage, _from);
  }

  takeDamage(amount, from) {
    if (this.died) return;
    const g = this.game;
    this.health = Math.max(0, this.health - amount);
    this.stats.damageTaken += amount;
    g.hud.damage(g.angleTo(from));
    g.hud.setHealth(this.health / 100);
    g.sfx.hurt();
    if (this.health <= 0) {
      this.died = true;
      this.finished = true;
      g.hud.flash('Eliminado', 'bad');
    }
  }

  isVisible(bot) {
    const eye = this.game.player.eye;
    const los = this.game.ballistics;
    return los.lineOfSight(eye, bot.headPosition(_head)) || los.lineOfSight(eye, bot.chestPosition(_head));
  }

  // Ángulo (grados) entre la mira actual y un punto.
  angleFromAim(point) {
    const cam = this.game.engine.camera;
    _v.set(0, 0, -1).applyQuaternion(cam.quaternion);
    const to = point.clone().sub(cam.position).normalize();
    return Math.acos(Math.min(1, _v.dot(to))) / DEG;
  }

  // Posición aleatoria en terreno abierto (o en el balcón) visible desde donde está el jugador.
  randomOpenSpot({ minDist = 8, maxDist = 38, maxYaw = 70, highChance = 0.15, minSep = 0 } = {}) {
    const w = this.world;
    const eye = this.game.player.eye;
    const a = w.openArea;
    for (let i = 0; i < 80; i++) {
      const pos =
        Math.random() < highChance
          ? w.highSpots[Math.floor(Math.random() * w.highSpots.length)].clone().setX(rand(-11, 11))
          : new THREE.Vector3(rand(a.minX, a.maxX), 0, rand(a.minZ, a.maxZ));
      const dx = pos.x - eye.x;
      const dz = pos.z - eye.z;
      const dist = Math.hypot(dx, dz);
      if (dist < minDist || dist > maxDist) continue;
      if (Math.abs(Math.atan2(-dx, -dz) / DEG) > maxYaw) continue;
      if (!w.isFree(pos.x, pos.z, 0.5, pos.y)) continue;
      _head.set(pos.x, pos.y + BOT_DIMENSIONS.headCenter, pos.z);
      if (minSep && this.angleFromAim(_head) < minSep) continue;
      if (!this.game.ballistics.lineOfSight(eye, _head)) continue;
      return pos;
    }
    return new THREE.Vector3(rand(-6, 6), 0, -16);
  }

  // Escondite libre cuyo punto de asomo es visible y cuyo escondite no lo es (desde la posición actual).
  pickCoverSpot(areas) {
    const eye = this.game.player.eye;
    const los = this.game.ballistics;
    const candidates = this.world.coverSpots
      .filter((s) => areas.includes(s.area) && !this.usedSpots.has(s.id))
      .sort(() => Math.random() - 0.5);
    let fallback = null;
    for (const s of candidates) {
      _head.copy(s.exposed).setY(s.exposed.y + BOT_DIMENSIONS.headCenter);
      if (!los.lineOfSight(eye, _head)) continue;
      fallback ??= s;
      const hiddenY = s.hidden.y + BOT_DIMENSIONS.headCenter - (s.kind === 'rise' ? BOT_DIMENSIONS.crouchDrop : 0);
      _head.copy(s.hidden).setY(hiddenY);
      if (los.lineOfSight(eye, _head)) continue;
      return s;
    }
    return fallback ?? candidates[0] ?? null;
  }

  hudStats() {
    return {
      score: Math.round(this.score),
      accLabel: 'Precisión',
      accText: pct(this.accuracy),
      time: clock(this.duration - this.elapsed),
    };
  }

  baseResults() {
    const s = this.stats;
    return {
      ...s,
      accuracy: s.shots ? s.hits / s.shots : 0,
      hsRate: s.hits ? s.head / s.hits : 0,
      score: Math.round(this.score),
    };
  }

  results() {
    return this.baseResults();
  }

  dispose() {
    for (const bot of this.bots) bot.dispose();
    this.bots = [];
    this.usedSpots.clear();
  }
}
