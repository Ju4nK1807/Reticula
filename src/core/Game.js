import * as THREE from 'three';
import { Engine } from './Engine.js';
import { Input } from './Input.js';
import { PlayerController } from './PlayerController.js';
import { Sfx } from '../audio/Sfx.js';
import { SaveStore } from '../storage/SaveStore.js';
import { TrainingYard } from '../scenes/TrainingYard.js';
import { ShootingRange } from '../scenes/ShootingRange.js';
import { Ballistics } from '../combat/Ballistics.js';
import { Weapon } from '../combat/Weapon.js';
import { Viewmodel } from '../combat/Viewmodel.js';
import { Effects } from '../effects/Effects.js';
import { HUD } from '../ui/HUD.js';
import { UI } from '../ui/UI.js';
import { menuScreen } from '../ui/menuScreen.js';
import { settingsScreen } from '../ui/settingsScreen.js';
import { pauseScreen } from '../ui/pauseScreen.js';
import { Evaluation } from '../modes/evaluation/Evaluation.js';
import { GAMES, formatSens, roundTo } from '../config/sensitivity.js';

const _v = new THREE.Vector3();

// Mapas disponibles; se construyen la primera vez que se usan y se reutilizan.
const WORLDS = {
  range: () => new ShootingRange(),
  yard: () => new TrainingYard(),
};

// Orquestador: conecta motor, entrada, jugador, arma, audio, guardado, UI y el modo activo.
// Un modo implementa: start, update(dt), onShoot, onLock, onPause, wantsLock, weaponEnabled,
// hitMeshes, restartStage, dispose.
export class Game {
  constructor(root) {
    this.store = new SaveStore();
    this.engine = new Engine(root.querySelector('#scene'));
    this.input = new Input(root);
    this.player = new PlayerController(this.engine.camera, this.input);
    this.ballistics = new Ballistics();
    this.weapon = new Weapon(this);
    this.viewmodel = new Viewmodel();
    this.effects = new Effects();
    this.sfx = new Sfx();
    this.hud = new HUD(root.querySelector('#hud'));
    this.ui = new UI(root.querySelector('#ui'), root.querySelector('#toast'));
    this.engine.setOverlay(this.viewmodel);

    this.mode = null;
    this.paused = false;
    this.time = 0;
    this.fpsFrames = 0;
    this.fpsTime = 0;

    this.worlds = {};
    this.useWorld('range');
    this.applySettings();

    this.input.on('shoot', () => {
      if (this.mode && !this.paused) this.mode.onShoot();
    });
    this.input.on('lock', () => this.onLock());
    this.input.on('unlock', () => this.onUnlock());
    this.input.on('key', (e) => this.onKey(e));
    this.input.on('lockerror', () =>
      this.ui.toast('No se pudo capturar el mouse. Espera un segundo y vuelve a hacer clic.'),
    );
    // El audio solo puede iniciar tras un gesto del usuario.
    window.addEventListener('pointerdown', () => this.sfx.unlock());
  }

  get settings() {
    return this.store.data.settings;
  }

  get playing() {
    return !!this.mode && !this.paused && this.input.locked;
  }

  useWorld(key) {
    this.worlds[key] ??= WORLDS[key]();
    if (this.world !== this.worlds[key]) this.setWorld(this.worlds[key]);
  }

  setWorld(world) {
    this.world = world;
    this.engine.scene = world.scene;
    this.effects.attach(world.scene);
    this.player.setWorld(world);
    this.ballistics.setWorld(world);
    this.player.reset(world.spawn);
  }

  applySettings() {
    const s = this.settings;
    this.player.configure(s.sens);
    this.engine.setHorizontalFov(s.fov);
    this.hud.setCrosshair(s.crosshair);
    this.hud.showFps(s.video.showFps);
    this.sfx.setVolume(s.audio.volume);
  }

  // Ajusta la sensibilidad un porcentaje (atajos [ y ]).
  nudgeSensitivity(factor) {
    const sens = this.settings.sens;
    sens.value = roundTo(sens.value * factor, GAMES[sens.game]?.decimals ?? 3);
    this.store.persist();
    this.applySettings();
    this.hud.flash(`Sensibilidad ${formatSens(sens.game, sens.value)}`, 'info');
  }

