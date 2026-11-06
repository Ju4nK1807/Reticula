import * as THREE from 'three';
import { Phase } from '../evaluation/Phase.js';
import { CoordTarget } from './CoordTarget.js';
import { PERIPHERAL_WINDOW, SEQUENCE_SIZE, drillScore, nextSetSize, nextWindow } from './coordScoring.js';
import { pointFromAngles } from '../../targets/spawn.js';
import { fixed, ms, pct } from '../../utils/format.js';
import { average, clamp, rand, randSign } from '../../utils/math.js';

export const DRILL_TIME = 45; // s por ejercicio
const TARGET_DIST = 12;
// Las dianas no bajan de 0° de inclinación: más abajo, el arma en pantalla (abajo a la derecha) las tapa.
const toDeg = THREE.MathUtils.radToDeg;
const _dir = new THREE.Vector3();

// Base de los ejercicios: objetivos CoordTarget que mueren de un impacto y puntuación 0-100.
class CoordDrill extends Phase {
  constructor(mode) {
    super(mode);
    this.duration = DRILL_TIME;
    this.points = { head: 0, body: 100, legs: 0, kill: 0, miss: -40, escaped: 0 };
  }

  damageFor() {
    return 1;
  }

  spawnTarget(opts) {
    const t = new CoordTarget(this.root, opts);
    this.bots.push(t);
    return t;
  }

  // Los objetivos que caducan no son "enemigos que escapan": cada ejercicio decide qué significa.
  onEscape() {}

  aimDirection(out = _dir) {
    return out.set(0, 0, -1).applyQuaternion(this.game.engine.camera.quaternion);
  }

  // ¿La mira está sobre `mesh`? (rayo desde el centro de la cámara, respetando paredes)
  aimingAt(target) {
    const cam = this.game.engine.camera;
    return this.game.ballistics.cast(cam.position, this.aimDirection(), target.hitMeshes)?.bot === target;
  }

  // Datos para el HUD propio del modo (CoordHud). null = nada que mostrar.
  overlay() {
    return null;
  }

  // Métricas específicas del ejercicio (cada subclase), más la puntuación 0-100 (`rating`).
  metrics() {
    return {};
  }

  results() {
    const r = { ...this.baseResults(), ...this.metrics() };
    return { ...r, rating: drillScore(this.info.id, r) };
  }
}

// ---------------------------------------------------------------------------
// 1. Secuencia: dianas numeradas que se destruyen en orden.
// ---------------------------------------------------------------------------
const SEQUENCE_PENALTY = -60;
const NEXT_SET_DELAY = 0.35;

export class SequenceDrill extends CoordDrill {
  static info = {
    id: 'sequence',
    name: 'Secuencia',
    short: 'Destruye las dianas numeradas en orden',
    desc: 'Aparecen dianas numeradas. Destrúyelas en orden: 1, 2, 3… Disparar a un número que no toca es un error y no la destruye. Cada serie limpia suma una diana a la siguiente; dos errores restan una.',
    auto: false,
  };

  static summary(r) {
    return `${fixed(r.tps)} dianas/s · ${r.orderErrors} errores de orden`;
  }

  static details(r) {
    return [
      ['Dianas por segundo', fixed(r.tps)],
      ['Series completadas', String(r.sets)],
      ['Serie más larga', `${r.maxSize} dianas`],
      ['Errores de orden', String(r.orderErrors)],
      ['Precisión', pct(r.accuracy)],
    ];
  }

  begin() {
    this.size = SEQUENCE_SIZE.start;
    this.maxSize = this.size;
    this.sets = 0;
    this.orderErrors = 0;
    this.newSetIn = 0;
    this.newSet();
  }

  newSet() {
    for (const t of this.bots) t.remove();
    this.next = 1;
    this.setErrors = 0;
    const placed = [];
    for (let i = 1; i <= this.size; i++) {
      const { pos, angles } = this.sphereSpot({ yaw: [-38, 38], pitch: [0, 22], dist: TARGET_DIST, avoid: placed, minSep: 9 });
      placed.push(angles);
      this.spawnTarget({ position: pos, radius: 0.5, color: '#36d6ff', label: i, data: { order: i } });
    }
  }

