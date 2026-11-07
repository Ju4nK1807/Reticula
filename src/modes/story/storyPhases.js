import * as THREE from 'three';
import { Phase } from '../evaluation/Phase.js';
import { MissionPhase } from '../campaign/MissionPhase.js';
import { CoordTarget } from '../coordination/CoordTarget.js';
import { clock } from '../../utils/format.js';
import { missionTotal } from './storyData.js';

const REGEN_DELAY = 4; // s sin recibir daño antes de recuperar vida
const REGEN_RATE = 22; // vida por segundo
const _c = new THREE.Vector3();

/*
  Fases de la Historia. Todas avisan al modo con `phase.events` (cola que el modo vacía cada cuadro):
    { type: 'kill', kills } · { type: 'encounter', index } · { type: 'round', index, seq }
  así el modo dispara los diálogos de radio sin que las fases sepan de la historia.
*/

// Vida que se recupera sola tras unos segundos sin daño (estilo de las campañas de shooter).
function regen(phase, dt) {
  if (phase.died || phase.health >= 100) return;
  phase.sinceHit += dt;
  if (phase.sinceHit < REGEN_DELAY) return;
  phase.health = Math.min(100, phase.health + REGEN_RATE * dt);
  phase.game.hud.setHealth(phase.health / 100);
}

// Explosión de granada: daño a los enemigos que la ven, con caída por distancia.
function explode(phase, point, radius, los, damageAt) {
  for (const bot of phase.bots) {
    if (!bot.alive) continue;
    const chest = bot.chestPosition(_c);
    const d = chest.distanceTo(point);
    if (d > radius || !los(chest)) continue;
    const { killed } = bot.damage(damageAt(d));
    if (!killed) continue;
    phase.stats.kills++;
    phase.score += phase.points.kill;
    phase.game.hud.hitmarker('kill');
    phase.onKill(bot, 'body');
  }
}

// --- Misión con soldados -------------------------------------------------------------------------

export class StoryMission extends MissionPhase {
  static info = { id: 'story-mission', name: 'Misión', desc: '', auto: false, health: true };

  constructor(mode, chapter) {
    super(mode, {
      encounters: chapter.encounters,
      total: missionTotal(chapter),
      time: Infinity, // sin límite de tiempo: la historia no se juega contra el reloj
      difficulty: chapter.difficulty ?? 3,
      goals: [0, 0, 0],
    });
    this.events = [];
    this.sinceHit = REGEN_DELAY;
    this.lastEnc = 0;
  }

  update(dt) {
    super.update(dt);
    regen(this, dt);
    if (this.encIndex !== this.lastEnc && this.encounter) this.events.push({ type: 'encounter', index: this.encIndex });
    this.lastEnc = this.encIndex;
  }

  onKill() {
    this.events.push({ type: 'kill', kills: this.stats.kills });
  }

  takeDamage(amount, from) {
    this.sinceHit = 0;
    super.takeDamage(amount, from);
  }

  onExplosion(point, radius, los, damageAt) {
    explode(this, point, radius, los, damageAt);
  }

  // Los que se van no restan nada: en la historia no hay puntuación que castigar.
  onEscape() {}

  progressText() {
    return `${this.remaining} ${this.remaining === 1 ? 'enemigo' : 'enemigos'}`;
  }

  hudStats() {
    return { score: this.stats.kills, scoreLabel: 'Bajas', accLabel: 'Quedan', accText: String(this.remaining), time: clock(this.elapsed) };
  }
}

// --- Campo de tiro: dianas -----------------------------------------------------------------------

export class StoryTargets extends Phase {
  static info = { id: 'story-targets', name: 'Dianas', desc: '', auto: false, health: false };

  constructor(mode, chapter) {
    super(mode);
    this.duration = Infinity;
    this.total = chapter.targets ?? 20;
    this.concurrent = 2;
    this.spawned = 0;
    this.events = [];
    this.spawnT = 0.6;
    this.completed = false;
  }

  update(dt) {
    super.update(dt);
    if (this.finished) return;
    const alive = this.bots.filter((b) => b.alive).length;
    this.spawnT -= dt;
    if (this.spawned < this.total && alive < this.concurrent && this.spawnT <= 0) {
      const avoid = this.bots.filter((b) => b.alive).map((b) => b.angles);
      const { pos, angles } = this.sphereSpot({ yaw: [-32, 32], pitch: [-2, 16], dist: [11, 20], avoid, minSep: 10, minAim: 8 });
      const t = this.spawnSphere({ position: pos, radius: 0.42, color: '#ff3d5a' });
      t.angles = angles;
      this.spawned++;
      this.spawnT = 0.35;
    }
    if (this.stats.kills >= this.total) {
      this.completed = true;
      this.finished = true;
    }
  }

  onKill() {
    this.events.push({ type: 'kill', kills: this.stats.kills });
  }

  onMiss() {
    this.game.hud.flash('Fallo', 'bad');
  }

  progressText() {
    return `${this.stats.kills} / ${this.total} dianas`;
  }

