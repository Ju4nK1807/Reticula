import * as THREE from 'three';
import { Phase } from './Phase.js';
import { pointFromAngles } from '../../targets/spawn.js';
import { average, clamp, rand, randSign } from '../../utils/math.js';
import { fixed, ms, pct } from '../../utils/format.js';

// Puntos de las fases con dianas: cada impacto suma, cada fallo resta.
const SPHERE_POINTS = { head: 0, body: 100, legs: 0, kill: 0, miss: -80, escaped: -100 };
const toDeg = THREE.MathUtils.radToDeg;
const _dir = new THREE.Vector3();

class SpherePhase extends Phase {
  constructor(ev) {
    super(ev);
    this.points = { ...SPHERE_POINTS };
  }

  // Una diana muere de un impacto (salvo en tracking).
  damageFor() {
    return 1;
  }
}

// ---------------------------------------------------------------------------
// 1. Flicking: una diana a la vez en posiciones aleatorias; escapa si tardas.
// ---------------------------------------------------------------------------
export class SphereFlickPhase extends SpherePhase {
  static info = {
    id: 'flick',
    name: 'Flicking',
    desc: 'Aparece una diana a la vez en una posición aleatoria y escapa a los 2.5 s. Destrúyela lo más rápido posible sin fallar.',
    auto: false,
  };

  static summary(r) {
    return `${pct(r.accuracy)} precisión · ${fixed(r.kps)} obj/s`;
  }

  static details(r) {
    return [
      ['Precisión', pct(r.accuracy)],
      ['Objetivos/s', fixed(r.kps)],
      ['Tiempo por objetivo', ms(r.avgKillMs)],
      ['Escapados', String(r.escaped)],
    ];
  }

  begin() {
    this.killTimes = [];
    this.last = { yaw: 0, pitch: 4 };
    this.next();
  }

  next() {
    const { pos, angles } = this.sphereSpot({ yaw: [-35, 35], pitch: [-3, 16], dist: 12, avoid: [this.last], minSep: 12 });
    this.last = angles;
    this.current = this.spawnSphere({ position: pos, radius: 0.42, color: '#ff3d5a', lifetime: 2.5 });
    this.spawnedAt = this.elapsed;
  }

  onKill(target) {
    if (target !== this.current) return;
    this.killTimes.push(this.elapsed - this.spawnedAt);
    this.next();
  }

  onRemoved(target) {
    if (target === this.current && target.escaped && !this.finished) this.next();
  }

  results() {
    const avg = average(this.killTimes ?? []);
    return { ...this.baseResults(), kps: this.stats.kills / this.duration, avgKillMs: avg === null ? null : avg * 1000 };
  }
}

// ---------------------------------------------------------------------------
// 2. Tracking: diana con strafing, cambios de dirección y saltos. Automático.
// ---------------------------------------------------------------------------
const TRACK_DIST = 12;
const YAW_LIMIT = 30;
const JUMP_TIME = 0.7;

export class SphereTrackingPhase extends SpherePhase {
  static info = {
    id: 'tracking',
    name: 'Tracking',
    desc: 'Mantén clic presionado y sigue la diana: hace strafing, frena, cambia de dirección y salta. Cada bala fuera resta; recarga cuando se vacíe el cargador.',
    auto: true,
  };

  static summary(r) {
    return `${pct(r.onTarget)} sobre el objetivo · ${pct(r.accuracy)} de balas`;
  }

  static details(r) {
    return [
      ['Sobre el objetivo', pct(r.onTarget, 1)],
      ['Balas acertadas', `${pct(r.accuracy)} (${r.hits}/${r.shots})`],
    ];
  }

  constructor(ev) {
    super(ev);
    this.points = { ...SPHERE_POINTS, body: 12, miss: -10 };
    this.onTime = 0;
    this.total = 0;
  }

  damageFor() {
    return 0;
  }

  begin() {
    this.origin = this.game.player.eye.clone();
    this.yaw = 0;
    this.pitch = 3;
    this.vel = randSign() * rand(16, 26); // grados/s
    this.turnIn = rand(0.4, 1.1);
    this.jumpT = -1;
    this.jumpIn = rand(2, 4);
    this.target = this.spawnSphere({ position: this.computePosition(new THREE.Vector3()), radius: 0.5, color: '#ffb020', hp: Infinity, spawnTime: 0 });
  }