  handleShot(hit, time) {
    const t = hit?.bot;
    if (t?.alive && t.data.order !== this.next) {
      this.shotTime = time;
      this.stats.shots++;
      this.orderErrors++;
      this.setErrors++;
      this.score += SEQUENCE_PENALTY;
      t.flashWrong();
      this.game.sfx.error();
      this.game.hud.flash(`Ese es el ${t.data.order}: toca el ${this.next}`, 'bad');
      return;
    }
    super.handleShot(hit, time);
  }

  onKill() {
    this.next++;
    if (this.next > this.size) {
      this.sets++;
      const grew = this.setErrors === 0 && this.size < SEQUENCE_SIZE.max;
      this.size = nextSetSize(this.size, this.setErrors);
      this.maxSize = Math.max(this.maxSize, this.size);
      this.game.hud.flash(this.setErrors === 0 ? (grew ? `Serie limpia · ahora ${this.size}` : 'Serie limpia') : 'Serie completa', 'good');
      this.newSetIn = NEXT_SET_DELAY;
    }
  }

  update(dt) {
    super.update(dt);
    if (this.newSetIn > 0) {
      this.newSetIn -= dt;
      if (this.newSetIn <= 0 && !this.finished) this.newSet();
    }
  }

  overlay() {
    return { kind: 'sequence', next: Math.min(this.next, this.size), size: this.size, sets: this.sets };
  }

  hudStats() {
    return { ...super.hudStats(), accLabel: 'Series', accText: String(this.sets ?? 0) };
  }

  metrics() {
    return {
      tps: this.stats.kills / this.duration,
      orderErrors: this.orderErrors ?? 0,
      sets: this.sets ?? 0,
      maxSize: this.maxSize ?? SEQUENCE_SIZE.start,
    };
  }
}

// ---------------------------------------------------------------------------
// 2. Color objetivo: solo se dispara a la figura indicada; la regla cambia sin aviso.
// ---------------------------------------------------------------------------
// Cada color tiene su forma: se puede jugar con daltonismo guiándose por la silueta.
export const COLOR_RULES = [
  { id: 'blue', name: 'Azul', shape: 'sphere', shapeName: 'esfera', color: '#3d8bff' },
  { id: 'yellow', name: 'Amarillo', shape: 'cube', shapeName: 'cubo', color: '#ffd23d' },
  { id: 'magenta', name: 'Magenta', shape: 'pyramid', shapeName: 'pirámide', color: '#ff4fd8' },
  { id: 'green', name: 'Verde', shape: 'diamond', shapeName: 'diamante', color: '#3dffa0' },
];
const COLOR_TARGETS = 6; // figuras a la vez
const COLOR_MIN_GOALS = 2; // siempre hay al menos 2 figuras correctas
const COLOR_GOAL_CHANCE = 0.3;
const COLOR_LIFETIME = [2.2, 3.4];
const COLOR_SWITCH = [5, 9]; // s entre cambios de regla
const COLOR_WRONG_PENALTY = -150;
const COLOR_OMISSION_PENALTY = -30;

export class ColorDrill extends CoordDrill {
  static info = {
    id: 'color',
    name: 'Color objetivo',
    short: 'Dispara solo a la figura indicada',
    desc: 'Dispara solo a la figura indicada arriba: cada color tiene su forma (azul esfera, amarillo cubo, magenta pirámide, verde diamante). La regla cambia de repente: adáptate rápido y no dispares a las demás.',
    auto: false,
  };

  static summary(r) {
    return `${r.correct} correctas · ${r.wrong} prohibidas`;
  }

  static details(r) {
    return [
      ['Aciertos correctos', `${r.correct} (${fixed(r.cps)}/s)`],
      ['Figuras prohibidas', `${r.wrong} (${pct(r.commissionRate)})`],
      ['Correctas que se fueron', String(r.omissions)],
      ['Reacción al cambio', ms(r.switchMs)],
      ['Cambios de regla', String(r.switches)],
    ];
  }

