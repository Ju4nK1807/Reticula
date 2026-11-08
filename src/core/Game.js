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
import { Ambience } from '../effects/Ambience.js';
import { MenuShowcase } from '../effects/MenuShowcase.js';
import { MENU_VFOV, MenuCamera } from '../effects/MenuCamera.js';
import { applyShadowQuality, environment, prepareWorld, setShadowMode } from '../gfx/lighting.js';
import { AutoQuality, guessDetail } from '../gfx/AutoQuality.js';
import { whenSurfacesReady } from '../gfx/surfaces.js';
import { Melee } from '../combat/Melee.js';
import { Grenades } from '../combat/Grenades.js';
import { Casings } from '../effects/Casings.js';
import { BotSkin, acquireSkin, loadSoldier, pooledSkins, releaseSkin } from '../bots/botSkin.js';
import { HUD } from '../ui/HUD.js';
import { UI } from '../ui/UI.js';
import { menuScreen } from '../ui/menuScreen.js';
import { settingsScreen } from '../ui/settingsScreen.js';
import { pauseScreen } from '../ui/pauseScreen.js';
import { progressScreen } from '../ui/progressScreen.js';
import { arsenalScreen } from '../ui/arsenalScreen.js';
import { crosshairScreen } from '../ui/crosshairScreen.js';
import { getMode } from '../modes/index.js';
import { GAMES, formatSens, roundTo } from '../config/sensitivity.js';
import { actionFor, keyLabel, normalizeKeys } from '../config/keybinds.js';
import { setActiveKeys } from '../ui/settingsScreen.js';
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
// Soldados que se dejan creados en el menú (los primeros enemigos aparecen sin coste).
const SKIN_PREFILL = 6;
const MENU_WORLD = 'armory'; // escenario de la pantalla de título (scenes/ArmoryMenu.js)
const PLAYER_PUSH = { r: 0.38, h: 1.75 }; // cilindro con el que el jugador empuja la utilería
const movers = []; // quienes empujan la utilería este cuadro (jugador + enemigos), reutilizado

export class Game {
  constructor(root) {
    this.store = new SaveStore();
    this.engine = new Engine(root.querySelector('#scene'));
    this.input = new Input(root);
    this.player = new PlayerController(this.engine.camera, this.input);
    this.ballistics = new Ballistics();
    this.weapon = new Weapon(this);
    this.melee = new Melee(this); // golpe cuerpo a cuerpo (V)
    this.grenades = new Grenades(this); // granadas (G), en los modos que las dan
    this.casings = new Casings(this); // vainas que expulsan las armas
    this.viewmodel = new Viewmodel();
    this.effects = new Effects();
    this.ambience = new Ambience(); // polvo y chispas de la pantalla de título
    this.showcase = new MenuShowcase(); // soldados de la pantalla de título
    this.menuCamera = new MenuCamera(); // planos de cámara del menú
    this.sfx = new Sfx();
    this.hud = new HUD(root.querySelector('#hud'));
    this.ui = new UI(root.querySelector('#ui'), root.querySelector('#toast'));
    this.ui.onBack = () => this.sfx.uiBack();
    this.engine.setOverlay(this.viewmodel);
    // Armas 3D: reflejos del mismo entorno que los mapas y descarga anticipada de los modelos.
    this.viewmodel.scene.environment = environment(this.engine.renderer);
    this.viewmodel.scene.environmentIntensity = 0.6;
    this.viewmodel.preload().then(() => this.warmWeapons());
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

    // Calidad automática: la primera vez (o con otra GPU) parte de un nivel según la GPU y el tipo
    // de dispositivo; después retoma lo que aprendió en este equipo.
    const video = this.settings.video;
    this.autoQuality = null;
    this.autoSaveT = 0;
    if (video.autoGpu !== this.engine.gpuName || !video.autoDetail) {
      video.autoGpu = this.engine.gpuName;
      video.autoDetail = guessDetail(this.engine.gpuName, { touch: this.touchMode });
      video.autoScale = 1;
      this.store.persist();
    }
    // La calidad se aplica antes de crear el primer mapa: sus texturas ya cargan en el tamaño justo.
    this.engine.setQuality(video);
    this.worlds = {};
    this.useWorld(MENU_WORLD);
    this.applySettings();

    this.input.on('shoot', (time) => {
      if (this.mode && !this.paused) this.mode.onShoot(time);
    });
    this.input.on('lock', () => this.onLock());
    this.input.on('unlock', () => this.onUnlock());
    this.input.on('key', (e) => this.onKey(e));
    this.input.on('wheel', (dir) => this.playing && this.cycleWeapon(dir));
    this.input.on('lockerror', () =>
      this.ui.toast('No se pudo capturar el mouse. Espera un segundo y vuelve a hacer clic.'),
    );
    // Botón Atrás de Android (lo envía MainActivity): pausa en partida, vuelve al menú fuera de ella.
    window.addEventListener('reticula-back', () => this.handleBack());
    // El audio solo puede iniciar tras un gesto del usuario.
    window.addEventListener('pointerdown', () => this.sfx.unlock());
    window.addEventListener('keydown', () => this.sfx.unlock());
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
    if (this.world !== this.worlds[key]) this.setWorld(this.worlds[key], key);
  }