  onKey(e) {
    if (!this.playing) return;
    if (e.code === 'BracketLeft') this.nudgeSensitivity(0.97);
    else if (e.code === 'BracketRight') this.nudgeSensitivity(1.03);
    else if (e.code === 'KeyR' && this.weapon.enabled) this.weapon.reload();
    else if (e.code === 'Backspace' && !e.repeat) {
      e.preventDefault();
      this.mode.restartStage?.();
    }
  }

  start() {
    this.showMenu();
    this.engine.start((dt) => this.frame(dt));
  }

  frame(dt) {
    this.time += dt;
    const playing = this.playing;

    this.player.update(dt, playing);
    if (!this.mode) {
      // Paneo lento de fondo en el menú.
      this.player.look(Math.sin(this.time * 0.12) * 0.35, 0.04 + Math.sin(this.time * 0.2) * 0.03);
    }
    this.engine.camera.updateMatrixWorld();

    this.weapon.enabled = playing && !!this.mode?.weaponEnabled();
    if (this.mode && !this.paused) {
      this.weapon.update(dt);
      this.mode.update(dt);
    }
    this.effects.update(dt);
    this.viewmodel.update(dt, this.player);
    if (this.mode) this.hud.setAmmo(this.weapon.ammo, this.weapon.stats.magazine, this.weapon.reloadProgress);
    this.engine.showOverlay = this.settings.gameplay.viewmodel && !!this.mode && this.input.locked;
    this.world.update(dt);

    this.fpsFrames++;
    this.fpsTime += dt;
    if (this.fpsTime >= 0.5) {
      this.hud.setFps(Math.round(this.fpsFrames / this.fpsTime));
      this.fpsFrames = 0;
      this.fpsTime = 0;
    }
  }

  // Paneo estéreo (-1…1) de un punto del mundo respecto a la cámara.
  panFor(point) {
    _v.copy(point).applyMatrix4(this.engine.camera.matrixWorldInverse);
    const len = Math.hypot(_v.x, _v.z) || 1;
    return THREE.MathUtils.clamp(_v.x / len, -1, 1);
  }

  // Ángulo horizontal (rad) de un punto respecto a hacia dónde mira el jugador; positivo = izquierda.
  angleTo(point) {
    const eye = this.player.eye;
    const yawTo = Math.atan2(-(point.x - eye.x), -(point.z - eye.z));
    let rel = yawTo - this.player.yaw;
    rel = Math.atan2(Math.sin(rel), Math.cos(rel));
    return rel;
  }

  // --- Pointer lock / pausa ----------------------------------------------------

  onLock() {
    this.sfx.unlock();
    if (this.paused) this.resume();
    else this.mode?.onLock();
  }

  onUnlock() {
    if (this.mode?.wantsLock() && !this.paused) this.pause();
  }

  pause() {
    this.paused = true;
    this.mode?.onPause();
    this.showPause();
  }

  showPause() {
    this.ui.show(
      pauseScreen(this, {
        onResume: () => this.input.lock(),
        onRestart: () => {
          this.mode.restartStage();
          this.input.lock();
        },
        onSettings: () => this.showSettings(() => this.showPause()),
        onQuit: () => this.quitToMenu(),
      }),
    );
  }

  resume() {
    this.paused = false;
    this.ui.hide();
  }

  // --- Navegación ----------------------------------------------------------------

  showMenu() {
    this.hud.setVisible(false);
    this.ui.show(
      menuScreen(this, {
        onEvaluation: (variant) => this.startEvaluation(variant),
        onSettings: () => this.showSettings(() => this.showMenu()),
      }),
    );
  }

  showSettings(onBack) {
    this.ui.show(settingsScreen(this, onBack));
  }

  startMode(mode) {
    this.mode?.dispose();
    this.paused = false;
    this.mode = mode;
    mode.start();
  }

  startEvaluation(variant) {
    this.startMode(new Evaluation(this, variant));
  }

  quitToMenu() {
    this.mode?.dispose();
    this.mode = null;
    this.paused = false;
    this.input.unlock();
    this.player.reset(this.world.spawn);
    this.showMenu();
  }
}
