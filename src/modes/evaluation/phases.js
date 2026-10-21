import * as THREE from 'three';
import { Phase } from './Phase.js';
import { average, rand } from '../../utils/math.js';
import { fixed, ms, pct } from '../../utils/format.js';

const _dir = new THREE.Vector3();

// ---------------------------------------------------------------------------
// 1. Flicks: un enemigo aparece en un lugar inesperado y escapa si tardas.
// ---------------------------------------------------------------------------
export class FlickPhase extends Phase {
  static info = {
    id: 'flick',
    name: 'Flicks',
    desc: 'Un enemigo aparece en un lugar inesperado: lejos, cerca, en el balcón o a los lados. Elimínalo antes de que escape. La cabeza mata de un tiro; el cuerpo necesita 3.',
    auto: false,
    health: false,
  };

  static summary(r) {
    return `${pct(r.accuracy)} precisión · ${pct(r.hsRate)} a la cabeza`;
  }

  static details(r) {
    return [
      ['Precisión', pct(r.accuracy)],
      ['Headshots', pct(r.hsRate)],
      ['Bajas/s', fixed(r.kps)],
      ['Tiempo por baja', ms(r.avgKillMs)],
      ['Escapados', String(r.escaped)],
    ];
  }

  begin() {
    this.killTimes = [];
    this.current = null;
    this.gap = 0;
    this.next();
  }

  next() {
    const position = this.randomOpenSpot({ minDist: 7, maxDist: 40, maxYaw: 75, highChance: 0.2, minSep: 12 });
    this.current = this.spawnBot({ position, appear: true, lifetime: 2.2, behavior: { type: 'static' } });
    this.spawnedAt = this.elapsed;
  }

  update(dt) {
    super.update(dt);
    if (this.finished || this.current) return;
    this.gap -= dt;
    if (this.gap <= 0) this.next();
  }

  onKill(bot) {
    if (bot !== this.current) return;
    this.killTimes.push(this.elapsed - this.spawnedAt);
    this.current = null;
    this.gap = 0.12;
  }

  onRemoved(bot) {
    if (bot !== this.current) return;
    this.current = null;
    this.gap = 0.12;
  }

  results() {
    const avg = average(this.killTimes ?? []);
    return { ...this.baseResults(), kps: this.stats.kills / this.duration, avgKillMs: avg === null ? null : avg * 1000 };
  }
}

// ---------------------------------------------------------------------------
// 2. Tracking: un enemigo blindado hace strafing errático; disparo automático.
// ---------------------------------------------------------------------------
export class TrackingPhase extends Phase {
  static info = {
    id: 'tracking',
    name: 'Tracking',
    desc: 'Un enemigo blindado hace strafing (A-D), se detiene, se agacha y salta. Mantén clic presionado y sigue su cuerpo o cabeza. Las balas fuera también restan.',
    auto: true,
    health: false,
  };

  static summary(r) {
    return `${pct(r.onTarget)} sobre el objetivo · ${pct(r.accuracy)} de balas`;
  }

  static details(r) {
    return [
      ['Sobre el objetivo', pct(r.onTarget, 1)],
      ['Balas acertadas', `${pct(r.accuracy)} (${r.hits}/${r.shots})`],
      ['Headshots', pct(r.hsRate)],
      ['Derribos', String(r.kills)],
    ];
  }

  constructor(ev) {
    super(ev);
    this.points = { head: 30, body: 15, legs: 10, kill: 200, miss: -12, escaped: 0 };
    this.onTime = 0;
    this.total = 0;
  }

  begin() {
    this.respawnIn = 0;
    this.target = null;
  }

  spawnTarget() {
    const position = this.randomOpenSpot({ minDist: 9, maxDist: 17, maxYaw: 30, highChance: 0 });
    this.target = this.spawnBot({
      position,
      hp: 900,
      appear: true,
      behavior: { type: 'strafe', range: 3.2, speed: [2.6, 5.2], change: [0.25, 0.9], crouchChance: 0.18, jumpChance: 0.18, stopChance: 0.12 },
    });
  }

  update(dt) {
    super.update(dt);
    if (this.finished) return;
    if (!this.target?.alive) {
      this.respawnIn -= dt;
      if (this.respawnIn <= 0) this.spawnTarget();
      return;
    }
    const g = this.game;
    const cam = g.engine.camera;
    _dir.set(0, 0, -1).applyQuaternion(cam.quaternion);
    const hit = g.ballistics.cast(cam.position, _dir, this.hitMeshes());
    const on = hit?.bot === this.target;
    this.total += dt;
    if (on) this.onTime += dt;
  }

