import * as THREE from 'three';
import './campaign.css';
import { Mode } from '../Mode.js';
import { MissionPhase } from './MissionPhase.js';
import { CampaignHud } from './CampaignHud.js';
import { getLevel, getMap } from './campaignData.js';
import { demotionSuggestion, nextLevel, normalizeProgress, recommendedMap, recordAttempt } from './progress.js';
import { campaignLevelsScreen, campaignMapsScreen, campaignResultsScreen } from './campaignScreens.js';

export const MODE_ID = 'campaign';

const BRIEF_TIME = 5; // s de instrucciones y cuenta regresiva
const DEATH_TIME = 1.4; // s de cámara lenta al caer
const DEATH_SLOWMO = 0.3;

/*
  Campaña: un mapa por rango con 4 niveles cada uno. Estados:
    maps → levels → (captura del mouse) → brief → running → (dying) → done
  La lógica de cada misión vive en MissionPhase; el progreso (estrellas, desbloqueos, sugerencia de
  bajar de mapa) en progress.js, guardado en store.data.campaign.
*/
export class Campaign extends Mode {
  constructor(game) {
    super(game);
    this.root = new THREE.Group();
    this.state = 'maps';
    this.map = null;
    this.level = null;
    this.phase = null;
    this.pending = null;
  }

  get progress() {
    return normalizeProgress(this.game.store.data.campaign);
  }

  get rankId() {
    return this.game.store.data.profile.rank;
  }

  start() {
    const g = this.game;
    g.weapon.onShot = (hit, spread, time) => {
      if (this.state === 'running') this.phase.handleShot(hit, time);
    };
    this.hud = new CampaignHud(g.hud);
    this.showMaps();
  }

  // --- Pantallas -----------------------------------------------------------------------------

  showMaps() {
    const g = this.game;
    this.state = 'maps';
    this.pending = null;
    g.hud.setVisible(false);
    // El mapa recomendado se ve de fondo.
    g.useWorld((this.map ?? recommendedMap(this.rankId)).world);
    g.ui.show(
      campaignMapsScreen({
        progress: this.progress,
        rankId: this.rankId,
        onMap: (id) => this.showLevels(id),
        onBack: () => g.quitToMenu(),
      }),
    );
  }

  showLevels(mapId) {
    const g = this.game;
    this.state = 'levels';
    this.pending = null;
    this.map = getMap(mapId);
    g.hud.setVisible(false);
    g.useWorld(this.map.world);
    g.ui.show(
      campaignLevelsScreen({
        map: this.map,
        progress: this.progress,
        rankId: this.rankId,
        suggestion: demotionSuggestion(this.progress, this.map),
        onLevel: (id) => this.prepare(id),
        onBack: () => this.showMaps(),
        onSuggested: (id) => this.showLevels(id),
      }),
    );
  }

  // Desde un clic (gesto del usuario): elige el nivel y captura el mouse.
  prepare(levelId) {
    this.pending = getLevel(levelId);
    this.game.input.lock();
  }

  // --- Interfaz de modo --------------------------------------------------------------------

  wantsLock() {
    return this.state === 'brief' || this.state === 'running';
  }

  // Entrenamiento: munición infinita y sin recargas (una recarga a destiempo dejaba escapar
  // enemigos y restaba puntos). Las armas se sienten igual: solo no se vacían.
  infiniteAmmo() {
    return true;
  }

  weaponEnabled() {
    return this.wantsLock();
  }

  // Golpe cuerpo a cuerpo (V): permitido en campaña.
  meleeAllowed() {
    return this.state === 'running';
  }

  onMeleeHit(hit, damage) {
    if (this.state === 'running') this.phase.handleMelee(hit, damage);
  }

  hitMeshes() {
    return this.state === 'running' ? this.phase.hitMeshes() : [];
  }

  bodyColliders() {
    return this.phase ? this.phase.bodyColliders() : [];
  }

  onLock() {
    if (!this.pending) return;
    const level = this.pending;
    this.pending = null;
    this.game.ui.hide();
    this.begin(level);
  }

  restartStage() {
    if (this.wantsLock()) this.begin(this.level);
  }