  begin() {
    this.rule = COLOR_RULES[Math.floor(Math.random() * COLOR_RULES.length)];
    this.correct = 0;
    this.wrong = 0;
    this.omissions = 0;
    this.switches = 0;
    this.switchTimes = [];
    this.awaitSwitch = false;
    this.nextSwitchAt = rand(...COLOR_SWITCH);
    for (let i = 0; i < COLOR_TARGETS; i++) this.spawnOne();
  }

  isGoal(t) {
    return t.data.rule === this.rule.id;
  }

  spawnOne() {
    const alive = this.bots.filter((t) => t.alive);
    const goals = alive.filter((t) => this.isGoal(t)).length;
    const goal = goals < COLOR_MIN_GOALS || Math.random() < COLOR_GOAL_CHANCE;
    const others = COLOR_RULES.filter((r) => r.id !== this.rule.id);
    const rule = goal ? this.rule : others[Math.floor(Math.random() * others.length)];
    const { pos, angles } = this.sphereSpot({
      yaw: [-36, 36],
      pitch: [0, 20],
      dist: TARGET_DIST,
      avoid: alive.map((t) => t.data.angles),
      minSep: 8,
    });
    this.spawnTarget({
      position: pos,
      radius: 0.5,
      color: rule.color,
      shape: rule.shape,
      spin: 0.9,
      lifetime: rand(...COLOR_LIFETIME),
      data: { rule: rule.id, angles },
    });
  }

  switchRule() {
    const options = COLOR_RULES.filter((r) => r.id !== this.rule.id);
    this.rule = options[Math.floor(Math.random() * options.length)];
    this.switches++;
    this.switchedAt = performance.now();
    this.awaitSwitch = true;
    this.nextSwitchAt = this.elapsed + rand(...COLOR_SWITCH);
    this.game.sfx.beep(true);
    this.game.hud.flash(`Ahora: ${this.rule.name} · ${this.rule.shapeName}`, 'info');
  }

  handleShot(hit, time) {
    const t = hit?.bot;
    if (t?.alive && !this.isGoal(t)) {
      this.shotTime = time;
      this.stats.shots++;
      this.wrong++;
      this.score += COLOR_WRONG_PENALTY;
      t.damage(1); // la figura prohibida se destruye igual (con error)
      this.game.sfx.error();
      this.game.hud.flash('Figura prohibida', 'bad');
      return;
    }
    super.handleShot(hit, time);
  }

  onKill() {
    this.correct++;
    if (this.awaitSwitch) {
      this.switchTimes.push(Math.max(0, this.shotTime - this.switchedAt));
      this.awaitSwitch = false;
    }
  }

  onEscape(t) {
    if (t.data.rule !== this.rule.id) return; // dejar ir una figura prohibida es lo correcto
    this.omissions++;
    this.score += COLOR_OMISSION_PENALTY;
  }

  // Una pausa invalida la medición de reacción al cambio en curso.
  onPause() {
    this.awaitSwitch = false;
  }

  update(dt) {
    super.update(dt);
    if (this.finished) return;
    if (this.elapsed >= this.nextSwitchAt) this.switchRule();
    while (this.bots.filter((t) => t.alive).length < COLOR_TARGETS) this.spawnOne();
  }

  overlay() {
    return { kind: 'color', rule: this.rule, switches: this.switches };
  }

  hudStats() {
    return { ...super.hudStats(), accLabel: 'Correctas', accText: String(this.correct ?? 0) };
  }

  metrics() {
    const correct = this.correct ?? 0;
    const wrong = this.wrong ?? 0;
    return {
      correct,
      wrong,
      omissions: this.omissions ?? 0,
      switches: this.switches ?? 0,
      cps: correct / this.duration,
      commissionRate: correct + wrong ? wrong / (correct + wrong) : 0,
      switchMs: average(this.switchTimes ?? []),
    };
  }
}