  hudStats() {
    const acc = this.accuracy;
    return { score: this.stats.kills, scoreLabel: 'Dianas', accLabel: 'Precisión', accText: acc == null ? '—' : `${Math.round(acc * 100)}%`, time: clock(this.elapsed) };
  }
}

// --- La Cúpula: secuencias de números ----------------------------------------------------------------

const LISTEN_BASE = 1.4; // s de escucha antes de que aparezcan los números
const LISTEN_PER_DIGIT = 0.75;
const DECOYS = 2; // números de más que no están en la secuencia
const ROUND_GAP = 1.6;

/**
 * Siguiente estado de una secuencia al disparar a `digit`.
 * Devuelve { ok, next, done }: si falla, vuelve al principio (next = 0).
 */
export function sequenceStep(seq, next, digit) {
  if (seq[next] !== digit) return { ok: false, next: 0, done: false };
  return { ok: true, next: next + 1, done: next + 1 >= seq.length };
}

/** Números que aparecen en una ronda: los de la secuencia más `decoys` que no están (sin repetir). */
export function roundDigits(seq, decoys = DECOYS, random = Math.random) {
  const pool = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].filter((d) => !seq.includes(d));
  const extra = [];
  while (extra.length < decoys && pool.length) extra.push(pool.splice(Math.floor(random() * pool.length), 1)[0]);
  return [...seq, ...extra];
}

export class StoryNumbers extends Phase {
  static info = { id: 'story-numbers', name: 'Números', desc: '', auto: false, health: false };

  constructor(mode, chapter) {
    super(mode);
    this.duration = Infinity;
    this.rounds = chapter.rounds;
    this.round = -1;
    this.next = 0;
    this.errors = 0;
    this.events = [];
    this.waitT = 0.8;
    this.stage = 'gap'; // gap → listen → shoot
    this.completed = false;
  }

  get seq() {
    return this.rounds[this.round] ?? [];
  }

  update(dt) {
    super.update(dt);
    if (this.finished) return;
    if (this.stage === 'shoot') return;
    this.waitT -= dt;
    if (this.waitT > 0) return;
    if (this.stage === 'gap') {
      this.round++;
      if (this.round >= this.rounds.length) {
        this.completed = true;
        this.finished = true;
        return;
      }
      this.stage = 'listen';
      this.waitT = LISTEN_BASE + LISTEN_PER_DIGIT * this.seq.length;
      this.events.push({ type: 'round', index: this.round, seq: this.seq });
    } else if (this.stage === 'listen') {
      this.stage = 'shoot';
      this.layout();
    }
  }

  // Coloca los números de la ronda (mezclados) delante del jugador.
  layout() {
    for (const t of this.bots) t.remove();
    this.next = 0;
    const digits = roundDigits(this.seq).sort(() => Math.random() - 0.5);
    const placed = [];
    for (const d of digits) {
      const { pos, angles } = this.sphereSpot({ yaw: [-40, 40], pitch: [0, 22], dist: 12, avoid: placed, minSep: 10 });
      placed.push(angles);
      this.bots.push(new CoordTarget(this.root, { position: pos, radius: 0.55, color: '#ff5a4a', label: d, data: { digit: d } }));
    }
  }

  handleShot(hit, time) {
    const t = hit?.bot;
    if (this.stage !== 'shoot' || !t?.alive) {
      if (this.stage === 'shoot') super.handleShot(hit, time);
      return;
    }
    const step = sequenceStep(this.seq, this.next, t.data.digit);
    if (!step.ok) {
      this.stats.shots++;
      this.errors++;
      t.flashWrong();
      const g = this.game;
      g.sfx.error();
      g.hud.damage(0); // destello: «tu cabeza te lo va a recordar»
      g.hud.flash('Secuencia rota: otra vez desde el principio', 'bad');
      // La transmisión se repite y los números vuelven a aparecer en otro orden.
      this.stage = 'listen';
      this.waitT = LISTEN_BASE + LISTEN_PER_DIGIT * this.seq.length;
      this.events.push({ type: 'round', index: this.round, seq: this.seq, retry: true });
      for (const b of this.bots) b.remove();
      return;
    }
    this.next = step.next;
    super.handleShot(hit, time);
    if (step.done) {
      this.game.hud.flash(`Secuencia ${this.seq.join(' · ')}`, 'good');
      this.stage = 'gap';
      this.waitT = ROUND_GAP;
    }
  }

  progressText() {
    if (this.stage === 'listen') return 'Escucha la transmisión…';
    if (this.round < 0) return '';
    return `Ronda ${this.round + 1} / ${this.rounds.length} · ${this.next} / ${this.seq.length}`;
  }

  hudStats() {
    return { score: Math.max(0, this.round + (this.completed ? 1 : 0)), scoreLabel: 'Rondas', accLabel: 'Errores', accText: String(this.errors), time: clock(this.elapsed) };
  }
}

export const PHASE_FOR = { mission: StoryMission, targets: StoryTargets, numbers: StoryNumbers };
