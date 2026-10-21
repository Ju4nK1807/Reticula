import * as THREE from 'three';
import { FlickPhase, TrackingPhase, PeekPhase, PrecisionPhase, CombatPhase } from './phases.js';
import {
  SphereFlickPhase,
  SphereTrackingPhase,
  SphereReactionPhase,
  SphereMultiPhase,
  SpherePrecisionPhase,
} from './targetPhases.js';
import { scoreEvaluation } from './scoring.js';
import { evalIntroScreen, evalResultsScreen } from '../../ui/evaluationScreens.js';

// Dos evaluaciones independientes, cada una con su mapa y su rango.
export const VARIANTS = {
  targets: {
    id: 'targets',
    name: 'Dianas',
    title: 'Evaluación con dianas',
    desc: 'La evaluación clásica de aim trainer: objetivos esféricos en un campo de tiro, sin enemigos que disparen.',
    world: 'range',
    stages: [SphereFlickPhase, SphereTrackingPhase, SphereReactionPhase, SphereMultiPhase, SpherePrecisionPhase],
  },
  bots: {
    id: 'bots',
    name: 'Enemigos',
    title: 'Evaluación con enemigos',
    desc: 'Bots humanoides de tamaño real con hitbox de cabeza, que se cubren, se asoman y te disparan.',
    world: 'yard',
    stages: [FlickPhase, TrackingPhase, PeekPhase, PrecisionPhase, CombatPhase],
  },
};

const BRIEF_TIME = 5; // segundos de instrucciones + cuenta regresiva antes de cada fase
const MAX_HISTORY = 40;

// Modo Evaluación: encadena las fases de una variante, calcula el rango y lo guarda.
// Estados: intro → brief → running → (brief → running)… → done
export class Evaluation {
  constructor(game, variantId = 'targets') {
    this.game = game;
    this.variant = VARIANTS[variantId];
    this.stages = this.variant.stages;
    this.root = new THREE.Group();
    this.state = 'intro';
    this.index = 0;
    this.phase = null;
    this.results = {};
    this.lastSummary = null;
  }

  start() {
    this.game.useWorld(this.variant.world);
    this.game.world.scene.add(this.root);
    this.game.weapon.onShot = (hit) => {
      if (this.state === 'running') this.phase.handleShot(hit);
    };
    this.showIntro();
  }

  showIntro() {
    const g = this.game;
    this.state = 'intro';
    g.hud.setVisible(false);
    g.ui.show(
      evalIntroScreen(g, {
        variant: this.variant,
        onStart: () => g.input.lock(),
        onSettings: () => g.showSettings(() => this.showIntro()),
        onBack: () => g.quitToMenu(),
      }),
    );
  }

  // Game solo pausa si el modo necesita el mouse capturado.
  wantsLock() {
    return this.state === 'brief' || this.state === 'running';
  }

  // Durante las instrucciones se puede disparar para calentar (no cuenta).
  weaponEnabled() {
    return this.wantsLock();
  }

  hitMeshes() {
    return this.state === 'running' ? this.phase.hitMeshes() : [];
  }

  onLock() {
    if (this.state !== 'intro') return;
    this.game.ui.hide();
    this.game.hud.setVisible(true);
    this.beginStage(0);
  }

  beginStage(index) {
    const g = this.game;
    this.phase?.dispose();
    this.index = index;
    const Stage = this.stages[index];
    this.phase = new Stage(this);
    this.state = 'brief';
    this.briefT = BRIEF_TIME;
    this.lastBeep = null;
    g.player.reset(g.world.spawn);
    g.weapon.setMode(Stage.info.auto);
    g.weapon.refill();
    g.effects.clear();
    g.hud.setHealth(Stage.info.health ? 1 : null);
    g.hud.setWeapon(`${g.weapon.stats.name} · ${Stage.info.auto ? 'AUTO' : 'SEMI'}`);
    g.hud.setLabel(`${this.variant.name} · ${index + 1}/${this.stages.length} · ${Stage.info.name}`);
    g.hud.setStats(this.phase.hudStats());
  }

  restartStage() {
    this.beginStage(this.index);
  }

  update(dt) {
    const { hud, sfx } = this.game;

    if (this.state === 'brief') {
      this.briefT -= dt;
      const n = Math.ceil(this.briefT);
      if (n <= 3 && n > 0 && n !== this.lastBeep) {
        this.lastBeep = n;
        sfx.beep(false);
      }
      hud.brief({
        step: `Fase ${this.index + 1} de ${this.stages.length}`,
        name: this.phase.info.name,
        desc: this.phase.info.desc,
        prev: this.lastSummary,
        count: Math.max(1, n),
      });
      if (this.briefT <= 0) {
        hud.brief(null);
        sfx.beep(true);
        // Lo disparado durante el calentamiento no cuenta: empieza con el cargador lleno.
        this.game.weapon.refill();
        this.game.effects.clear();
        this.state = 'running';
        this.phase.begin();
      }
    } else if (this.state === 'running') {
      this.phase.update(dt);
      hud.setStats(this.phase.hudStats());
      if (this.phase.finished) this.completeStage();
    }
  }

  completeStage() {
    const Stage = this.stages[this.index];
    const result = this.phase.results();
    this.results[Stage.info.id] = result;
    this.lastSummary = `${Stage.info.name}: ${Stage.summary(result)}`;
    this.game.sfx.complete();
    if (this.index + 1 < this.stages.length) this.beginStage(this.index + 1);
    else this.finish();
  }

  finish() {
    const g = this.game;
    this.state = 'done';
    this.phase.dispose();
    this.phase = null;

    const summary = scoreEvaluation(this.variant.id, this.results);
    const profile = g.store.data.profile;
    const previous = profile.evaluations.filter((e) => e.variant === this.variant.id).at(-1) ?? null;
    profile.evaluations.push({ date: new Date().toISOString(), ...summary, results: this.results });
    if (profile.evaluations.length > MAX_HISTORY) profile.evaluations.shift();
    const v = profile.variants[this.variant.id] ?? {};
    profile.variants[this.variant.id] = {
      rank: summary.rank,
      score: summary.total,
      best: Math.max(v.best ?? 0, summary.total),
      date: new Date().toISOString(),
    };
    profile.rank = summary.rank;
    profile.score = summary.total;
    profile.bestScore = Math.max(profile.bestScore ?? 0, summary.total);
    g.store.persist();

    g.input.unlock();
    g.hud.setVisible(false);
    g.ui.show(
      evalResultsScreen({
        variant: this.variant,
        summary,
        results: this.results,
        previous,
        onRetry: () => g.startEvaluation(this.variant.id),
        onMenu: () => g.quitToMenu(),
      }),
    );
  }

  onShoot() {
    this.game.weapon.trigger();
  }

  onPause() {
    this.phase?.onPause();
  }

  dispose() {
    this.phase?.dispose();
    this.phase = null;
    this.root.removeFromParent();
    this.game.weapon.onShot = null;
    this.game.hud.brief(null);
    this.game.effects.clear();
  }
}
