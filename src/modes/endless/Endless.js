import * as THREE from 'three';
import './endless.css';
import { Mode } from '../Mode.js';
import { EndlessRun } from './EndlessRun.js';
import { EndlessHud } from './EndlessHud.js';
import { endlessIntroScreen, endlessResultsScreen } from './endlessScreens.js';
import { FIRST_COUNTDOWN, INTERMISSION, emptyRecord, updateRecord } from './waves.js';

export const MODE_ID = 'endless';
export const WORLD_ID = 'bastion';

const DEATH_TIME = 1.8; // s de cámara lenta antes del resumen
const DEATH_SLOWMO = 0.25;
const LOW_HEALTH = 30; // por debajo suena el latido
const STREAK_ANNOUNCE = 3; // a partir de esta racha se anuncia en pantalla
const COMBAT_STATES = new Set(['countdown', 'wave', 'clear']);

/*
  Modo infinito. Estados:
    intro → (captura del mouse) → countdown → wave → clear → wave → … → dying → over
  - countdown: cuenta antes de la primera oleada. clear: descanso entre oleadas.
  - dying: cámara lenta tras caer. over: resumen con récords (mouse libre).
  La lógica de juego vive en EndlessRun; aquí están el flujo, la presentación y el sonido.
*/
export class Endless extends Mode {
  constructor(game) {
    super(game);
    this.root = new THREE.Group();
    this.state = 'intro';
    this.run = null;
    this.hud = null;
    this.timer = 0;
    this.nextWave = 1;
    this.lastBeep = null;
    this.heartT = 0;
  }

  get record() {
    const r = this.game.store.modeRecord(MODE_ID);
    return { ...emptyRecord(), ...r };
  }

  start() {
    const g = this.game;
    g.useWorld(WORLD_ID);
    g.world.scene.add(this.root);
    // Solo cuentan los disparos con la oleada en curso: en la cuenta y el descanso se puede
    // probar el arma sin perder puntos.
    g.weapon.onShot = (hit, spread, time) => {
      if (this.state === 'wave') this.run.handleShot(hit, time);
    };
    this.hud = new EndlessHud(g.hud);
    this.hud.setVisible(false);
    this.showIntro();
  }

  showIntro() {
    const g = this.game;
    this.state = 'intro';
    g.hud.setVisible(false);
    g.ui.show(
      endlessIntroScreen(g, {
        record: this.record,
        onStart: () => g.input.lock(),
        onSettings: () => g.showSettings(() => this.showIntro()),
        onBack: () => g.quitToMenu(),
      }),
    );
  }

  // --- Interfaz de modo ---------------------------------------------------------------

  wantsLock() {
    return COMBAT_STATES.has(this.state);
  }

  weaponEnabled() {
    return COMBAT_STATES.has(this.state);
  }

  hitMeshes() {
    return this.run && COMBAT_STATES.has(this.state) ? this.run.hitMeshes() : [];
  }

  bodyColliders() {
    return this.run ? this.run.bodyColliders() : [];
  }

  onLock() {
    if (this.state !== 'intro' && this.state !== 'over') return;
    this.game.ui.hide();
    this.beginRun();
  }

  // Retroceso o "Reiniciar fase" en la pausa: empieza una partida nueva.
  restartStage() {
    if (COMBAT_STATES.has(this.state)) this.beginRun();
  }

  // --- Partida ------------------------------------------------------------------------

  beginRun() {
    const g = this.game;
    this.run?.dispose();
    this.run = new EndlessRun(this);
    this.run.listener = (type, data) => this.onRunEvent(type, data);
    g.player.reset(g.world.spawn);
    g.player.movementEnabled = true;
    g.equipLoadout(); // arma elegida en el arsenal (1-5 para cambiar, B para el modo de disparo)
    g.effects.clear();
    g.hud.setVisible(true);
    g.hud.setHealth(1);
    g.hud.setLabel('Modo infinito · Bastión');
    this.hud.reset();
    this.hud.setVisible(true);
    this.state = 'countdown';
    this.timer = FIRST_COUNTDOWN;
    this.nextWave = 1;
    this.lastBeep = null;
    this.heartT = 0;
  }

