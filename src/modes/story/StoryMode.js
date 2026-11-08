import * as THREE from 'three';
import './story.css';
import { Mode } from '../Mode.js';
import { WEAPONS } from '../../combat/weapons.js';
import { StoryHud } from './StoryHud.js';
import { PHASE_FOR } from './storyPhases.js';
import { CHAPTERS, PROLOGUE, chapterIndex, completeChapter, getChapter, nextChapter, normalizeStory } from './storyData.js';
import { storyChaptersScreen, storyFailedScreen, storySceneScreen } from './storyScreens.js';

export const MODE_ID = 'story';

const BRIEF_TIME = 3; // s de cuenta antes de cada misión
const DEATH_TIME = 1.6;
const DEATH_SLOWMO = 0.3;
const END_DELAY = 1.8; // s tras la última baja (se oye la radio) antes de la escena final

/*
  Historia «ECO». Estados:
    chapters → scene (intro) → [clic: captura del mouse] → brief → running → ending → scene (outro) → …
                                                                    ↘ dying → failed
  Cada capítulo tiene su mapa, sus armas y su tipo de fase (storyPhases.js); los diálogos de radio
  salen de los eventos de la fase (bajas, encuentros, rondas). El progreso va en store.records.story.
*/
export class StoryMode extends Mode {
  constructor(game) {
    super(game);
    this.root = new THREE.Group();
    this.state = 'chapters';
    this.chapter = null;
    this.phase = null;
    this.pending = null;
    this.grenades = 0;
  }

  get record() {
    const store = this.game.store;
    const rec = normalizeStory(store.modeRecord(MODE_ID));
    store.data.records[MODE_ID] = rec;
    return rec;
  }

  start() {
    const g = this.game;
    g.weapon.onShot = (hit, spread, time) => {
      if (this.state === 'running') this.phase.handleShot(hit, time);
    };
    this.hud = new StoryHud(g.hud);
    this.hud.setVisible(false);
    this.showChapters();
  }

  // --- Pantallas -----------------------------------------------------------------------------------

  showChapters() {
    const g = this.game;
    this.state = 'chapters';
    this.pending = null;
    g.hud.setVisible(false);
    g.useWorld((this.chapter ?? nextChapter(this.record)).world);
    this.setupWorld(null);
    g.ui.show(storyChaptersScreen({ rec: this.record, onPlay: (id) => this.intro(id), onBack: () => g.quitToMenu() }));
  }

  intro(id) {
    const g = this.game;
    const ch = getChapter(id);
    this.chapter = ch;
    this.state = 'scene';
    g.useWorld(ch.world); // el mapa del capítulo se ve detrás de la escena
    const rec = this.record;
    const lines = ch.number === 1 ? [...PROLOGUE, ...ch.intro] : ch.intro;
    if (ch.number === 1 && !rec.prologueSeen) {
      rec.prologueSeen = true;
      g.store.persist();
    }
    g.ui.show(
      storySceneScreen({
        eyebrow: `Capítulo ${ch.number}`,
        title: ch.title,
        subtitle: `${ch.place} · ${ch.date}`,
        lines,
        action: 'Comenzar misión',
        onDone: () => this.prepare(ch.id),
        extra: [],
      }),
    );
  }

  outro() {
    const g = this.game;
    const ch = this.chapter;
    const i = chapterIndex(ch.id);
    const next = CHAPTERS[i + 1];
    this.state = 'scene';
    g.ui.show(
      storySceneScreen({
        eyebrow: `Capítulo ${ch.number} · completado`,
        title: next ? ch.title : 'ECO',
        subtitle: next ? `Siguiente: ${next.title}` : 'Fin de la historia',
        lines: ch.outro,
        action: next ? `Capítulo ${next.number}: ${next.title}` : 'Volver a los capítulos',
        onDone: () => (next ? this.intro(next.id) : this.showChapters()),
      }),
    );
  }