// ---------------------------------------------------------------------------
// 3. Periferia: con la mirada en el centro, objetivos en los bordes de la pantalla.
// ---------------------------------------------------------------------------
const FIX_TOLERANCE = 3; // grados alrededor del punto central
const FIX_HOLD = 0.25; // s fijando la mirada antes de armar el siguiente objetivo
const FIX_DELAY = [0.35, 1.3]; // espera aleatoria (impredecible) tras fijar
const ANCHOR_PITCH = 3;
const PERIPHERAL_PENALTY = -40;
// Zonas: offset horizontal y vertical como fracción de la mitad del FOV real.
const ZONES = [
  { id: 'left', name: 'Izquierda', weight: 0.3, h: [-0.88, -0.55], v: [-0.15, 0.45] },
  { id: 'right', name: 'Derecha', weight: 0.3, h: [0.55, 0.88], v: [-0.15, 0.45] },
  { id: 'up', name: 'Arriba', weight: 0.2, h: [-0.35, 0.35], v: [0.6, 0.85] },
  { id: 'diag', name: 'Diagonales', weight: 0.2, h: [0.45, 0.75], v: [0.45, 0.7], mirror: true },
];

function pickZone() {
  let r = Math.random();
  for (const z of ZONES) if ((r -= z.weight) <= 0) return z;
  return ZONES[0];
}

export class PeripheralDrill extends CoordDrill {
  static info = {
    id: 'peripheral',
    name: 'Periferia',
    short: 'Objetivos en los bordes de la pantalla',
    desc: 'Mantén la mira en el aro central. Aparecerán objetivos en los bordes de la pantalla durante muy poco tiempo: dispárales y vuelve al centro. Solo aparecen mientras miras el aro, y su duración se ajusta a tu nivel.',
    auto: false,
  };

  static summary(r) {
    return `${pct(r.hitRate)} acertados · ventana ${fixed(r.window)} s`;
  }

  static details(r) {
    return [
      ['Acertados', `${r.hits}/${r.hits + r.misses} (${pct(r.hitRate)})`],
      ['Ventana final', `${fixed(r.window)} s`],
      ['Reacción promedio', ms(r.avgMs)],
      ...Object.values(r.zones).map((z) => [z.name, z.total ? `${z.hits}/${z.total}` : '—']),
      ['Disparos sin objetivo', String(r.falseShots)],
    ];
  }

  constructor(mode) {
    super(mode);
    this.duration = DRILL_TIME;
    this.points = { head: 0, body: 120, legs: 0, kill: 0, miss: PERIPHERAL_PENALTY, escaped: 0 };
  }

  begin() {
    this.window = PERIPHERAL_WINDOW.start;
    this.hits = 0;
    this.misses = 0;
    this.times = [];
    this.zones = Object.fromEntries(ZONES.map((z) => [z.id, { name: z.name, hits: 0, total: 0 }]));
    this.phase = 'fixate';
    this.holdT = 0;
    this.current = null;
    this.anchorPos = pointFromAngles(0, ANCHOR_PITCH, TARGET_DIST, this.game.player.eye);
    const anchor = new THREE.Mesh(
      new THREE.TorusGeometry(0.28, 0.045, 8, 28),
      new THREE.MeshBasicMaterial({ color: '#e7edf5' }),
    );
    anchor.position.copy(this.anchorPos);
    anchor.lookAt(this.game.player.eye);
    this.root.add(anchor);
    this.anchor = anchor;
  }

  fixating() {
    return this.angleFromAim(this.anchorPos) <= FIX_TOLERANCE;
  }

  spawnPeripheral() {
    const g = this.game;
    const hHalf = g.engine.horizontalFov / 2;
    const vHalf = g.engine.camera.fov / 2;
    const zone = pickZone();
    const side = zone.mirror ? randSign() : 1;
    const yaw = -side * rand(...zone.h) * hHalf; // yaw positivo = izquierda
    const pitch = clamp(ANCHOR_PITCH + rand(...zone.v) * vHalf, -4, 34);
    const pos = pointFromAngles(yaw, pitch, TARGET_DIST, g.player.eye);
    this.current = this.spawnTarget({
      position: pos,
      radius: 0.45,
      color: '#ffb020',
      spawnTime: 0,
      lifetime: this.window,
      data: { zone: zone.id },
    });
    this.zones[zone.id].total++;
    this.shownAt = performance.now();
    this.phase = 'target';
  }

  onKill(t) {
    if (t !== this.current) return;
    this.hits++;
    this.zones[t.data.zone].hits++;
    const rt = Math.max(0, this.shotTime - this.shownAt);
    this.times.push(rt);
    this.window = nextWindow(this.window, true);
    this.game.hud.flash(`${Math.round(rt)} ms`, 'good');
    this.toFixate();
  }

