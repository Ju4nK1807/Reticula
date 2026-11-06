import * as THREE from 'three';
import { Engine } from './Engine.js';
import { PerfMeter } from './PerfMeter.js';
import { TouchControls, resolveTouchMode } from './TouchControls.js';
import { Input } from './Input.js';
import { PlayerController } from './PlayerController.js';
import { Sfx } from '../audio/Sfx.js';
import { SaveStore } from '../storage/SaveStore.js';
import { createWorld } from '../scenes/registry.js';
import { Ballistics } from '../combat/Ballistics.js';
import { Weapon } from '../combat/Weapon.js';
import { Viewmodel } from '../combat/Viewmodel.js';
import { Effects } from '../effects/Effects.js';
import { HUD } from '../ui/HUD.js';
import { UI } from '../ui/UI.js';
import { menuScreen } from '../ui/menuScreen.js';
import { settingsScreen } from '../ui/settingsScreen.js';
import { pauseScreen } from '../ui/pauseScreen.js';
import { progressScreen } from '../ui/progressScreen.js';
import { arsenalScreen } from '../ui/arsenalScreen.js';
import { getMode } from '../modes/index.js';
import { GAMES, formatSens, roundTo } from '../config/sensitivity.js';
import { spreadToPixels } from '../ui/Crosshair.js';
import { WEAPONS, WEAPON_ORDER, getWeapon } from '../combat/weapons.js';

const _v = new THREE.Vector3();
const NO_BODIES = [];
const WEAPON_KEYS = Object.fromEntries(WEAPON_ORDER.map((id) => [`Digit${WEAPONS[id].key}`, id]));
const SLOT_LIST = WEAPON_ORDER.map((id) => ({ id, key: WEAPONS[id].key, name: WEAPONS[id].name }));
const ZOOM_SPEED = 14; // qué tan rápido entra y sale la mira telescópica