  computePosition(out) {
    const jump = this.jumpT >= 0 ? Math.sin((Math.PI * this.jumpT) / JUMP_TIME) * 7 : 0;
    const bob = Math.sin(this.elapsed * 1.1) * 2.5;
    return pointFromAngles(this.yaw, this.pitch + bob + jump, TRACK_DIST, this.origin, out);
  }

  move(dt) {
    this.turnIn -= dt;
    if (this.turnIn <= 0) {
      if (Math.random() < 0.12) this.vel = 0;
      else {
        const dir = this.vel === 0 ? randSign() : Math.random() < 0.7 ? -Math.sign(this.vel) : Math.sign(this.vel);
        this.vel = dir * rand(14, 34);
      }
      this.turnIn = rand(0.3, 1.2);
    }
    this.yaw += this.vel * dt;
    if (Math.abs(this.yaw) > YAW_LIMIT) {
      this.yaw = Math.sign(this.yaw) * YAW_LIMIT;
      this.vel = -this.vel;
    }
    this.jumpIn -= dt;
    if (this.jumpT < 0 && this.jumpIn <= 0) {
      this.jumpT = 0;
      this.jumpIn = rand(2.5, 5);
    }
    if (this.jumpT >= 0) {
      this.jumpT += dt;
      if (this.jumpT > JUMP_TIME) this.jumpT = -1;
    }
    this.computePosition(this.target.position);
  }

  update(dt) {
    super.update(dt);
    if (this.finished) return;
    this.move(dt);
    const g = this.game;
    const cam = g.engine.camera;
    _dir.set(0, 0, -1).applyQuaternion(cam.quaternion);
    const on = g.ballistics.cast(cam.position, _dir, this.hitMeshes())?.bot === this.target;
    this.total += dt;
    if (on) this.onTime += dt;
    this.target.setHighlight(on);
  }

  hudStats() {
    return { ...super.hudStats(), accLabel: 'Sobre objetivo', accText: pct(this.total ? this.onTime / this.total : null) };
  }

  results() {
    return { ...this.baseResults(), onTarget: this.total ? this.onTime / this.total : 0 };
  }
}

// ---------------------------------------------------------------------------
// 3. Reacción: la diana aparece cerca de la mira tras una espera aleatoria.
// ---------------------------------------------------------------------------
const TRIALS = 8;
const TIMEOUT = 1.5;

export class SphereReactionPhase extends SpherePhase {
  static info = {
    id: 'reaction',
    name: 'Reacción',
    desc: `Mantén la mira quieta y espera. Cuando aparezca la diana, dispárale lo antes posible. Disparar antes de tiempo resta. ${TRIALS} intentos.`,
    auto: false,
  };

  static summary(r) {
    return `${ms(r.avgMs)} de reacción promedio`;
  }

  static details(r) {
    return [
      ['Promedio', ms(r.avgMs)],
      ['Mejor', ms(r.bestMs)],
      ['Anticipados', String(r.early)],
      ['Sin responder', String(r.escaped)],
    ];
  }

  constructor(ev) {
    super(ev);
    this.duration = Infinity;
    this.trial = 0;
    this.times = [];
    this.early = 0;
    this.state = 'idle';
  }

  begin() {
    this.armWait();
  }

  armWait() {
    this.state = 'wait';
    this.wait = rand(1.0, 3.0);
    this.current = null;
  }

  show() {
    const p = this.game.player;
    const a = rand(0, Math.PI * 2);
    const off = rand(2, 5);
    const yaw = toDeg(p.yaw) + Math.cos(a) * off;
    const pitch = clamp(toDeg(p.pitch) + Math.sin(a) * off, -30, 45);
    this.current = this.spawnSphere({
      position: pointFromAngles(yaw, pitch, 10, p.eye),
      radius: 0.55,
      color: '#36d6ff',
      spawnTime: 0,
      lifetime: TIMEOUT,
    });
    this.state = 'show';
    this.shownAt = this.elapsed;
  }

  nextTrial() {
    this.trial++;
    if (this.trial >= TRIALS) {
      this.state = 'done';
      this.finished = true;
    } else this.armWait();
  }

  update(dt) {
    super.update(dt);
    if (this.state === 'wait') {
      this.wait -= dt;
      if (this.wait <= 0) this.show();
    }
  }

