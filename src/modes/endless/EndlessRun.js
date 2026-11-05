import * as THREE from 'three';
import { Phase } from '../evaluation/Phase.js';
import { AssaultBot } from './AssaultBot.js';
import { Medkit } from './Medkit.js';
import { clock, pct } from '../../utils/format.js';
import { rand } from '../../utils/math.js';
import {
  GATE_WARNING,
  HEADSHOT_KILL_BONUS,
  MAX_HEALTH,
  MEDKIT_HEAL,
  MEDKIT_MAX,
  WAVE_HEAL,
  medkitChance,
  streakBonus,
  waveClearBonus,
  waveConfig,
  wavePoints,
} from './waves.js';

const FIRST_SPAWN_DELAY = 0.6; // s desde que empieza la oleada hasta el primer aviso de puerta
const GATE_JITTER = 0.6; // m de variación lateral al entrar, para que no sigan todos la misma línea
const OUT_OF_VIEW_ANGLE = Math.PI / 3; // 60°: una puerta "a la espalda" está más allá de esto
const _side = new THREE.Vector3();

/*
  Una partida del modo infinito. Extiende Phase para reutilizar disparos, puntos, vida del jugador,
  daño direccional, estadísticas y colisiones con los bots.

  Estados: idle → wave → clear → wave → … (el modo controla las pausas entre oleadas).
  Avisa al modo de lo que pasa con `listener(tipo, datos)`:
    waveStart { wave, count } · gate { gate } · kill { streak, bonus, part } · streakLost { streak }
    waveClear { wave, bonus, heal, perfect } · medkit { heal } · medkitDrop
*/
export class EndlessRun extends Phase {
  static info = { id: 'endless', name: 'Infinito', desc: '', auto: true, health: true };

  constructor(mode) {
    super(mode);
    this.duration = Infinity;
    this.listener = null;
    this.state = 'idle';
    this.wave = 0;
    this.cfg = null;
    this.toSpawn = 0;
    this.spawnTimer = 0;
    this.pending = []; // bots anunciados en una puerta: { gate, t }
    this.lastGate = null;
    this.medkits = [];
    this.streak = 0;
    this.bestStreak = 0;
    this.waveStartedAt = 0;
    this.waveDamage = 0;
    this.waveKills = 0;
    this.waveLog = []; // { wave, time, kills, damage, bonus, perfect }
  }

  emit(type, data = {}) {
    this.listener?.(type, data);
  }

  get aliveCount() {
    let n = 0;
    for (const b of this.bots) if (b.alive) n++;
    return n;
  }

  // Enemigos que faltan para terminar la oleada (por aparecer, anunciados y vivos).
  get remaining() {
    return this.state === 'wave' ? this.toSpawn + this.pending.length + this.aliveCount : 0;
  }

  startWave(n) {
    this.wave = n;
    this.cfg = waveConfig(n);
    this.points = wavePoints(this.cfg);
    this.toSpawn = this.cfg.count;
    this.spawnTimer = FIRST_SPAWN_DELAY;
    this.waveStartedAt = this.elapsed;
    this.waveDamage = 0;
    this.waveKills = 0;
    this.state = 'wave';
    this.emit('waveStart', { wave: n, count: this.cfg.count });
  }

  update(dt) {
    super.update(dt); // bots, retirada de muertos, tiempo
    this.updateMedkits(dt);
    if (this.state !== 'wave' || this.died) return;
    this.updateSpawns(dt);
    if (this.toSpawn === 0 && this.pending.length === 0 && this.aliveCount === 0) this.clearWave();
  }

  // --- Apariciones -------------------------------------------------------------------