  // --- Misión ----------------------------------------------------------------------------------

  begin(level) {
    const g = this.game;
    this.level = level;
    this.map = getMap(level.mapId);
    g.useWorld(this.map.world);
    g.world.scene.add(this.root);
    g.world.props?.reset(); // la utilería vuelve a su lugar en cada intento
    this.phase?.dispose();
    this.phase = new MissionPhase(this, level);
    this.state = 'brief';
    this.briefT = BRIEF_TIME;
    this.lastBeep = null;
    g.player.reset(g.world.spawn);
    g.player.movementEnabled = true;
    g.equipLoadout(); // arma elegida en el arsenal (1-9 o la rueda para cambiar, B para el modo de disparo)
    g.effects.clear();
    g.hud.setVisible(true);
    g.hud.setHealth(1);
    g.hud.setLabel(`${this.map.name} · ${level.number}/4 · ${level.name}`);
    g.hud.setStats(this.phase.hudStats());
    this.hud.setLevel(level);
    this.hud.setVisible(false);
  }

  update(dt) {
    const g = this.game;
    const { hud, sfx } = g;
    if (this.state === 'brief') {
      this.briefT -= dt;
      const n = Math.ceil(this.briefT);
      if (n <= 3 && n > 0 && n !== this.lastBeep) {
        this.lastBeep = n;
        sfx.beep(false);
      }
      const l = this.level;
      hud.brief({
        step: `${this.map.name} · nivel ${l.number} · ${l.kind}`,
        name: l.name,
        desc: `${l.desc} ${l.total} enemigos · ${l.time} s · meta ★ ${l.goals[0]}.`,
        prev: null,
        count: Math.max(1, n),
      });
      if (this.briefT <= 0) {
        hud.brief(null);
        sfx.beep(true);
        g.weapon.refill(); // lo disparado al calentar no cuenta
        g.effects.clear();
        this.state = 'running';
        this.hud.setVisible(true);
        this.phase.begin();
      }
    } else if (this.state === 'running') {
      this.phase.update(dt);
      hud.setStats(this.phase.hudStats());
      this.hud.update(this.phase);
      if (this.phase.died) this.die();
      else if (this.phase.finished) this.finish();
    } else if (this.state === 'dying') {
      this.phase.update(dt * DEATH_SLOWMO);
      this.deathT -= dt;
      if (this.deathT <= 0) this.finish();
    }
  }

  die() {
    const g = this.game;
    this.state = 'dying';
    this.deathT = DEATH_TIME;
    g.player.movementEnabled = false;
    this.hud.setVisible(false);
    g.sfx.tone('sawtooth', 220, 55, 0.8, 0.16);
  }

  finish() {
    const g = this.game;
    this.state = 'done';
    const result = this.phase.results();
    this.phase.dispose(); // fuera bots y efectos: no quedan congelados detrás de los resultados
    this.phase = null;
    g.effects.clear();
    const progress = this.progress;
    const outcome = recordAttempt(progress, this.level, result);
    g.store.persist();
    if (result.stars > 0) g.sfx.complete();

    g.player.movementEnabled = true;
    g.input.unlock();
    g.hud.setVisible(false);
    this.hud.setVisible(false);
    const next = nextLevel(this.level);
    g.ui.show(
      campaignResultsScreen({
        map: this.map,
        level: this.level,
        result,
        outcome,
        suggestion: demotionSuggestion(progress, this.map),
        next,
        onNext: () => this.prepare(next.id),
        onRetry: () => this.prepare(this.level.id),
        onLevels: () => this.showLevels(this.map.id),
        onMenu: () => g.quitToMenu(),
        onSuggested: (id) => this.showLevels(id),
      }),
    );
  }

  onPause() {
    this.phase?.onPause();
  }

  dispose() {
    const g = this.game;
    this.phase?.dispose();
    this.phase = null;
    this.hud?.dispose();
    this.hud = null;
    this.root.removeFromParent();
    g.weapon.onShot = null;
    g.player.movementEnabled = true;
    g.hud.brief(null);
    g.hud.setHealth(null);
    g.effects.clear();
  }
}