  onKill(bot) {
    if (bot === this.target) this.respawnIn = 0.4;
  }

  hudStats() {
    return { ...super.hudStats(), accLabel: 'Sobre objetivo', accText: pct(this.total ? this.onTime / this.total : null) };
  }

  results() {
    return { ...this.baseResults(), onTarget: this.total ? this.onTime / this.total : 0 };
  }
}

// ---------------------------------------------------------------------------
// 3. Peeks y reacción: enemigos se asoman desde coberturas y disparan.
// ---------------------------------------------------------------------------
const PEEKS = 10;

export class PeekPhase extends Phase {
  static info = {
    id: 'peek',
    name: 'Peeks y reacción',
    desc: `Enemigos se asoman desde coberturas, puertas y el balcón; a veces amagan (jiggle) o se levantan detrás de muros bajos. Si tardas, te disparan. ${PEEKS} apariciones.`,
    auto: false,
    health: true,
  };

  static summary(r) {
    return `${ms(r.avgMs)} de reacción · ${r.kills}/${r.peeks} eliminados`;
  }

  static details(r) {
    return [
      ['Reacción promedio', ms(r.avgMs)],
      ['Mejor reacción', ms(r.bestMs)],
      ['Eliminados', `${r.kills}/${r.peeks}`],
      ['Precisión', pct(r.accuracy)],
      ['Daño recibido', String(r.damageTaken)],
    ];
  }

  constructor(ev) {
    super(ev);
    this.duration = Infinity;
    this.count = 0;
    this.times = [];
    this.current = null;
    this.visibleAt = null;
  }

  begin() {
    this.wait = rand(0.8, 2);
  }

  spawnPeek() {
    const areas = Math.random() < 0.2 ? ['flank', 'front'] : ['front', 'high'];
    const spot = this.pickCoverSpot(areas);
    if (!spot) return;
    const r = Math.random();
    const wide = r < 0.35;
    const jiggles = r >= 0.35 && r < 0.6 ? 1 + Math.floor(Math.random() * 2) : 0;
    this.current = this.spawnBot({
      position: spot.hidden.clone(),
      behavior: { type: 'peek', spot, delay: 0, outSpeed: wide ? 6 : 4.5, hold: [0.7, 1.1], wide, jiggles, then: 'hide' },
      shooter: { reaction: 0.55, interval: 0.25, damage: 10, accuracy: 0.45 },
    });
    this.count++;
    this.visibleAt = null;
  }

  update(dt) {
    super.update(dt);
    if (this.finished) return;
    if (!this.current) {
      this.wait -= dt;
      if (this.wait > 0) return;
      if (this.count >= PEEKS) this.finished = true;
      else this.spawnPeek();
      return;
    }
    if (this.visibleAt === null && this.current.alive && this.isVisible(this.current)) this.visibleAt = this.elapsed;
  }

  clearCurrent() {
    this.current = null;
    this.wait = rand(0.8, 2.2);
  }

  onKill(bot) {
    if (bot !== this.current) return;
    if (this.visibleAt !== null) {
      const rt = (this.elapsed - this.visibleAt) * 1000;
      this.times.push(rt);
      this.game.hud.flash(`${Math.round(rt)} ms`, 'good');
    }
    this.clearCurrent();
  }

  onRemoved(bot) {
    if (bot === this.current) this.clearCurrent();
  }

  hudStats() {
    return {
      score: Math.round(this.score),
      accLabel: 'Reacción',
      accText: ms(average(this.times)),
      time: `${Math.min(Math.max(this.count, 1), PEEKS)}/${PEEKS}`,
    };
  }

  results() {
    return {
      ...this.baseResults(),
      peeks: PEEKS,
      avgMs: average(this.times),
      bestMs: this.times.length ? Math.min(...this.times) : null,
    };
  }
}

// ---------------------------------------------------------------------------
// 4. Precisión: solo la cabeza cuenta, a larga distancia.
// ---------------------------------------------------------------------------
export class PrecisionPhase extends Phase {
  static info = {
    id: 'precision',
    name: 'Precisión a la cabeza',
    desc: 'Enemigos lejanos, quietos o caminando despacio. Solo cuentan los disparos a la cabeza: un tiro al cuerpo, a las piernas o al aire resta puntos.',
    auto: false,
    health: false,
  };

  static summary(r) {
    return `${pct(r.headAcc)} de tiros a la cabeza`;
  }

