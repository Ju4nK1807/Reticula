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
import { recordEvaluation } from '../../storage/profile.js';
import { Mode } from '../Mode.js';
import { WEAPONS } from '../../combat/weapons.js';
import { evalConfigScreen, evalIntroScreen, evalPracticeScreen, evalResultsScreen } from '../../ui/evaluationScreens.js';
import { evalConfig, isRanked, stagesFor } from './evalConfig.js';

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

// Modo Evaluación: encadena las fases de una variante, calcula el rango y lo guarda.
// Estados: intro → brief → running → (brief → running)… → done
export class Evaluation extends Mode {
  constructor(game, variantId = 'targets') {
    super(game);
    this.variant = VARIANTS[variantId];
    // Configuración elegida (evalConfig.js). Con la estándar da rango; si no, es una práctica.
    this.evalCfg = evalConfig(game.store?.data.settings.evaluation);
    this.stages = stagesFor(this.variant, this.evalCfg);
    this.ranked = isRanked(this.variant, this.evalCfg);
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
    this.game.weapon.onShot = (hit, spread, time) => {
      if (this.state === 'running') this.phase.handleShot(hit, time);
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
        config: this.evalCfg,
        stages: this.stages,
        ranked: this.ranked,
        onStart: () => g.input.lock(),
        onConfig: () => this.showConfig(),
        onSettings: () => g.showSettings(() => this.showIntro()),
        onBack: () => g.quitToMenu(),
      }),
    );
  }

  // Personalizar: se guarda al cambiar y se aplica al volver a la pantalla de inicio.
  showConfig() {
    const g = this.game;
    g.ui.show(
      evalConfigScreen(g, {
        variant: this.variant,
        onChange: (saved) => {
          g.store.data.settings.evaluation = saved;
          g.store.persist();
        },
        onDone: () => {
          this.evalCfg = evalConfig(g.store.data.settings.evaluation);
          this.stages = stagesFor(this.variant, this.evalCfg);
          this.ranked = isRanked(this.variant, this.evalCfg);
          this.showIntro();
        },
      }),
    );
  }

  // Game solo pausa si el modo necesita el mouse capturado.
  wantsLock() {
    return this.state === 'brief' || this.state === 'running';
  }

  weaponLocked() {
    return `La evaluación usa el ${WEAPONS[this.evalCfg.weapon].name}: se cambia en «Personalizar», antes de empezar`;
  }

  fireModeLocked() {
    return true;
  }

  // Durante las instrucciones se puede disparar para calentar (no cuenta).
  // Entrenamiento: munición infinita y sin recargas (una recarga a destiempo dejaba escapar
  // enemigos y restaba puntos). Las armas se sienten igual: solo no se vacían.
  infiniteAmmo() {
    return true;
  }

  weaponEnabled() {
    return this.wantsLock();
  }

  hitMeshes() {
    return this.state === 'running' ? this.phase.hitMeshes() : [];
  }

  bodyColliders() {
    return this.state === 'running' ? this.phase.bodyColliders() : [];
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
    // Duración elegida (la estándar es 30 s; el combate dura proporcionalmente más).
    if (Number.isFinite(this.phase.duration)) this.phase.duration *= this.evalCfg.duration / 30;
    this.state = 'brief';
    this.briefT = BRIEF_TIME;
    this.lastBeep = null;
    g.player.reset(g.world.spawn);
    // El arma elegida (el rifle en la estándar) y el modo de disparo de la fase.
    g.weapon.setWeapon(this.evalCfg.weapon, { force: true });
    g.weapon.setMode(Stage.info.auto);
    g.weapon.refill();
    g.effects.clear();
    g.hud.setHealth(Stage.info.health ? 1 : null);
    g.onWeaponChange();
    g.hud.setLabel(`${this.variant.name}${this.ranked ? '' : ' (práctica)'} · ${index + 1}/${this.stages.length} · ${Stage.info.name}`);
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

    g.input.unlock();
    g.hud.setVisible(false);
    // Práctica (configuración personalizada): resultados de cada fase, sin rango ni guardado.
    if (!this.ranked) {
      g.ui.show(
        evalPracticeScreen({
          variant: this.variant,
          config: this.evalCfg,
          stages: this.stages,
          results: this.results,
          onRetry: () => g.startMode(new Evaluation(g, this.variant.id)),
          onConfig: () => g.startMode(new Evaluation(g, this.variant.id)),
          onMenu: () => g.quitToMenu(),
        }),
      );
      return;
    }
    const summary = scoreEvaluation(this.variant.id, this.results);
    const previous = recordEvaluation(g.store.data.profile, this.variant.id, summary, this.results);
    g.store.persist();
    g.ui.show(
      evalResultsScreen({
        variant: this.variant,
        summary,
        results: this.results,
        previous,
        onRetry: () => g.startMode(new Evaluation(g, this.variant.id)),
        onMenu: () => g.quitToMenu(),
      }),
    );
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