  update(dt) {
    const g = this.game;
    const run = this.run;
    if (!run) return;

    switch (this.state) {
      case 'countdown':
      case 'clear':
        run.update(dt);
        this.timer -= dt;
        this.countdownBeeps();
        if (this.timer <= 0) {
          this.state = 'wave';
          run.startWave(this.nextWave);
        }
        break;
      case 'wave':
        run.update(dt);
        if (run.died) this.die();
        else if (run.state === 'clear') {
          this.state = 'clear';
          this.timer = INTERMISSION;
          this.nextWave = run.wave + 1;
          this.lastBeep = null;
        }
        break;
      case 'dying':
        run.update(dt * DEATH_SLOWMO);
        this.timer -= dt;
        if (this.timer <= 0) this.finish();
        break;
      default:
        return;
    }

    if (this.state === 'over') return;
    this.heartbeat(dt);
    g.hud.setStats(run.hudStats());
    this.hud.update(g, run, this);
  }

  countdownBeeps() {
    const n = Math.ceil(this.timer);
    if (n <= 3 && n > 0 && n !== this.lastBeep) {
      this.lastBeep = n;
      this.game.sfx.beep(false);
    }
  }

  // Latido cada vez más rápido con poca vida.
  heartbeat(dt) {
    const run = this.run;
    if (this.state !== 'wave' || run.health > LOW_HEALTH || run.died) {
      this.heartT = 0;
      return;
    }
    this.heartT -= dt;
    if (this.heartT > 0) return;
    this.heartT = 0.55 + (run.health / LOW_HEALTH) * 0.45;
    this.game.sfx.tone('sine', 62, 40, 0.12, 0.45);
    this.game.sfx.tone('sine', 55, 38, 0.1, 0.3, 0.16);
  }

  die() {
    const g = this.game;
    this.state = 'dying';
    this.timer = DEATH_TIME;
    g.player.movementEnabled = false;
    g.weapon.enabled = false;
    this.hud.setVisible(false);
    g.sfx.tone('sawtooth', 220, 55, 0.9, 0.18);
  }

  finish() {
    const g = this.game;
    this.state = 'over';
    const result = this.run.results();
    const record = g.store.modeRecord(MODE_ID);
    const isBest = updateRecord(record, {
      date: new Date().toISOString(),
      wave: result.wave,
      wavesCleared: result.wavesCleared,
      score: result.score,
      kills: result.kills,
      accuracy: result.accuracy,
      hsRate: result.hsRate,
      bestStreak: result.bestStreak,
      damageTaken: result.damageTaken,
      time: Math.round(result.time),
    });
    g.store.persist();

    g.player.movementEnabled = true;
    g.input.unlock();
    g.hud.setVisible(false);
    g.ui.show(
      endlessResultsScreen({
        result,
        record: this.record,
        isBest,
        // El clic en el botón cuenta como gesto del usuario: se puede capturar el mouse directo.
        onRetry: () => g.input.lock(),
        onMenu: () => g.quitToMenu(),
      }),
    );
  }

  // --- Eventos de la partida → sonido y avisos ----------------------------------------------

  onRunEvent(type, data) {
    const { hud, sfx } = this.game;
    switch (type) {
      case 'waveStart':
        sfx.beep(true);
        break;
      case 'gate':
        sfx.cue(this.game.panFor(data.gate.center));
        break;
      case 'kill':
        if (data.streak >= STREAK_ANNOUNCE) hud.flash(`Racha ×${data.streak} · +${data.bonus}`, 'good');
        break;
      case 'streakLost':
        hud.flash(`Racha perdida (${data.streak})`, 'bad');
        break;
      case 'waveClear':
        this.hud.waveClear = data;
        sfx.complete();
        break;
      case 'medkit':
        hud.flash(`+${data.heal} vida`, 'good');
        sfx.tone('triangle', 660, 990, 0.12, 0.16);
        sfx.tone('triangle', 990, 1320, 0.12, 0.12, 0.08);
        break;
      case 'medkitDrop':
        sfx.tone('sine', 1200, 1600, 0.06, 0.06);
        break;
    }
  }

  dispose() {
    const g = this.game;
    this.run?.dispose();
    this.run = null;
    this.hud?.dispose();
    this.hud = null;
    this.root.removeFromParent();
    g.weapon.onShot = null;
    g.player.movementEnabled = true;
    g.world.clearWarnings?.();
    g.effects.clear();
    g.hud.setHealth(null);
  }
}