  setWorld(world, key = null) {
    this.world = world;
    prepareWorld(world, this.engine.renderer);
    applyShadowQuality(world, this.engine.detail);
    world.setDetail?.(this.engine.detail);
    world.detail = this.engine.detail;
    this.engine.scene = world.scene;
    this.effects.attach(world.scene);
    this.grenades.attach(world.scene);
    this.casings.attach(world.scene);
    this.ambience.attach(world.scene, world.spawn);
    this.showcase.attach(world.scene, world.spawn, key, world);
    this.menuCamera.setShots(world.menuShots ?? null);
    this.player.setWorld(world);
    this.ballistics.setWorld(world);
    // Utilería con física: suena al chocar (según su material y lo fuerte del golpe).
    if (world.props) world.props.onImpact = (it, speed) => this.sfx.propHit(it.def.material, this.panFor(it.body.position), speed / 6);
    this.player.reset(world.spawn);
    // Sombreadores y texturas del mapa listos antes de jugar (sin tirones al girar la cámara). Las
    // texturas llegan un momento después: al terminar de cargar se suben a la GPU de una vez.
    this.engine.warmup(world.scene, this.engine.camera);
    whenSurfacesReady().then(() => {
      if (this.world === world) this.engine.warmup(world.scene, this.engine.camera);
    });
  }

  // Compila los sombreadores de las 5 armas en primera persona (copias diminutas, el arma actual se
  // oculta ese instante): sacar un arma por primera vez ya no da un tirón.
  warmWeapons() {
    const vm = this.viewmodel;
    const extras = [...vm.loaded.values()].map(({ object }) => object.clone()).concat(vm.warmupObjects?.() ?? []);
    for (const c of extras) {
      c.scale.setScalar(0.002);
      c.position.set(0, 0, -0.5);
    }
    if (!extras.length) return;
    const visible = vm.gun.visible;
    vm.gun.visible = false;
    this.engine.warmup(vm.scene, vm.camera, extras, { direct: true, clear: false });
    vm.gun.visible = visible;
  }

