import * as THREE from 'three';
import { Bot } from '../../bots/Bot.js';
import { BOT_DIMENSIONS } from '../../bots/botModel.js';
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
const _side = new THREE.Vector3();
const _aim = new THREE.Vector3();

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
    this.shotTime = 0; // instante (ms, reloj real) del último disparo; lo usan las fases de reacción
    this.bodies = []; // colisionadores de los bots vivos, reutilizados cada cuadro
    this.hitList = []; // mallas golpeables, reutilizadas en cada consulta
    // Enlazar ANTES de guardarlo en ctx: los bots lo llaman como función suelta.
    this.onBotFire = this.onBotFire.bind(this);
    this.ctx = {
      playerPos: null,
      playerEye: null,
      playerSpeed: 0,
      playerCrouch: 0,
      ballistics: this.game.ballistics,
      onBotFire: this.onBotFire,
    };
  }

  get info() {
    return this.constructor.info;
  }

  get accuracy() {
    return this.stats.shots ? this.stats.hits / this.stats.shots : null;
  }

  begin() {}

  // Contexto que reciben los bots en cada update (un solo objeto reutilizado: sin basura por cuadro).
  botContext() {
    const p = this.game.player;
    const c = this.ctx;
    c.playerPos = p.position;
    c.playerEye = p.eye;
    c.playerSpeed = p.horizontalSpeed;
    c.playerCrouch = p.crouch;
    return c;
  }

  update(dt) {
    this.elapsed += dt;
    const ctx = this.botContext();
    const bots = this.bots;
    for (let i = 0; i < bots.length; i++) bots[i].update(dt, ctx);

    // Compactación en el sitio (sin crear un arreglo nuevo cada cuadro). Los avisos (onEscape,
    // onRemoved) se llaman DESPUÉS de compactar: pueden crear bots nuevos (p. ej. la siguiente diana
    // en Flicking) y, si se llamaran durante el recorrido, esos bots se perderían.
    let removed = null;
    let n = 0;
    for (let i = 0; i < bots.length; i++) {
      const bot = bots[i];
      if (bot.removable) (removed ??= []).push(bot);
      else bots[n++] = bot;
    }
    bots.length = n;
    if (removed) {
      for (const bot of removed) {
        if (bot.escaped) this.onEscape(bot);
        const spot = bot.opts.behavior.spot;
        if (spot) this.usedSpots.delete(spot.id);
        this.onRemoved(bot);
        bot.dispose();
      }
    }
    if (this.elapsed >= this.duration) this.finished = true;
  }

  // Cuerpos que bloquean al jugador: bots vivos (las dianas flotan y no bloquean).
  bodyColliders() {
    let n = 0;
    for (const bot of this.bots) {
      if (!bot.alive || !bot.bodyCollider) continue;
      this.bodies[n] ??= {};
      bot.bodyCollider(this.bodies[n++]);
    }
    this.bodies.length = n;
    return this.bodies;
  }

  // Mallas que pueden recibir balas. Devuelve siempre el mismo arreglo (no guardarlo: cambia).
  hitMeshes() {
    const out = this.hitList;
    out.length = 0;
    for (const bot of this.bots) {
      if (!bot.alive) continue;
      for (const m of bot.hitMeshes) out.push(m);
    }
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

  // Daño de una bala (o perdigón) del arma actual en esa zona.
  damageFor(part) {
    return this.game.weapon.stats.damage[part];
  }

  // Recibe cada disparo del jugador (hit = resultado de Ballistics.cast o null).
  // `time`: instante del clic en ms (misma base que performance.now()).
  handleShot(hit, time = performance.now()) {
    const s = this.stats;
    const { hud, sfx } = this.game;
    this.shotTime = time;
    s.shots++;
    if (!hit?.bot || !hit.bot.alive) {
      this.score += this.points.miss;
      this.onMiss(hit);
      return;
    }
    const { bot, part } = hit;
    s.hits++;
    s[part]++;
    // Con perdigones (escopeta), el daño se multiplica por los que dieron en este objetivo.
    const dmg = this.damageFor(part, bot) * (hit.pelletHits ?? 1);
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

  // Golpe cuerpo a cuerpo (combat/Melee.js): como un disparo que acierta, sin contar como disparo.
  handleMelee(hit, damage) {
    const { bot, part } = hit;
    if (!bot?.alive) return;
    const { killed } = bot.damage(damage);
    this.stats.melee = (this.stats.melee ?? 0) + 1;
    this.score += this.points[part] ?? 0;
    this.game.hud.hitmarker(killed ? 'kill' : 'hit');
    this.onHit(bot, part, killed);
    if (killed) {
      this.stats.kills++;
      this.score += this.points.kill;
      this.game.sfx.kill();
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
    _side.set(-_v.z, 0, _v.x);
    const miss = hit ? 0.35 : rand(0.9, 1.6);
    _to
      .copy(eye)
      .addScaledVector(_side, (Math.random() < 0.5 ? -1 : 1) * miss)
      .addScaledVector(_v, 6);
    _to.y += rand(-0.3, 0.3);
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
    _aim.subVectors(point, cam.position).normalize();
    return Math.acos(Math.min(1, _v.dot(_aim))) / DEG;
  }

  // Posición aleatoria en terreno abierto (o en el balcón) visible desde donde está el jugador.
  // `scale`: tamaño del bot que va a aparecer (la cabeza de un bot pequeño está más abajo).
  randomOpenSpot({ minDist = 8, maxDist = 38, maxYaw = 70, highChance = 0.15, minSep = 0, scale = 1 } = {}) {
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
      if (!w.isFree(pos.x, pos.z, 0.5 * scale, pos.y, 1.8 * scale)) continue;
      _head.set(pos.x, pos.y + BOT_DIMENSIONS.headCenter * scale, pos.z);
      if (minSep && this.angleFromAim(_head) < minSep) continue;
      if (!this.game.ballistics.lineOfSight(eye, _head)) continue;
      return pos;
    }
    return new THREE.Vector3(rand(-6, 6), 0, -16);
  }

  // Escondite libre cuyo punto de asomo es visible y cuyo escondite no lo es (desde la posición actual).
  pickCoverSpot(areas, scale = 1) {
    const eye = this.game.player.eye;
    const los = this.game.ballistics;
    const candidates = this.world.coverSpots
      .filter((s) => areas.includes(s.area) && !this.usedSpots.has(s.id))
      .sort(() => Math.random() - 0.5);
    let fallback = null;
    for (const s of candidates) {
      _head.copy(s.exposed).setY(s.exposed.y + BOT_DIMENSIONS.headCenter * scale);
      if (!los.lineOfSight(eye, _head)) continue;
      fallback ??= s;
      const hiddenY = s.hidden.y + (BOT_DIMENSIONS.headCenter - (s.kind === 'rise' ? BOT_DIMENSIONS.crouchDrop : 0)) * scale;
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
