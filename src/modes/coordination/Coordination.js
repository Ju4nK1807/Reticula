import * as THREE from 'three';
import './coordination.css';
import { Mode } from '../Mode.js';
import { DRILLS, DRILL_BY_ID } from './drills.js';
import { CoordHud } from './CoordHud.js';
import { circuitScore, normalizeRecord, recordScore } from './coordScoring.js';
import { coordResultsScreen, coordSelectScreen } from './coordScreens.js';

export const MODE_ID = 'coordination';
export const WORLD_ID = 'dome';

const BRIEF_TIME = 5;

export class Coordination extends Mode {
  constructor(game) {
    super(game);
    this.root = new THREE.Group();
    this.state = 'select';
    this.kind = 'drill';
    this.queue = [];
    this.index = 0;
    this.phase = null;
    this.results = {};
    this.lastSummary = null;
    this.pendingStart = false;
  }

  get record() {
    return normalizeRecord(this.game.store.modeRecord(MODE_ID));
  }

  start() {
    const g = this.game;
    g.useWorld(WORLD_ID);
    g.world.scene.add(this.root);
    g.weapon.onShot = (hit, spread, time) => {
      if (this.state === 'running') this.phase.handleShot(hit, time);
    };
    this.hud = new CoordHud(g.hud);
    this.showSelect();
  }

  showSelect() {
    const g = this.game;
    this.state = 'select';
    this.pendingStart = false;
    g.hud.setVisible(false);
    g.ui.show(
      coordSelectScreen(g, {
        record: this.record,
        onDrill: (id) => this.prepare('drill', [DRILL_BY_ID[id]]),
        onCircuit: () => this.prepare('circuit', DRILLS),
        onSettings: () => g.showSettings(() => this.showSelect()),
        onBack: () => g.quitToMenu(),
      }),
    );
  }

  prepare(kind, queue) {
    this.kind = kind;
    this.queue = queue;
    this.pendingStart = true;
    this.game.input.lock();
  }

  wantsLock() {
    return this.state === 'brief' || this.state === 'running';
  }

  infiniteAmmo() {
    return true;
  }

  weaponEnabled() {
    return this.wantsLock();
  }

  hitMeshes() {
    return this.state === 'running' ? this.phase.hitMeshes() : [];
  }

  onLock() {
    if (!this.pendingStart) return;
    this.pendingStart = false;
    const g = this.game;
    g.ui.hide();
    g.hud.setVisible(true);
    this.results = {};
    this.lastSummary = null;
    this.beginStage(0);
  }

  weaponHudSuffix() {
    return ' · munición ilimitada';
  }

  onPause() {
    this.phase?.onPause();
  }

  restartStage() {
    if (this.wantsLock()) this.beginStage(this.index);
  }

  beginStage(index) {
    const g = this.game;
    this.phase?.dispose();
    this.index = index;
    const Drill = this.queue[index];
    this.phase = new Drill(this);
    this.state = 'brief';
    this.briefT = BRIEF_TIME;
    this.lastBeep = null;
    g.player.reset(g.world.spawn);
    g.equipLoadout();
    g.effects.clear();
    g.hud.setHealth(null);
    const step = this.kind === 'circuit' ? ` · ${index + 1}/${this.queue.length}` : '';
    g.hud.setLabel(`Coordinación${step} · ${Drill.info.name}`);
    g.hud.setStats(this.phase.hudStats());
    this.hud.clear();
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
        step: this.kind === 'circuit' ? `Ejercicio ${this.index + 1} de ${this.queue.length}` : 'Coordinación ojo-mano',
        name: this.phase.info.name,
        desc: this.phase.info.desc,
        prev: this.lastSummary,
        count: Math.max(1, n),
      });
      if (this.briefT <= 0) {
        hud.brief(null);
        sfx.beep(true);
        this.game.weapon.refill();
        this.game.effects.clear();
        this.state = 'running';
        this.phase.begin();
      }
    } else if (this.state === 'running') {
      const w = this.game.weapon;
      if (!w.reloading) w.ammo = w.stats.magazine;
      this.phase.update(dt);
      hud.setStats(this.phase.hudStats());
      this.hud.update(this.phase.overlay());
      if (this.phase.finished) this.completeStage();
    }
  }

  completeStage() {
    const Drill = this.queue[this.index];
    const result = this.phase.results();
    this.results[Drill.info.id] = result;
    this.lastSummary = `${Drill.info.name}: ${Drill.summary(result)} · ${result.rating}/100`;
    this.game.sfx.complete();
    this.hud.clear();
    if (this.index + 1 < this.queue.length) this.beginStage(this.index + 1);
    else this.finish();
  }

  finish() {
    const g = this.game;
    this.state = 'done';
    this.phase.dispose();
    this.phase = null;

    const ratings = Object.fromEntries(Object.entries(this.results).map(([id, r]) => [id, r.rating]));
    const record = g.store.modeRecord(MODE_ID);
    const date = new Date().toISOString();
    let isBest = false;
    for (const [id, score] of Object.entries(ratings)) {
      const best = recordScore(record, { kind: 'drill', id, score, date });
      if (this.kind === 'drill') isBest = best;
    }
    const index = circuitScore(ratings);
    if (this.kind === 'circuit') isBest = recordScore(record, { kind: 'circuit', score: index, date, detail: ratings });
    g.store.persist();

    g.input.unlock();
    g.hud.setVisible(false);
    g.ui.show(
      coordResultsScreen({
        kind: this.kind,
        drills: this.queue,
        results: this.results,
        ratings,
        index,
        isBest,
        record: this.record,
        onRetry: () => this.prepare(this.kind, this.queue),
        onSelect: () => this.showSelect(),
        onMenu: () => g.quitToMenu(),
      }),
    );
  }

  dispose() {
    const g = this.game;
    this.phase?.dispose();
    this.phase = null;
    this.hud?.dispose();
    this.hud = null;
    this.root.removeFromParent();
    g.weapon.onShot = null;
    g.hud.brief(null);
    g.effects.clear();
  }
}