  // Precarga el soldado (modelo, animaciones y arma) y compila sus sombreadores mientras el jugador
  // está en el menú: el primer enemigo ya no congela la partida. La muestra se conserva fuera de la
  // escena porque sus materiales mantienen vivos los sombreadores compilados.
  async warmSoldier() {
    const color = this.settings.enemyColor;
    const template = await loadSoldier(color);
    if (!template || this.warmedColor === color) return;
    this.warmedColor = color;
    const skin = acquireSkin(template, color);
    const cam = this.engine.camera;
    // Delante de la cámara pero diminuto (una fracción de píxel): se dibuja, no se ve.
    skin.root.position.set(0, 0, -3).applyQuaternion(cam.quaternion).add(cam.position);
    skin.root.scale.setScalar(0.002);
    skin.update(1 / 60, { lateral: 0, forward: 0, speed: 0, crouch: 0, shotT: 9, dying: false, flash: 0 });
    this.engine.warmup(this.world.scene, cam, [skin.root]);
    releaseSkin(skin);
    // Reserva inicial: unos cuantos soldados más, de a uno por vez para no trabar el menú.
    const fill = () => {
      if (pooledSkins(color) >= SKIN_PREFILL || this.settings.enemyColor !== color) return;
      releaseSkin(new BotSkin(template, color));
      setTimeout(fill, 120);
    };
    setTimeout(fill, 120);
  }