  // Desde un clic: guarda el capítulo y captura el mouse; la misión empieza en onLock.
  prepare(id) {
    this.pending = getChapter(id);
    this.game.input.lock();
  }

  // --- Interfaz de modo --------------------------------------------------------------------------

  wantsLock() {
    return this.state === 'brief' || this.state === 'running' || this.state === 'ending';
  }

  weaponEnabled() {
    return this.wantsLock();
  }

  // Munición real: hay que recargar (la reserva no se acaba).
  infiniteAmmo() {
    return false;
  }

  ownsWeapon(id) {
    if (!this.chapter) return undefined;
    return this.chapter.loadout.includes(id);
  }

  meleeAllowed() {
    return this.state === 'running';
  }

  onMeleeHit(hit, damage) {
    if (this.state === 'running') this.phase.handleMelee(hit, damage);
  }

  grenadesAllowed() {
    return this.state === 'running' && this.grenades > 0;
  }

  onExplosion(point, radius, los, { damageAt } = {}) {
    if (this.state === 'running' && this.phase?.onExplosion) this.phase.onExplosion(point, radius, los, damageAt);
  }

  hitMeshes() {
    return this.wantsLock() && this.phase ? this.phase.hitMeshes() : [];
  }

  bodyColliders() {
    return this.phase ? this.phase.bodyColliders() : [];
  }

  onLock() {
    if (!this.pending) return;
    const ch = this.pending;
    this.pending = null;
    this.game.ui.hide();
    this.begin(ch);
  }

  restartStage() {
    if (this.wantsLock()) this.begin(this.chapter);
  }

  onPause() {
    this.phase?.onPause();
  }

  // --- Mapa -----------------------------------------------------------------------------------------

  // Ajustes del capítulo sobre el mapa (p. ej. el barrio de los zombis con todas las puertas abiertas).
  setupWorld(ch) {
    const w = this.game.world;
    if (ch?.setup?.openDoors) for (const id of Object.keys(w.doors ?? {})) w.openDoor(id);
    else w.resetDoors?.();
  }

  spawnPoint(ch) {
    const s = ch.setup?.spawn;
    return s ? new THREE.Vector3(s[0], 0, s[1]) : this.game.world.spawn;
  }

  // --- Misión -----------------------------------------------------------------------------------------

  begin(ch) {
    const g = this.game;
    this.chapter = ch;
    g.useWorld(ch.world);
    g.world.scene.add(this.root);
    g.world.props?.reset();
    this.setupWorld(ch);
    this.phase?.dispose();
    this.phase = new PHASE_FOR[ch.kind](this, ch);
    this.grenades = ch.grenades ?? 0;
    this.state = 'brief';
    this.briefT = BRIEF_TIME;
    this.lastBeep = null;
    this.radioKills = new Set();
    g.player.reset(this.spawnPoint(ch));
    g.player.movementEnabled = ch.kind !== 'numbers'; // en la Cúpula, atado a la silla
    g.weapon.setWeapon(ch.loadout.find((id) => WEAPONS[id]) ?? 'pistol', { force: true });
    g.weapon.refill();
    g.onWeaponChange();
    g.effects.clear();
    g.hud.setVisible(true);
    g.hud.setHealth(ch.kind === 'mission' ? 1 : null);
    g.hud.setLabel(`Historia · ${ch.number}. ${ch.title}`);
    g.hud.setStats(this.phase.hudStats());
    this.hud.clear();
    this.hud.setChapter(ch);
    this.hud.setVisible(false);
  }