  onEscape(t) {
    if (t !== this.current) return;
    this.misses++;
    this.window = nextWindow(this.window, false);
    this.toFixate();
  }

  toFixate() {
    this.current = null;
    this.phase = 'fixate';
    this.holdT = 0;
  }

  // Si se pausa con un objetivo visible, ese intento no cuenta.
  onPause() {
    if (this.phase === 'target' && this.current?.alive) {
      this.zones[this.current.data.zone].total--;
      this.current.remove();
    }
    this.toFixate();
  }

  update(dt) {
    super.update(dt);
    if (this.finished || !this.anchor) return;
    const fix = this.fixating();
    this.anchor.material.color.set(fix ? '#00ffa3' : '#e7edf5');
    if (this.phase === 'fixate') {
      this.holdT = fix ? this.holdT + dt : 0;
      if (this.holdT >= FIX_HOLD) {
        this.phase = 'delay';
        this.delayT = rand(...FIX_DELAY);
      }
    } else if (this.phase === 'delay') {
      if (!fix) this.toFixate();
      else if ((this.delayT -= dt) <= 0) this.spawnPeripheral();
    }
  }

  overlay() {
    return { kind: 'peripheral', fixated: this.anchor ? this.fixating() : false, phase: this.phase, window: this.window };
  }

  hudStats() {
    return { ...super.hudStats(), accLabel: 'Ventana', accText: `${fixed(this.window ?? PERIPHERAL_WINDOW.start)} s` };
  }

  metrics() {
    const hits = this.hits ?? 0;
    const misses = this.misses ?? 0;
    return {
      hits,
      misses,
      hitRate: hits + misses ? hits / (hits + misses) : 0,
      window: this.window ?? PERIPHERAL_WINDOW.start,
      avgMs: average(this.times ?? []),
      zones: this.zones ?? {},
      falseShots: this.stats.shots - this.stats.hits,
    };
  }

  dispose() {
    super.dispose();
    if (this.anchor) {
      this.anchor.removeFromParent();
      this.anchor.geometry.dispose();
      this.anchor.material.dispose();
      this.anchor = null;
    }
  }
}

// ---------------------------------------------------------------------------
// 4. Doble tarea: seguir una esfera con la mira y reaccionar a dianas que aparecen.
// ---------------------------------------------------------------------------
const TRACK_YAW = 30;
const TRACK_SPEED = [12, 28]; // grados/s
const REACT_EVERY = [1.4, 2.8];
const REACT_LIFETIME = 1.6;
const REACT_OFFSET = [12, 32]; // grados desde la esfera
const DUAL_PENALTY = -25;

export class DualTaskDrill extends CoordDrill {
  static info = {
    id: 'dual',
    name: 'Doble tarea',
    short: 'Sigue la esfera y reacciona a las dianas',
    desc: 'Mantén la mira sobre la esfera naranja que se mueve (no hace falta dispararle). Cuando aparezca una diana azul, dispárale y vuelve a la esfera lo antes posible: también se mide cuánto tardas en volver.',
    auto: false,
  };

  static summary(r) {
    return `${pct(r.onTarget)} sobre la esfera · ${r.hits}/${r.spawned} dianas`;
  }

  static details(r) {
    return [
      ['Sobre la esfera', pct(r.onTarget, 1)],
      ['Dianas acertadas', `${r.hits}/${r.spawned} (${pct(r.hitRate)})`],
      ['Reacción promedio', ms(r.avgMs)],
      ['Vuelta a la esfera', ms(r.returnMs)],
      ['Disparos sin objetivo', String(r.falseShots)],
    ];
  }

  constructor(mode) {
    super(mode);
    this.points = { head: 0, body: 120, legs: 0, kill: 0, miss: DUAL_PENALTY, escaped: 0 };
    this.onTime = 0;
    this.total = 0;
  }