  applySettings() {
    const s = this.settings;
    s.keys = normalizeKeys(s.keys);
    this.input.bindings = s.keys;
    setActiveKeys(s.keys);
    this.player.configure(s.sens);
    this.engine.setHorizontalFov(s.fov);
    this.hud.setCrosshair(this.activeCrosshair());
    this.hud.showFps(s.video.showFps);
    setShadowMode(s.video.shadows);
    this.engine.setQuality(s.video);
    if (this.world) applyShadowQuality(this.world, this.engine.detail);
    // La calidad automática solo existe en el modo "auto"; elegir otro modo la descarta.
    if (s.video.quality === 'auto') {
      this.autoQuality ??= new AutoQuality({ detail: s.video.autoDetail, scale: s.video.autoScale });
    } else this.autoQuality = null;
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

  // Cambio de arma en partida (teclas 1-9 o rueda) o desde el arsenal. Se recuerda como arma elegida.
  selectWeapon(id) {
    if (!WEAPONS[id]) return;
    const locked = this.mode ? this.weaponLock() : null;
    if (locked) {
      this.hud.flash(locked, 'info');
      return;
    }
    // Modos con armas propias (zombi: se compran): solo se puede sacar lo que se tiene, y la elección
    // no cambia el arma guardada del arsenal.
    const owned = this.mode?.ownsWeapon?.(id);
    if (owned === false) {
      this.hud.flash(`${WEAPONS[id].name}: cómprala en la armería`, 'bad');
      return;
    }
    if (owned === undefined) {
      this.settings.weapon = id;
      this.store.persist();
    }
    if (this.weapon.setWeapon(id)) this.hud.flash(WEAPONS[id].name, 'info');
  }

  // Rueda del mouse: la siguiente (o anterior) arma disponible en este modo.
  cycleWeapon(dir) {
    if (this.weaponLock() || !this.weapon.enabled) return;
    const i = WEAPON_ORDER.indexOf(this.weapon.id);
    for (let k = 1; k < WEAPON_ORDER.length; k++) {
      const id = WEAPON_ORDER[(i + dir * k + WEAPON_ORDER.length * k) % WEAPON_ORDER.length];
      if (this.mode?.ownsWeapon?.(id) === false) continue;
      this.selectWeapon(id);
      return;
    }
  }

  onWeaponChange() {
    const w = this.weapon;
    this.hud.setCrosshair(this.activeCrosshair());
    // En táctil no hay teclas: se omiten los atajos (la mira tiene su propio botón).
    const keys = !this.touchMode;
    const modeKey = keys ? ` [${keyLabel(this.settings.keys, 'fireMode')}]` : '';
    const mode = w.stats.fireModes.length > 1 ? ` · ${w.modeLabel}${modeKey}` : w.stats.fireModes[0] === 'burst' ? ' · RÁFAGA' : w.stats.zoom && keys ? ' · clic der. = mira' : '';
    this.hud.setWeapon(`${w.stats.name}${mode}${this.mode?.weaponHudSuffix?.() ?? ''}`);
    this.hud.setWeaponSlots(SLOT_LIST, w.id, !!this.weaponLock(), (id) => this.mode?.ownsWeapon?.(id) !== false);
  }

  // Teclas en partida: cada código se traduce a su acción según los controles del jugador
  // (config/keybinds.js). Las armas (1-9) son fijas.
  onKey(e) {
    if (!this.playing) return;
    if (WEAPON_KEYS[e.code]) {
      if (!e.repeat) this.selectWeapon(WEAPON_KEYS[e.code]);
      return;
    }
    const action = actionFor(this.settings.keys, e.code);
    if (action && action !== 'restart') e.preventDefault(); // p. ej. Tab o Alt asignados
    const once = !e.repeat;
    switch (action) {
      case 'sensDown':
        this.nudgeSensitivity(0.97);
        break;
      case 'sensUp':
        this.nudgeSensitivity(1.03);
        break;
      case 'reload':
        if (this.weapon.enabled) this.weapon.reload();
        break;
      case 'fireMode':
        if (!once || !this.weapon.canToggleMode) break;
        if (this.mode?.fireModeLocked?.()) this.hud.flash('El modo de disparo lo fija esta fase', 'info');
        else {
          this.weapon.toggleMode();
          this.hud.flash({ auto: 'Disparo automático', semi: 'Disparo semiautomático', burst: 'Disparo en ráfaga' }[this.weapon.mode], 'info');
        }
        break;
      case 'melee':
        if (once) this.melee.trigger();
        break;
      case 'grenade':
        if (once) this.grenades.throw();
        break;
      case 'grenadeNext':
        if (once) this.grenades.cycleType();
        break;
      case 'restart':
        if (once) {
          e.preventDefault();
          this.mode.restartStage?.();
        }
        break;
      default:
        this.mode?.onKey?.(e, action); // acciones propias del modo (zombi: usar / comprar)
    }
  }

  start() {
    this.showMenu();
    this.engine.start((dt) => this.frame(dt));
    setTimeout(() => this.warmSoldier(), 1500);
  }

  frame(dt) {
    this.time += dt;
    const playing = this.playing;

    this.player.bodies = this.mode?.bodyColliders?.() ?? NO_BODIES;
    this.player.update(dt, playing);
    // Menú: la cámara la llevan los planos del escenario (Armería) con su lente; en otro mapa, paneo lento.
    const menuView = !this.mode && !!this.world.menuShots;
    const fov = menuView ? MENU_VFOV : null;
    if (this.engine.fovOverride !== fov) {
      this.engine.fovOverride = fov;
      this.engine.applyFov();
    }
    if (menuView) this.menuCamera.update(dt, this.time, this.engine.camera);
    else if (!this.mode) this.player.look(Math.sin(this.time * 0.12) * 0.35, 0.04 + Math.sin(this.time * 0.2) * 0.03);
    // Sacudida de cámara de las explosiones cercanas (no se acumula: el jugador fija la mirada cada cuadro).
    const shake = this.grenades.shakeOffset(this.time);
    if (shake) {
      this.engine.camera.rotation.x += shake;
      this.engine.camera.rotation.z += shake * 0.6;
    }
    this.engine.camera.updateMatrixWorld();

    this.weapon.enabled = playing && !!this.mode?.weaponEnabled();
    this.weapon.infinite = !!this.mode?.infiniteAmmo?.();
    if (this.touch) {
      this.touch.setVisible(playing);
      if (playing) this.touch.update();
    }
    this.updateScope(dt, playing);
    if (this.mode && !this.paused) {
      this.weapon.update(dt);
      this.melee.update(dt);
      this.grenades.update(dt);
      this.casings.update(dt);
      this.mode.update(dt);
      this.updateProps(dt);
    }
    // Mira dinámica: se abre exactamente lo que se desvían las balas (movimiento, salto, ráfaga).
    if (this.activeCrosshair().dynamic) {
      const spread = this.weapon.enabled ? this.weapon.currentSpread() : 0;
      this.hud.setSpread(spreadToPixels(spread, this.engine.camera.fov, window.innerHeight));
    }
    this.effects.update(dt, this.engine.camera);
    this.ambience.update(dt, !this.mode);
    this.showcase.update(dt, !this.mode);
    this.viewmodel.showArms = this.settings.gameplay.hands !== false;
    this.viewmodel.update(dt, this.player);
    if (this.mode) this.hud.setAmmo(this.weapon.ammo, this.weapon.stats.magazine, this.weapon.reloadProgress, this.weapon.reserve, this.weapon.infinite);
    // El arma se oculta solo dentro de la mira telescópica (con las miras de hierro se sigue viendo).
    this.engine.showOverlay = this.settings.gameplay.viewmodel && !!this.mode && this.input.locked && !(this.weapon.scoped && this.zoomLevel > 1.15);
    // El detalle puede cambiar en cualquier momento (calidad automática): el mapa ajusta sus luces.
    if (this.world.detail !== this.engine.detail) {
      this.world.detail = this.engine.detail;
      this.world.setDetail?.(this.engine.detail);
    }
    this.world.update(dt);

    const now = performance.now();
    const perf = this.perf.tick(now);
    if (perf) this.hud.setFps(perf);
    this.updateAutoQuality(now);
    // Con un menú opaco encima (pausa, configuración, progreso…) la escena no se ve: no se dibuja.
    // Además el desenfoque del menú no tiene que recalcularse cada cuadro (mucho trabajo en GPUs
    // integradas). La pantalla de título sí muestra la escena en vivo.
    this.engine.frozen = this.ui.el.classList.contains('active') && !this.ui.el.querySelector('.title-screen');
  }

  // Resolución dinámica: se adapta jugando y en la pantalla de título (la armería se dibuja en vivo);
  // con otro menú encima la escena no se dibuja y los cuadros no cuentan.
  updateAutoQuality(now) {
    const last = this.lastFrameAt ?? now;
    this.lastFrameAt = now;
    const aq = this.autoQuality;
    const title = !this.mode && !!this.ui.el.querySelector('.title-screen');
    if (!aq || !(this.playing || title) || this.engine.frozen) return;
    const change = aq.sample(now - last);
    const video = this.settings.video;
    if (change) {
      video.autoDetail = change.detail;
      video.autoScale = change.scale;
      this.engine.setQuality(video);
      applyShadowQuality(this.world, this.engine.detail);
      this.autoSaveT = 3; // se guarda unos segundos después (sin escribir en cada ajuste)
    }
    if (this.autoSaveT > 0 && (this.autoSaveT -= (now - last) / 1000) <= 0) this.store.persist();
  }

  // Mira telescópica: clic derecho con un arma con zoom. Entra y sale suave; baja la sensibilidad en
  // proporción al zoom (multiplicada por el ajuste "sensibilidad con zoom").
  // Clic derecho: con el francotirador, mira telescópica; con las demás armas, apuntar con las miras
  // (ADS: algo de aumento, menos dispersión y caminar más lento). El ADS no está en la evaluación, que
  // fija el arma para que los rangos sean comparables.
  updateScope(dt, playing) {
    const w = this.weapon;
    const ready = playing && this.input.aimDown && w.enabled && !w.reloading && !w.drawing && !this.melee?.busy;
    w.scoped = ready && !!w.stats.zoom;
    w.aiming = ready && !!w.stats.ads && this.adsAllowed();
    const target = w.scoped ? w.stats.zoom : w.aiming ? w.stats.ads.zoom : 1;
    this.zoomLevel += (target - this.zoomLevel) * Math.min(1, dt * ZOOM_SPEED);
    if (Math.abs(target - this.zoomLevel) < 0.01) this.zoomLevel = target;
    this.engine.setZoom(this.zoomLevel);
    this.player.sensScale = this.zoomLevel > 1 ? (1 / this.zoomLevel) * this.settings.gameplay.zoomSensitivity : 1;
    this.player.speedScale = w.aiming ? w.stats.ads.speed : w.scoped ? 0.7 : 1;
    this.viewmodel.aimTarget = w.aiming ? 1 : 0;
    this.hud.setScoped(!!w.stats.zoom && this.zoomLevel > w.stats.zoom * 0.85 && w.scoped);
    // Con el arma ya casi en la cara, la retícula sobra (y se ve la mira del arma).
    this.hud.setAds(this.viewmodel.aim > 0.55);
  }

  adsAllowed() {
    return !this.mode?.weaponLocked?.();
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

  handleBack() {
    if (this.mode && this.input.locked) return this.input.unlock(); // en partida → pausa
    if (this.mode?.onBack?.()) return; // el modo lo resolvió (p. ej. cerrar la armería)
    if (this.mode && this.paused) return this.quitToMenu();
    // Igual que Esc: lo atienden el submenú abierto o el botón Volver de la pantalla (UI.js).
    const esc = new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', bubbles: true, cancelable: true });
    document.dispatchEvent(esc);
    if (esc.defaultPrevented) return;
    if (this.mode) this.quitToMenu();
    else this.ui.toast('Para salir, usa el botón de inicio del teléfono.');
  }

  showMenu() {
    this.hud.setVisible(false);
    this.ui.show(
      menuScreen(this, {
        onMode: (id) => this.startModeById(id),
        onArsenal: () => this.showArsenal(),
        onCrosshair: () => this.showCrosshair(() => this.showMenu()),
        onProgress: () => this.ui.show(progressScreen(this, { onBack: () => this.showMenu() })),
        onSettings: () => this.showSettings(() => this.showMenu()),
        onHelp: () => this.showSettings(() => this.showMenu(), { tab: 'datos' }),
      }),
    );
  }

  showSettings(onBack, opts) {
    this.ui.show(settingsScreen(this, onBack, opts));
  }

  // Editor de retícula. `weapon`: abre editando la de esa arma (desde el Arsenal).
  showCrosshair(onBack, { weapon = null } = {}) {
    this.ui.show(crosshairScreen(this, { onBack, weapon }));
  }

  showArsenal() {
    this.ui.show(
      arsenalScreen(this, {
        onBack: () => this.showMenu(),
        onCrosshair: (id) => this.showCrosshair(() => this.showArsenal(), { weapon: id }),
      }),
    );
  }

  startMode(mode) {
    this.melee.reset();
    this.grenades.clear();
    this.casings.clear();
    this.mode?.dispose();
    this.paused = false;
    this.mode = mode;
    mode.start();
    this.world.props?.reset(); // la utilería vuelve a su lugar en cada partida
  }

  // Física de la utilería del mapa: el jugador y los enemigos la empujan al pasar.
  updateProps(dt) {
    const props = this.world.props;
    if (!props) return;
    movers.length = 0;
    const p = this.player.position;
    movers.push({ x: p.x, z: p.z, r: PLAYER_PUSH.r, y0: p.y, h: PLAYER_PUSH.h });
    for (const b of this.player.bodies) movers.push(b);
    props.update(dt, movers);
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
    const mode = entry.create(this);
    mode.title ??= entry.title; // lo muestra la pausa
    this.startMode(mode);
  }

  quitToMenu() {
    this.melee.reset();
    this.grenades.clear();
    this.casings.clear();
    this.mode?.dispose();
    this.mode = null;
    this.paused = false;
    this.input.unlock();
    this.useWorld(MENU_WORLD);
    this.player.reset(this.world.spawn);
    this.showMenu();
  }

  /** La pantalla de título avisa qué opción está enfocada: la cámara del menú va a su plano. */
  focusMenu(id) {
    this.menuCamera.focus(id);
  }
}