  updateSpawns(dt) {
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const p = this.pending[i];
      p.t -= dt;
      if (p.t <= 0) {
        this.pending.splice(i, 1);
        this.spawnAt(p.gate);
      }
    }
    this.spawnTimer -= dt;
    if (this.toSpawn > 0 && this.spawnTimer <= 0 && this.aliveCount + this.pending.length < this.cfg.maxAlive) {
      const gate = this.pickGate();
      this.world.warnGate(gate, GATE_WARNING);
      this.pending.push({ gate, t: GATE_WARNING });
      this.toSpawn--;
      this.spawnTimer = rand(...this.cfg.spawnGap);
      this.emit('gate', { gate });
    }
  }

  // Puerta aleatoria, sin repetir la anterior ni una ya anunciada. En oleadas altas se prefieren
  // las puertas fuera de la vista del jugador: obliga a vigilar los flancos y la espalda.
  pickGate() {
    const busy = new Set(this.pending.map((p) => p.gate));
    let options = this.world.gates.filter((g) => g !== this.lastGate && !busy.has(g));
    if (!options.length) options = this.world.gates;
    const behindChance = Math.min(0.6, 0.1 + 0.04 * (this.wave - 1));
    if (Math.random() < behindChance) {
      const behind = options.filter((g) => Math.abs(this.game.angleTo(g.center)) > OUT_OF_VIEW_ANGLE);
      if (behind.length) options = behind;
    }
    const gate = options[Math.floor(Math.random() * options.length)];
    this.lastGate = gate;
    return gate;
  }

  spawnAt(gate) {
    const c = this.cfg.bot;
    _side.set(-gate.dir.z, 0, gate.dir.x).multiplyScalar(rand(-GATE_JITTER, GATE_JITTER));
    const bot = new AssaultBot(this.root, this.world, {
      position: gate.spawn.clone().add(_side),
      color: this.game.settings.enemyColor,
      scale: c.scale,
      behavior: {
        type: 'assault',
        entry: gate.entry.clone().add(_side),
        walkSpeed: c.walkSpeed,
        engageTime: c.engageTime,
        strafe: { ...c.strafe },
        botArea: this.world.botArea,
      },
      shooter: { ...c.shooter },
    });
    this.bots.push(bot);
  }

  // --- Oleada superada -----------------------------------------------------------------

  clearWave() {
    const perfect = this.waveDamage === 0;
    const bonus = waveClearBonus(this.wave, this.waveDamage);
    this.score += bonus;
    const heal = Math.min(WAVE_HEAL, MAX_HEALTH - this.health);
    this.heal(heal);
    this.waveLog.push({
      wave: this.wave,
      time: this.elapsed - this.waveStartedAt,
      kills: this.waveKills,
      damage: this.waveDamage,
      bonus,
      perfect,
    });
    this.state = 'clear';
    this.emit('waveClear', { wave: this.wave, bonus, heal, perfect });
  }

  heal(amount) {
    if (amount <= 0) return;
    this.health = Math.min(MAX_HEALTH, this.health + amount);
    this.game.hud.setHealth(this.health / MAX_HEALTH);
  }

  // --- Puntuación y racha -----------------------------------------------------------------

  onKill(bot, part) {
    this.waveKills++;
    this.streak++;
    this.bestStreak = Math.max(this.bestStreak, this.streak);
    const head = part === 'head' ? Math.round(HEADSHOT_KILL_BONUS * this.cfg.pointsMultiplier) : 0;
    const bonus = head + streakBonus(this.streak);
    this.score += bonus;
    this.emit('kill', { streak: this.streak, bonus, part });
    this.maybeDropMedkit(bot.position);
  }

  takeDamage(amount, from) {
    if (this.died) return;
    super.takeDamage(amount, from);
    this.waveDamage += amount;
    if (this.streak >= 3) this.emit('streakLost', { streak: this.streak });
    this.streak = 0;
  }

  // --- Botiquines ------------------------------------------------------------------------

  maybeDropMedkit(position) {
    if (this.medkits.length >= MEDKIT_MAX || Math.random() >= medkitChance(this.health)) return;
    this.medkits.push(new Medkit(this.root, position, MEDKIT_HEAL));
    this.emit('medkitDrop');
  }

  updateMedkits(dt) {
    const player = this.game.player.position;
    this.medkits = this.medkits.filter((m) => {
      m.update(dt);
      // Con la vida llena no se recoge: se queda en el piso para cuando haga falta.
      if (!this.died && this.health < MAX_HEALTH && m.touches(player)) {
        const heal = Math.min(m.heal, MAX_HEALTH - this.health);
        this.heal(heal);
        this.emit('medkit', { heal });
        m.dispose();
        return false;
      }
      if (m.expired) {
        m.dispose();
        return false;
      }
      return true;
    });
  }

  // --- HUD y resultados ---------------------------------------------------------------------

  hudStats() {
    return {
      score: Math.round(this.score),
      accLabel: 'Precisión',
      accText: pct(this.accuracy),
      time: clock(this.elapsed),
    };
  }

  results() {
    return {
      ...this.baseResults(),
      wave: Math.max(1, this.wave),
      wavesCleared: this.waveLog.length,
      time: this.elapsed,
      bestStreak: this.bestStreak,
      health: this.health,
      waveLog: this.waveLog,
    };
  }

  dispose() {
    super.dispose();
    for (const m of this.medkits) m.dispose();
    this.medkits = [];
    this.pending = [];
    this.world.clearWarnings?.();
  }
}