  begin() {
    this.origin = this.game.player.eye.clone();
    this.yaw = 0;
    this.pitch = 5;
    this.vel = randSign() * rand(...TRACK_SPEED);
    this.turnIn = rand(0.5, 1.3);
    this.track = new CoordTarget(this.root, { position: this.trackPosition(new THREE.Vector3()), radius: 0.55, color: '#ff8a3d', spawnTime: 0 });
    this.reactIn = rand(...REACT_EVERY);
    this.current = null;
    this.hits = 0;
    this.spawned = 0;
    this.times = [];
    this.returnTimes = [];
    this.returnFrom = null;
    this.on = false;
  }

  trackPosition(out) {
    const bob = Math.sin(this.elapsed * 0.9) * 3;
    return pointFromAngles(this.yaw, this.pitch + bob, TARGET_DIST, this.origin, out);
  }

  moveTrack(dt) {
    this.turnIn -= dt;
    if (this.turnIn <= 0) {
      const dir = Math.random() < 0.65 ? -Math.sign(this.vel || 1) : Math.sign(this.vel || 1);
      this.vel = Math.random() < 0.1 ? 0 : dir * rand(...TRACK_SPEED);
      this.turnIn = rand(0.4, 1.4);
    }
    this.yaw += this.vel * dt;
    if (Math.abs(this.yaw) > TRACK_YAW) {
      this.yaw = Math.sign(this.yaw) * TRACK_YAW;
      this.vel = -this.vel;
    }
    this.track.moveTo(this.trackPosition(_dir));
    this.track.update(dt);
  }

  spawnReaction() {
    const a = rand(0, Math.PI * 2);
    const off = rand(...REACT_OFFSET);
    const yaw = clamp(this.yaw + Math.cos(a) * off, -55, 55);
    const pitch = clamp(this.pitch + Math.sin(a) * off * 0.6, -3, 28);
    this.current = this.spawnTarget({
      position: pointFromAngles(yaw, pitch, TARGET_DIST, this.origin),
      radius: 0.45,
      color: '#36d6ff',
      spawnTime: 0,
      lifetime: REACT_LIFETIME,
    });
    this.spawned++;
    this.shownAt = performance.now();
  }

  onKill(t) {
    if (t !== this.current) return;
    this.hits++;
    const rt = Math.max(0, this.shotTime - this.shownAt);
    this.times.push(rt);
    this.returnFrom = this.shotTime;
    this.current = null;
    this.reactIn = rand(...REACT_EVERY);
  }

  onEscape(t) {
    if (t !== this.current) return;
    this.current = null;
    this.reactIn = rand(...REACT_EVERY);
  }

  onPause() {
    this.returnFrom = null; // el reloj real siguió corriendo
    if (this.current?.alive) {
      this.current.remove();
      this.spawned--;
      this.current = null;
      this.reactIn = rand(...REACT_EVERY);
    }
  }

  update(dt) {
    super.update(dt);
    if (this.finished || !this.track) return;
    this.moveTrack(dt);
    this.on = this.aimingAt(this.track);
    this.track.setHighlight(this.on);
    this.total += dt;
    if (this.on) {
      this.onTime += dt;
      if (this.returnFrom !== null) {
        this.returnTimes.push(performance.now() - this.returnFrom);
        this.returnFrom = null;
      }
    }
    if (!this.current && (this.reactIn -= dt) <= 0) this.spawnReaction();
  }

  overlay() {
    return { kind: 'dual', on: this.on, onTarget: this.total ? this.onTime / this.total : 0 };
  }

  hudStats() {
    return { ...super.hudStats(), accLabel: 'Sobre la esfera', accText: pct(this.total ? this.onTime / this.total : null) };
  }

  metrics() {
    const spawned = this.spawned ?? 0;
    const hits = this.hits ?? 0;
    return {
      onTarget: this.total ? this.onTime / this.total : 0,
      hits,
      spawned,
      hitRate: spawned ? hits / spawned : 0,
      avgMs: average(this.times ?? []),
      returnMs: average(this.returnTimes ?? []),
      falseShots: this.stats.shots - this.stats.hits,
    };
  }

  dispose() {
    super.dispose();
    this.track?.dispose();
    this.track = null;
  }
}

export const DRILLS = [SequenceDrill, ColorDrill, PeripheralDrill, DualTaskDrill];
export const DRILL_BY_ID = Object.fromEntries(DRILLS.map((D) => [D.info.id, D]));