  static details(r) {
    return [
      ['Tiros a la cabeza', `${pct(r.headAcc)} (${r.head}/${r.shots})`],
      ['Bajas/s', fixed(r.kps)],
      ['Tiros al cuerpo', String(r.body + r.legs)],
    ];
  }

  constructor(ev) {
    super(ev);
    this.points = { head: 200, body: -60, legs: -60, kill: 0, miss: -100, escaped: 0 };
  }

  damageFor(part) {
    return part === 'head' ? 999 : 0;
  }

  begin() {
    this.spawnOne();
    this.spawnOne();
  }

  spawnOne() {
    const position = this.randomOpenSpot({ minDist: 22, maxDist: 44, maxYaw: 35, highChance: 0.25, minSep: 4 });
    const behavior =
      Math.random() < 0.5
        ? { type: 'static' }
        : { type: 'strafe', range: 1.5, speed: [0.6, 1.4], change: [0.8, 2], stopChance: 0.3 };
    this.spawnBot({ position, appear: true, behavior });
  }

  onKill() {
    this.spawnOne();
  }

  hudStats() {
    const s = this.stats;
    return { ...super.hudStats(), accLabel: 'A la cabeza', accText: pct(s.shots ? s.head / s.shots : null) };
  }

  results() {
    const s = this.stats;
    return { ...this.baseResults(), headAcc: s.shots ? s.head / s.shots : 0, kps: s.kills / this.duration };
  }
}

// ---------------------------------------------------------------------------
// 5. Combate en movimiento: enemigos por todos lados que disparan de verdad.
// ---------------------------------------------------------------------------
const MAX_ALIVE = 3;

export class CombatPhase extends Phase {
  static info = {
    id: 'combat',
    name: 'Combate en movimiento',
    desc: 'Enemigos entran por puertas, coberturas, el balcón e incluso por los flancos y detrás de ti. Disparan: muévete, usa cobertura y escucha de dónde vienen. Disparo automático.',
    auto: true,
    health: true,
  };

  static summary(r) {
    return `${r.kills} bajas · ${r.died ? 'eliminado' : `${r.health} de vida`}`;
  }

  static details(r) {
    return [
      ['Bajas', String(r.kills)],
      ['Precisión', pct(r.accuracy)],
      ['Headshots', pct(r.hsRate)],
      ['Daño recibido', String(r.damageTaken)],
      ['Resultado', r.died ? `Eliminado a los ${Math.round(r.time)} s` : 'Sobreviviste'],
    ];
  }

  constructor(ev) {
    super(ev);
    this.duration = 40;
    this.points = { head: 60, body: 25, legs: 15, kill: 150, miss: -15, escaped: -50 };
  }

  begin() {
    this.spawnIn = 0.5;
  }

  update(dt) {
    super.update(dt);
    if (this.finished) return;
    this.spawnIn -= dt;
    const alive = this.bots.filter((b) => b.alive).length;
    if (this.spawnIn <= 0 && alive < MAX_ALIVE) {
      this.spawnEnemy();
      this.spawnIn = rand(1.6, 3);
    }
  }

  spawnEnemy() {
    const r = Math.random();
    const area = r < 0.45 ? 'front' : r < 0.62 ? 'high' : r < 0.84 ? 'flank' : 'back';
    const spot = this.pickCoverSpot([area]) ?? this.pickCoverSpot(['front', 'high', 'flank', 'back']);
    if (!spot) return;
    this.spawnBot({
      position: spot.hidden.clone(),
      lifetime: 12,
      behavior: {
        type: 'peek',
        spot,
        outSpeed: 4.5,
        hold: [0.2, 0.5],
        wide: Math.random() < 0.4,
        then: 'strafe',
        strafe: { range: 1.8, speed: [2, 4.5], change: [0.3, 1], crouchChance: 0.2, jumpChance: 0.1, stopChance: 0.25 },
      },
      shooter: { reaction: 0.55, interval: 0.32, damage: 9, accuracy: 0.4 },
    });
    // Aviso sonoro (y visual) cuando llegan por donde no estás mirando.
    if (spot.area === 'flank' || spot.area === 'back') {
      this.game.sfx.cue(this.game.panFor(spot.exposed));
      this.game.hud.flash(spot.area === 'back' ? '¡Detrás!' : '¡Flanco!', 'bad');
    }
  }

  results() {
    return { ...this.baseResults(), health: this.health, died: this.died, time: this.elapsed };
  }
}