  update(dt) {
    const g = this.game;
    if (this.state === 'brief') {
      this.briefT -= dt;
      const n = Math.ceil(this.briefT);
      if (n <= 3 && n > 0 && n !== this.lastBeep) {
        this.lastBeep = n;
        g.sfx.beep(false);
      }
      const ch = this.chapter;
      g.hud.brief({ step: `Capítulo ${ch.number} · ${ch.place}`, name: ch.title, desc: ch.objective, prev: null, count: Math.max(1, n) });
      if (this.briefT <= 0) {
        g.hud.brief(null);
        g.sfx.beep(true);
        g.weapon.refill();
        this.state = 'running';
        this.hud.setVisible(true);
        this.hud.say(ch.radio?.start);
        this.phase.begin();
      }
    } else if (this.state === 'running' || this.state === 'ending') {
      this.phase.update(dt);
      this.radio();
      g.hud.setStats(this.phase.hudStats());
      this.hud.update(dt, this.phase.progressText());
      if (this.state === 'running') {
        if (this.phase.died) this.die();
        else if (this.phase.finished) this.ending();
      } else {
        this.endT -= dt;
        if (this.endT <= 0) this.finish();
      }
    } else if (this.state === 'dying') {
      this.phase.update(dt * DEATH_SLOWMO);
      this.deathT -= dt;
      if (this.deathT <= 0) this.failed();
    }
  }

  // Diálogos de radio según lo que pasa en la fase.
  radio() {
    const r = this.chapter.radio ?? {};
    for (const ev of this.phase.events.splice(0)) {
      if (ev.type === 'encounter') this.hud.say(r.encounters?.[ev.index]);
      else if (ev.type === 'kill' && r.kills?.[ev.kills] && !this.radioKills.has(ev.kills)) {
        this.radioKills.add(ev.kills);
        this.hud.say(r.kills[ev.kills]);
      } else if (ev.type === 'round') {
        this.hud.clear();
        this.hud.say([{ who: 'numeros', text: ev.seq.join(' · ') }]);
        if (ev.retry) this.hud.say([{ who: 'lang', text: 'Otra vez. Escucha.' }]);
      }
    }
  }

  // Misión cumplida: suena la última línea de radio y luego la escena.
  ending() {
    const g = this.game;
    this.state = 'ending';
    this.endT = END_DELAY + (this.chapter.radio?.end ? 1.4 : 0);
    this.hud.clear();
    this.hud.say(this.chapter.radio?.end);
    g.sfx.complete();
    g.hud.flash('Objetivo cumplido', 'good');
  }

  finish() {
    const g = this.game;
    const ph = this.phase;
    const first = completeChapter(this.record, this.chapter.id, { time: ph.elapsed, kills: ph.stats.kills, accuracy: ph.accuracy });
    g.store.persist();
    if (first && this.record.finished) g.ui.toast('Historia «ECO» completada');
    this.endMission();
    this.outro();
  }

  die() {
    const g = this.game;
    this.state = 'dying';
    this.deathT = DEATH_TIME;
    g.player.movementEnabled = false;
    this.hud.clear();
    this.hud.setVisible(false);
    g.sfx.tone('sawtooth', 220, 55, 0.8, 0.16);
  }

  failed() {
    const g = this.game;
    this.endMission();
    this.state = 'failed';
    g.ui.show(storyFailedScreen({ chapter: this.chapter, onRetry: () => this.prepare(this.chapter.id), onChapters: () => this.showChapters() }));
  }

  endMission() {
    const g = this.game;
    this.phase?.dispose();
    this.phase = null;
    this.state = 'scene';
    g.effects.clear();
    g.grenades.clear();
    g.player.movementEnabled = true;
    g.input.unlock();
    g.hud.setVisible(false);
    g.hud.setHealth(null);
    this.hud.clear();
    this.hud.setVisible(false);
  }

  dispose() {
    const g = this.game;
    this.phase?.dispose();
    this.phase = null;
    this.hud?.dispose();
    this.hud = null;
    this.root.removeFromParent();
    g.world.resetDoors?.();
    g.weapon.onShot = null;
    g.player.movementEnabled = true;
    g.hud.brief(null);
    g.hud.setHealth(null);
    g.effects.clear();
  }
}