// Orquestador: conecta motor, entrada, jugador, arma, audio, guardado, UI y el modo activo.
// La interfaz de un modo está en modes/Mode.js; los modos se registran en modes/registry.js y los
// mapas en scenes/registry.js, así que un modo nuevo no necesita editar este archivo.
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
    this.weapon.onChange = () => this.onWeaponChange();

    // Modo táctil (teléfonos y tabletas): sin Pointer Lock, con joystick y botones en pantalla.
    this.touchMode = resolveTouchMode(this.store.data.settings.touch?.mode);
    this.input.touch = this.touchMode;
    this.touch = null;
    if (this.touchMode) {
      root.classList.add('touch-mode');
      this.touch = new TouchControls(this, root);
      const hint = document.createElement('div');
      hint.className = 'rotate-hint';
      hint.textContent = 'Gira el teléfono a horizontal para jugar';
      root.append(hint);
    }
    this.zoomLevel = 1;

    this.mode = null;
    this.paused = false;
    this.time = 0;
    this.perf = new PerfMeter();

    this.worlds = {};
    this.useWorld('range');
    this.applySettings();

    this.input.on('shoot', (time) => {
      if (this.mode && !this.paused) this.mode.onShoot(time);
    });
    this.input.on('lock', () => this.onLock());
    this.input.on('unlock', () => this.onUnlock());
    this.input.on('key', (e) => this.onKey(e));
    this.input.on('lockerror', () =>
      this.ui.toast('No se pudo capturar el mouse. Espera un segundo y vuelve a hacer clic.'),
    );
    // El audio solo puede iniciar tras un gesto del usuario.
    window.addEventListener('pointerdown', () => this.sfx.unlock());
    // Pérdida del contexto WebGL: soltar el mouse (pausa si hay partida) y avisar.
    this.engine.onContextLost = () => {
      this.input.unlock();
      this.ui.toast('La tarjeta gráfica se reinició. Restaurando gráficos…', 6000);
    };
    this.engine.onContextRestored = () => this.ui.toast('Gráficos restaurados.');
  }

  get settings() {
    return this.store.data.settings;
  }

  get playing() {
    return !!this.mode && !this.paused && this.input.locked;
  }

  // Activa un mapa registrado (scenes/registry.js); se construye la primera vez y se reutiliza.
  useWorld(key) {
    this.worlds[key] ??= createWorld(key);
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
    this.hud.setCrosshair(this.activeCrosshair());
    this.hud.showFps(s.video.showFps);
    this.engine.setQuality(s.video);
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

  // --- Armas ----------------------------------------------------------------------------

  // Mira del arma actual (o la global si "mira por arma" está desactivado).
  activeCrosshair() {
    const s = this.settings;
    return s.crosshairPerWeapon ? s.weaponCrosshairs[this.weapon.id] ?? s.crosshair : s.crosshair;
  }

  // Motivo por el que el modo no deja cambiar de arma (o null). La evaluación usa siempre el rifle.
  weaponLock() {
    return this.mode?.weaponLocked?.() ?? null;
  }

  // Equipa el arma elegida en el arsenal con todo cargado (al empezar una partida o fase).
  equipLoadout() {
    this.weapon.setWeapon(getWeapon(this.settings.weapon).id, { force: true });
    this.weapon.refill();
    this.onWeaponChange();
  }

  // Cambio de arma en partida (teclas 1-5) o desde el arsenal. Se recuerda como arma elegida.
  selectWeapon(id) {
    if (!WEAPONS[id]) return;
    const locked = this.mode ? this.weaponLock() : null;
    if (locked) {
      this.hud.flash(locked, 'info');
      return;
    }
    this.settings.weapon = id;
    this.store.persist();
    if (this.weapon.setWeapon(id)) this.hud.flash(WEAPONS[id].name, 'info');
  }

  onWeaponChange() {
    const w = this.weapon;
    this.hud.setCrosshair(this.activeCrosshair());
    const mode = w.stats.fireModes.length > 1 ? ` · ${w.auto ? 'AUTO' : 'SEMI'} [B]` : w.stats.zoom ? ' · clic der. = mira' : '';
    this.hud.setWeapon(`${w.stats.name}${mode}${this.mode?.weaponHudSuffix?.() ?? ''}`);
    this.hud.setWeaponSlots(SLOT_LIST, w.id, !!this.weaponLock());
  }

  onKey(e) {
    if (!this.playing) return;
    if (e.code === 'BracketLeft') this.nudgeSensitivity(0.97);
    else if (e.code === 'BracketRight') this.nudgeSensitivity(1.03);
    else if (e.code === 'KeyR' && this.weapon.enabled) this.weapon.reload();
    else if (WEAPON_KEYS[e.code] && !e.repeat) this.selectWeapon(WEAPON_KEYS[e.code]);
    else if (e.code === 'KeyB' && !e.repeat && this.weapon.canToggleMode) {
      if (this.mode?.fireModeLocked?.()) this.hud.flash('El modo de disparo lo fija esta fase', 'info');
      else this.hud.flash(this.weapon.toggleMode() ? 'Disparo automático' : 'Disparo semiautomático', 'info');
    }
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

    this.player.bodies = this.mode?.bodyColliders?.() ?? NO_BODIES;
    this.player.update(dt, playing);
    if (!this.mode) {
      // Paneo lento de fondo en el menú.
      this.player.look(Math.sin(this.time * 0.12) * 0.35, 0.04 + Math.sin(this.time * 0.2) * 0.03);
    }
    this.engine.camera.updateMatrixWorld();

    this.weapon.enabled = playing && !!this.mode?.weaponEnabled();
    if (this.touch) {
      this.touch.setVisible(playing);
      if (playing) this.touch.update();
    }
    this.updateScope(dt, playing);
    if (this.mode && !this.paused) {
      this.weapon.update(dt);
      this.mode.update(dt);
    }
    // Mira dinámica: se abre exactamente lo que se desvían las balas (movimiento, salto, ráfaga).
    if (this.activeCrosshair().dynamic) {
      const spread = this.weapon.enabled ? this.weapon.currentSpread() : 0;
      this.hud.setSpread(spreadToPixels(spread, this.engine.camera.fov, window.innerHeight));
    }
    this.effects.update(dt);
    this.viewmodel.update(dt, this.player);
    if (this.mode) this.hud.setAmmo(this.weapon.ammo, this.weapon.stats.magazine, this.weapon.reloadProgress);
    this.engine.showOverlay = this.settings.gameplay.viewmodel && !!this.mode && this.input.locked && this.zoomLevel < 1.15;
    this.world.update(dt);

    const perf = this.perf.tick();
    if (perf) this.hud.setFps(perf);
  }

  // Mira telescópica: clic derecho con un arma con zoom. Entra y sale suave; baja la sensibilidad en
  // proporción al zoom (multiplicada por el ajuste "sensibilidad con zoom").
  updateScope(dt, playing) {
    const w = this.weapon;
    w.scoped = playing && !!w.stats.zoom && this.input.aimDown && w.enabled && !w.reloading && !w.drawing;
    const target = w.scoped ? w.stats.zoom : 1;
    this.zoomLevel += (target - this.zoomLevel) * Math.min(1, dt * ZOOM_SPEED);
    if (Math.abs(target - this.zoomLevel) < 0.01) this.zoomLevel = target;
    this.engine.setZoom(this.zoomLevel);
    this.player.sensScale = this.zoomLevel > 1 ? (1 / this.zoomLevel) * this.settings.gameplay.zoomSensitivity : 1;
    this.hud.setScoped(this.zoomLevel > w.stats.zoom * 0.85 && w.scoped);
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
    // En táctil: pantalla completa y horizontal al entrar en partida (necesita el gesto del toque).
    if (this.touchMode && !document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().then(() => screen.orientation?.lock?.('landscape')).catch(() => {});
    }
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
        onMode: (id) => this.startModeById(id),
        onArsenal: () => this.showArsenal(),
        onProgress: () => this.ui.show(progressScreen(this, { onBack: () => this.showMenu() })),
        onSettings: () => this.showSettings(() => this.showMenu()),
      }),
    );
  }

  showSettings(onBack, opts) {
    this.ui.show(settingsScreen(this, onBack, opts));
    if (opts?.crosshairWeapon) this.ui.el.querySelector('.xh-preview')?.scrollIntoView({ block: 'center' });
  }

  showArsenal() {
    this.ui.show(
      arsenalScreen(this, {
        onBack: () => this.showMenu(),
        onCrosshair: (id) => this.showSettings(() => this.showArsenal(), { crosshairWeapon: id }),
      }),
    );
  }

  startMode(mode) {
    this.mode?.dispose();
    this.paused = false;
    this.mode = mode;
    mode.start();
  }

  // Inicia un modo del registro (lo usa el menú). Respeta su condición de bloqueo.
  startModeById(id) {
    const entry = getMode(id);
    if (!entry) {
      this.ui.toast(`Modo no disponible: ${id}`);
      return;
    }
    const locked = entry.locked?.(this);
    if (locked) {
      this.ui.toast(locked);
      return;
    }
    this.startMode(entry.create(this));
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