  onMiss() {
    if (this.state !== 'wait') return;
    this.early++;
    this.game.sfx.error();
    this.game.hud.flash('¡Muy pronto!', 'bad');
    this.wait = rand(1.0, 3.0);
  }

  onKill(target) {
    if (target !== this.current) return;
    const rt = (this.elapsed - this.shownAt) * 1000;
    this.times.push(rt);
    this.score += Math.max(0, Math.round(800 - rt));
    this.game.hud.flash(`${Math.round(rt)} ms`, 'good');
    this.nextTrial();
  }

  onRemoved(target) {
    if (target === this.current && target.escaped) this.nextTrial();
  }

  // Si se pausa con la diana visible, el intento se repite.
  onPause() {
    if (this.state === 'show' && this.current?.alive) {
      this.current.state = 'gone';
      this.armWait();
    }
  }

  hudStats() {
    return {
      score: Math.round(this.score),
      accLabel: 'Promedio',
      accText: ms(average(this.times)),
      time: `${Math.min(this.trial + 1, TRIALS)}/${TRIALS}`,
    };
  }

  results() {
    return {
      ...this.baseResults(),
      avgMs: average(this.times),
      bestMs: this.times.length ? Math.min(...this.times) : null,
      early: this.early,
      trials: TRIALS,
    };
  }
}

// ---------------------------------------------------------------------------
// 4. Multi-objetivo (estilo Gridshot): tres dianas a la vez, máxima velocidad.
// ---------------------------------------------------------------------------
export class SphereMultiPhase extends SpherePhase {
  static info = {
    id: 'multi',
    name: 'Multi-objetivo',
    desc: 'Tres dianas a la vez. Cambia de objetivo lo más rápido que puedas manteniendo la precisión. Cuida el cargador: recargar en mal momento cuesta tiempo.',
    auto: false,
  };

  static summary(r) {
    return `${fixed(r.kps)} obj/s · ${pct(r.accuracy)} precisión`;
  }

  static details(r) {
    return [
      ['Objetivos/s', fixed(r.kps)],
      ['Precisión', pct(r.accuracy)],
      ['Aciertos', `${r.hits}/${r.shots}`],
    ];
  }

  begin() {
    for (let i = 0; i < 3; i++) this.spawnOne();
  }

  spawnOne() {
    const avoid = this.bots.filter((t) => t.alive).map((t) => t.angles);
    const { pos, angles } = this.sphereSpot({ yaw: [-20, 20], pitch: [0, 14], dist: 11, avoid, minSep: 7 });
    this.spawnSphere({ position: pos, radius: 0.35, color: '#00e0a0' }).angles = angles;
  }

  onKill() {
    this.spawnOne();
  }

  results() {
    return { ...this.baseResults(), kps: this.stats.kills / this.duration };
  }
}

// ---------------------------------------------------------------------------
// 5. Precisión: dianas pequeñas y lejanas.
// ---------------------------------------------------------------------------
export class SpherePrecisionPhase extends SpherePhase {
  static info = {
    id: 'precision',
    name: 'Precisión',
    desc: 'Dianas pequeñas y lejanas, tres a la vez. Asegura cada disparo: un fallo resta más de lo que suma un acierto.',
    auto: false,
  };

  static summary(r) {
    return `${pct(r.accuracy)} precisión · ${fixed(r.kps)} obj/s`;
  }

  static details(r) {
    return [
      ['Precisión', pct(r.accuracy)],
      ['Objetivos/s', fixed(r.kps)],
      ['Aciertos', `${r.hits}/${r.shots}`],
    ];
  }

  constructor(ev) {
    super(ev);
    this.points = { ...SPHERE_POINTS, body: 150, miss: -180 };
  }

  begin() {
    for (let i = 0; i < 3; i++) this.spawnOne();
  }

  spawnOne() {
    const avoid = this.bots.filter((t) => t.alive).map((t) => t.angles);
    const { pos, angles } = this.sphereSpot({ yaw: [-16, 16], pitch: [0, 12], dist: 15, avoid, minSep: 5 });
    this.spawnSphere({ position: pos, radius: 0.15, color: '#b46cff' }).angles = angles;
  }

  onKill() {
    this.spawnOne();
  }

  results() {
    return { ...this.baseResults(), kps: this.stats.kills / this.duration };
  }
}
