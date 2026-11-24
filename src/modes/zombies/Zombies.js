import * as THREE from 'three';
import { HorrorMusic } from '../../audio/HorrorMusic.js';
import '@fontsource/creepster/latin-400.css';
import './zombies.css';
import { Mode } from '../Mode.js';
import { Ambience } from '../../effects/Ambience.js';
import { ZombieRun } from './ZombieRun.js';
import { ZombieHud } from './ZombieHud.js';
import { zombieIntroScreen, zombieResultsScreen, zombieShopScreen } from './zombieScreens.js';
import { BARRICADE, DEFENSE, DIFFICULTIES, DOORS, FIRST_COUNTDOWN, GRENADE_MAX, INTERMISSION, PERKS, PLAYER, POWERUPS, RESERVE, ZOMBIE_TYPES, cannotBuy, emptyRecord, updateRecord } from './zombieData.js';
import { Bar } from './Bar.js';
import { WEAPONS } from '../../combat/weapons.js';
import { keyLabel } from '../../config/keybinds.js';
import { acquireZombieSkin, loadZombieModel, pooledZombieSkins, prefillZombieSkin, releaseZombieSkin } from './zombieSkin.js';
import { BloodFx } from './BloodFx.js';
import { addHeightFog, nightEnvironment } from './atmosphere.js';
import { setGrade } from '../../gfx/grade.js';
import { Flashlight } from './flashlight.js';
import { setZombieRim } from './zombieLook.js';
import { SAFE } from './safe.js';

export const MODE_ID = 'zombies';
export const DEFENSE_ID = 'zombie-defense';
export const WORLD_ID = 'ruins';

const DEATH_TIME = 2.2;
const DEATH_SLOWMO = 0.3;
const COMBAT = new Set(['countdown', 'wave', 'intermission']);
const FORGE_GLOW = new THREE.ShaderMaterial({
  uniforms: { uTime: { value: 0 } },
  vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform float uTime; varying vec3 vP;
    void main(){
      float v = sin(vP.x * 40.0 + vP.z * 55.0 + uTime * 3.0) * 0.5 + 0.5;
      float w = sin(vP.y * 70.0 - uTime * 4.2 + vP.x * 12.0) * 0.5 + 0.5;
      vec3 c = mix(vec3(0.55, 0.12, 1.0), vec3(0.1, 0.85, 1.0), v) * (0.25 + 0.55 * pow(w, 3.0));
      gl_FragColor = vec4(c, 1.0);
    }`,
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
});
const PREFILL = 42;
const WARM = 32;
const GRADE = { saturation: 0.74, contrast: 1.16, vignette: 0.95, grain: 0.045, lift: [0, 0.003, 0.008], gain: [0.98, 0.99, 1.0] };
const VIEW_ZOOM = 1.3;
const VM_DARK = 0.2;
const VM_LIT = 0.55;

export class Zombies extends Mode {
  constructor(game, { variant = 'survival' } = {}) {
    super(game);
    this.variant = variant;
    this.recordId = variant === 'defense' ? DEFENSE_ID : MODE_ID;
    this.bar = null;
    this.root = new THREE.Group();
    this.state = 'intro';
    this.run = null;
    this.hud = null;
    this.timer = 0;
    this.nextWave = 1;
    this.lastBeep = null;
    this.shopOpen = false;
    this.grenadeBag = { frag: 0, fire: 0, stun: 0, decoy: 0 };
    this.near = null;
    this.keypad = null;
    this.ash = null;
  }

  get grenades() {
    return Object.values(this.grenadeBag).reduce((s, n) => s + n, 0);
  }

  get record() {
    return { ...emptyRecord(), ...this.game.store.modeRecord(this.recordId) };
  }

  get difficulty() {
    const d = this.game.store.modeRecord(this.recordId).difficulty;
    return DIFFICULTIES[d] ? d : 'normal';
  }

  set difficulty(id) {
    if (!DIFFICULTIES[id]) return;
    this.game.store.modeRecord(this.recordId).difficulty = id;
    this.game.store.persist();
  }

  start() {
    const g = this.game;
    g.useWorld(WORLD_ID);
    g.world.scene.add(this.root);
    g.weapon.onShot = (hit, spread, time) => {
      if (this.state === 'wave' || this.state === 'intermission' || this.state === 'countdown') this.run?.handleShot(hit, time);
    };
    this.hud = new ZombieHud(g.hud);
    this.hud.setVisible(false);
    this.ash = new Ambience({ spark: '#ff8a3d', dust: '#8a8f96', count: 200 });
    this.ash.attach(g.world.scene, g.world.spawn);
    this.blood = new BloodFx();
    this.blood.attach(g.world.scene);
    this.blood.floorAt = g.world.floorAt?.bind(g.world);
    g.world.scene.environment = nightEnvironment(g.engine.renderer);
    g.world.camera = g.engine.camera;
    addHeightFog(this.ash.points.material);
    addHeightFog(this.blood.decals.material);
    setGrade(GRADE);
    g.world.setDread?.(true);
    setZombieRim(0.35);
    this.flashlight = new Flashlight(g.world.scene);
    this.flashlight.onEmpty = () => {
      g.sfx.tone('square', 1200, 400, 0.05, 0.05);
      g.hud.flash('La linterna se quedó sin batería: se recarga apagada', 'bad');
    };
    this.flashlight.setShadows(g.engine.detail === 'alta');
    this.music = new HorrorMusic(g.sfx, { paused: () => g.paused || this.shopOpen });
    g.sfx.setSpace(1.35);
    this.vmLights = g.viewmodel.scene.children.filter((o) => o.isLight).map((light) => ({ light, base: light.intensity }));
    if (this.variant === 'defense') this.bar = new Bar(g, this.root);
    this.showIntro();
    this.warmZombies();
  }

  async warmZombies() {
    const g = this.game;
    const breathe = () => new Promise((r) => setTimeout(r, 30));
    const template = await loadZombieModel();
    if (!template || g.mode !== this) return;
    const type = ZOMBIE_TYPES.walker;
    const first = acquireZombieSkin(template, { height: type.height, kind: type.look });
    const cam = g.engine.camera;
    first.root.position.set(0, 0, -3).applyQuaternion(cam.quaternion).add(cam.position);
    first.root.scale.setScalar(0.002);
    first.update(1 / 60, { anim: 'walk', speed: 1 });
    g.engine.warmup(g.world.scene, cam, [first.root]);
    const made = [first];
    for (let i = 1; i < WARM - pooledZombieSkins(); i++) {
      if (i % 3 === 0) {
        await breathe();
        if (g.mode !== this) break;
      }
      made.push(acquireZombieSkin(template, { height: type.height, kind: type.look }));
    }
    for (const s of made) releaseZombieSkin(s);
    this.warmWholeMap();
  }

  warmWholeMap() {
    const g = this.game;
    if (g.mode !== this) return;
    const culled = [];
    g.world.scene.traverse((o) => {
      if ((o.isMesh || o.isPoints) && o.frustumCulled) {
        o.frustumCulled = false;
        culled.push(o);
      }
    });
    const powered = g.world.powered;
    g.world.setPower?.(true);
    try {
      g.engine.warmup(g.world.scene, g.engine.camera);
    } finally {
      for (const o of culled) o.frustumCulled = true;
      g.world.setPower?.(powered);
    }
  }

  prefillSkins() {
    if (this.prefilling || pooledZombieSkins() >= PREFILL) return;
    this.prefilling = true;
    loadZombieModel().then((template) => {
      this.prefilling = false;
      if (template && this.game.mode === this) prefillZombieSkin(template);
    });
  }

  showIntro() {
    const g = this.game;
    this.state = 'intro';
    g.hud.setVisible(false);
    g.ui.show(
      zombieIntroScreen(g, {
        record: this.record,
        variant: this.variant,
        difficulty: this.difficulty,
        onDifficulty: (id) => {
          this.difficulty = id;
          this.showIntro();
        },
        onStart: () => g.input.lock(),
        onSettings: () => g.showSettings(() => this.showIntro()),
        onBack: () => g.quitToMenu(),
      }),
    );
  }

  get viewZoom() {
    return VIEW_ZOOM;
  }

  toggleFlashlight() {
    if (!this.flashlight || !COMBAT.has(this.state) || this.shopOpen) return;
    if (this.flashlight.toggle()) this.game.sfx.tone('square', 2300, 1500, 0.025, 0.05);
    else {
      this.game.sfx.tone('square', 900, 500, 0.03, 0.04);
      this.game.hud.flash('Linterna sin batería: se recarga apagada', 'bad');
    }
  }

  wantsLock() {
    return COMBAT.has(this.state) && !this.shopOpen;
  }

  weaponEnabled() {
    return COMBAT.has(this.state) && !this.shopOpen;
  }

  weaponLocked() {
    return null;
  }

  ownsWeapon(id) {
    return this.run ? this.run.owned.has(id) : id === 'pistol';
  }

  weaponSlots() {
    return this.run ? this.run.slots : ['pistol'];
  }

  meleeAllowed() {
    return COMBAT.has(this.state) && !this.shopOpen;
  }

  onMeleeHit(hit, damage) {
    this.run?.handleMelee(hit, damage);
  }

  grenadesAllowed() {
    return this.state === 'wave';
  }

  onExplosion(point, radius, los, opts) {
    this.run?.onExplosion(point, radius, los, opts);
  }

  onFireTick(point, radius, damage, los) {
    this.run?.onFireTick(point, radius, damage, los);
  }

  onStun(point, radius, seconds, los) {
    this.run?.onStun(point, radius, seconds, los);
  }

  setDecoy(point) {
    this.run?.setDecoy(point);
  }

  hitMeshes() {
    return this.run && COMBAT.has(this.state) ? this.run.hitMeshes() : [];
  }

  bodyColliders() {
    return this.run ? this.run.bodyColliders() : [];
  }

  onLock() {
    const g = this.game;
    if (this.shopOpen) {
      this.shopOpen = false;
      g.ui.hide();
      g.hud.setVisible(true);
      return;
    }
    if (this.state !== 'intro' && this.state !== 'over') return;
    g.ui.hide();
    this.beginRun();
  }

  restartStage() {
    if (COMBAT.has(this.state)) this.beginRun();
  }

  onBack() {
    if (!this.shopOpen) return false;
    this.game.input.lock();
    return true;
  }

  onKey(e, action) {
    if (action === 'flashlight' && !e.repeat) this.toggleFlashlight();
    if (action !== 'interact' || e.repeat) return;
    if (this.keypad) return this.closeKeypad();
    if (this.nearBarricade) return;
    if (this.near) this.buyNear();
    else this.openShop();
  }

  findBarricade() {
    const p = this.game.player.position;
    let best = null;
    let bestD = Infinity;
    for (const b of this.game.world.barricades ?? []) {
      if (b.boards >= b.max) continue;
      const ox = p.x - b.mouth.x;
      const oz = p.z - b.mouth.z;
      const inside = ox * b.inward.x + oz * b.inward.z;
      const lateral = Math.abs(ox * b.inward.z - oz * b.inward.x);
      if (inside < 0 || inside > BARRICADE.reach || lateral > b.width / 2 + 0.6) continue;
      const d = Math.hypot(ox, oz);
      if (d < bestD) {
        best = b;
        bestD = d;
      }
    }
    return best;
  }

  updateRepair(dt) {
    const g = this.game;
    const b = this.nearBarricade;
    if (!b || !g.input.isAction('interact')) {
      this.repairT = 0;
      return;
    }
    this.repairT = (this.repairT ?? 0) - dt;
    if (this.repairT > 0) return;
    this.repairT = BARRICADE.repairEvery;
    if (this.run.repairBoard(b)) {
      g.sfx.propHit('wood', 0, 0.6);
      g.sfx.meleeHit();
    }
  }

  findNear() {
    const run = this.run;
    const items = this.game.world.interactables ?? [];
    const p = this.game.player.position;
    let best = null;
    let bestD = Infinity;
    for (const it of items) {
      const d = Math.hypot(it.pos.x - p.x, it.pos.z - p.z);
      if (d > it.radius || d >= bestD || Math.abs((it.pos.y ?? 0) - p.y) > 1.5 || !run.offer(it)) continue;
      best = it;
      bestD = d;
    }
    return best;
  }

  buyNear() {
    const g = this.game;
    const why = this.run.buy(this.near);
    if (why === 'keypad') return this.openKeypad(this.near);
    if (why) {
      g.hud.flash(why, 'bad');
      g.sfx.dryFire();
      return;
    }
    g.sfx.purchase();
    g.onWeaponChange();
  }

  openKeypad(it) {
    if (!this.run || this.keypad) return;
    this.keypad = { it, msg: '', tone: '', msgT: 0 };
    this.run.safe.clear();
    this.hud.onKeypad = (k) => this.keypadPress(k);
    this.game.sfx.tone('square', 900, 1300, 0.05, 0.05);
    this.renderKeypad();
  }

  closeKeypad() {
    if (!this.keypad) return;
    this.keypad = null;
    this.run?.safe.clear();
    this.hud?.setKeypad(null);
  }

  keypadMsg(msg, tone = '') {
    if (!this.keypad) return;
    this.keypad.msg = msg;
    this.keypad.tone = tone;
    this.keypad.msgT = 1.8;
  }

  keypadPress(k) {
    const run = this.run;
    if (!this.keypad || !run) return;
    const s = run.safe;
    const sfx = this.game.sfx;
    if (k === 'close') return this.closeKeypad();
    if (k === 'back') s.back();
    else if (k === 'ok') {
      const r = run.submitSafeCode();
      if (r === 'open') return;
      if (r === 'short') {
        this.keypadMsg(`Son ${SAFE.digits} cifras`, 'bad');
        sfx.dryFire();
      } else if (r === 'locked') sfx.dryFire();
    } else if (s.press(k)) sfx.tone('square', 1500 + Number(k) * 45, 1500 + Number(k) * 45, 0.045, 0.045);
    else sfx.dryFire();
    this.renderKeypad();
  }

  captureKey(e) {
    if (!this.keypad) return false;
    const digit = /^(?:Digit|Numpad)([0-9])$/.exec(e.code);
    let k = digit ? digit[1] : null;
    if (e.code === 'Backspace') k = 'back';
    if (e.code === 'Enter' || e.code === 'NumpadEnter') k = 'ok';
    if (!k) return false;
    e.preventDefault();
    if (!e.repeat || k === 'back') this.keypadPress(k);
    return true;
  }

  renderKeypad(dt = 0) {
    const kp = this.keypad;
    if (!kp || !this.run) return;
    const s = this.run.safe;
    kp.msgT -= dt;
    let msg;
    let tone = '';
    if (s.lockT > 0) {
      msg = `Código incorrecto · espera ${Math.ceil(s.lockT)} s`;
      tone = 'bad';
    } else if (kp.msgT > 0) {
      msg = kp.msg;
      tone = kp.tone;
    } else msg = s.known ? `El Jefe soltó el código: ${s.code}` : 'El código lo tiene El Jefe: mátalo';
    const g = this.game;
    const help = `Números: escribir · Enter: abrir · ${keyLabel(g.settings.keys, 'interact')}: cerrar`;
    this.hud.setKeypad({ entry: s.entry, msg, tone, help });
  }

  onPause() {
    this.closeKeypad();
  }

  beginRun() {
    const g = this.game;
    this.closeKeypad();
    this.run?.dispose();
    g.world.resetDoors?.();
    g.world.resetBarricades?.();
    g.world.setPower?.(this.variant === 'defense');
    g.world.moveBox?.(0);
    if (this.bar) {
      g.world.openDoor?.('plaza');
      this.bar.restock(this.bar.total);
      this.bar.acc = 0;
    }
    this.run = new ZombieRun(this);
    this.run.listener = (type, data) => this.onRunEvent(type, data);
    g.world.props?.reset();
    g.player.reset(g.world.spawn);
    g.player.movementEnabled = true;
    g.weapon.reserveBy = Object.fromEntries(Object.entries(RESERVE).map(([id, n]) => [id, n === null ? null : 0]));
    this.run.applyPerks();
    g.weapon.setWeapon('pistol', { force: true });
    g.weapon.refill();
    g.onWeaponChange();
    g.effects.clear();
    this.blood?.clear();
    g.grenades.clear();
    g.grenades.type = 'frag';
    this.grenadeBag = { frag: PLAYER.startGrenades, fire: 0, stun: 0, decoy: 0 };
    this.near = null;
    g.hud.setVisible(true);
    g.hud.setHealth(1);
    g.hud.setLabel(`${this.variant === 'defense' ? 'Defensa de la barra' : 'Modo zombi'} · ${DIFFICULTIES[this.difficulty].name}`);
    this.hud.setVisible(true);
    this.flashlight.on = true;
    this.flashlight.battery = 1;
    this.music.start();
    g.hud.flash(g.touchMode ? 'Linterna: botón de la luz' : `Linterna: ${keyLabel(g.settings.keys, 'flashlight')} para prender o apagar`, 'info');
    this.state = 'countdown';
    this.timer = FIRST_COUNTDOWN;
    this.nextWave = 1;
    this.lastBeep = null;
    this.shopOpen = false;
  }

  startWave() {
    this.state = 'wave';
    this.run.startWave(this.nextWave);
  }

  update(dt) {
    const g = this.game;
    const run = this.run;
    this.ash?.update(dt, true);
    this.blood?.update(this.state === 'dying' ? dt * DEATH_SLOWMO : dt);
    this.updateFlashlight(dt);
    if (!run) return;
    if (this.state === 'countdown' || this.state === 'intermission') this.prefillSkins();
    switch (this.state) {
      case 'countdown':
        run.update(dt);
        this.timer -= dt;
        this.beeps();
        if (this.timer <= 0) this.startWave();
        break;
      case 'wave':
        run.update(dt);
        if (run.died) this.die();
        else if (run.state === 'clear') {
          this.state = 'intermission';
          this.timer = INTERMISSION;
          this.nextWave = run.wave + 1;
          this.lastBeep = null;
        }
        break;
      case 'intermission':
        run.update(dt);
        if (run.died) {
          this.die();
          break;
        }
        if (!this.shopOpen) {
          this.timer -= dt;
          this.beeps();
          if (this.timer <= 0) this.startWave();
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
    this.updateMusic();
    const active = COMBAT.has(this.state) && !this.shopOpen && !run.died;
    this.nearBarricade = active ? this.findBarricade() : null;
    this.near = active && !this.nearBarricade ? this.findNear() : null;
    if (this.keypad && (this.near !== this.keypad.it || run.safe.unlocked)) this.closeKeypad();
    this.renderKeypad(dt);
    this.updateRepair(dt);
    if (this.nearBarricade) {
      const key = g.touchMode ? 'Mantén «Usar»' : `Mantén ${keyLabel(g.settings.keys, 'interact')}`;
      const b = this.nearBarricade;
      const capped = run.repairPoints >= BARRICADE.repairCapPerWave;
      this.hud.setPrompt({ key, text: `Reparar barricada (${b.boards}/${b.max})${capped ? '' : ` · +${BARRICADE.repairPoints} por tablón`}`, price: null, ok: true });
    } else this.hud.setPrompt(this.near && !this.keypad ? this.promptFor(this.near) : null);
    g.hud.setStats(run.hudStats());
    this.hud.update(g, run, this);
    this.updateForgeGlow(dt);
  }

  updateMusic() {
    const run = this.run;
    const m = this.music;
    if (!m || !run) return;
    m.setHealth(run.health / run.maxHealth);
    if (this.state !== 'wave') {
      m.setIntensity(this.state === 'dying' ? 1 : 0.15);
      return;
    }
    const p = this.game.player.position;
    let close = 0;
    for (const z of run.bots) if (z.alive && z.position.distanceToSquared(p) < 15 * 15) close++;
    m.setIntensity(0.45 + Math.min(1, close / 6) * 0.55);
  }

  updateFlashlight(dt) {
    const g = this.game;
    if (!this.flashlight) return;
    this.flashlight.update(dt, g.engine.camera, g.engine.detail);
    const k = VM_DARK + (VM_LIT - VM_DARK) * this.flashlight.level;
    for (const v of this.vmLights) v.light.intensity = v.base * k;
  }

  weaponHudSuffix() {
    return this.run?.upgraded.has(this.game.weapon.stats.id) ? ' · FORJADA' : '';
  }

  updateForgeGlow(dt) {
    const g = this.game;
    const vm = g.viewmodel;
    const id = g.weapon.stats.id;
    const want = !!this.run?.upgraded.has(id) && vm.loaded?.has(id) && vm.weaponId === id;
    FORGE_GLOW.uniforms.uTime.value += dt;
    if (this.forgeGlow && (!want || this.forgeGlow.userData.id !== id || this.forgeGlow.parent !== vm.model)) {
      this.forgeGlow.removeFromParent();
      this.forgeGlow = null;
    }
    if (!want || this.forgeGlow) return;
    const glowObj = vm.loaded.get(id).object.clone(true);
    glowObj.traverse((o) => {
      if (o.isMesh) {
        o.material = FORGE_GLOW;
        o.renderOrder = 3;
      }
    });
    glowObj.userData.id = id;
    vm.model.add(glowObj);
    this.forgeGlow = glowObj;
  }

  promptFor(it) {
    const o = this.run.offer(it);
    const key = this.game.touchMode ? 'Toca «Usar»' : keyLabel(this.game.settings.keys, 'interact');
    if (o.done) return { key: null, text: o.label, price: null, ok: false };
    const ok = this.run.cash >= o.price;
    if (it.kind === 'door') {
      const how = this.game.touchMode ? 'Toca «Usar»' : `Presiona [${key}]`;
      const price = `($${o.price})`;
      const text = ok ? `${how} para abrir ${o.name} ${price}` : `Dinero insuficiente · ${o.name} ${price}`;
      return { key: null, text, price: null, ok, poor: !ok };
    }
    return { key, text: o.label, price: o.price, ok };
  }

  beeps() {
    const n = Math.ceil(this.timer);
    if (n <= 3 && n > 0 && n !== this.lastBeep) {
      this.lastBeep = n;
      this.game.sfx.beep(false);
    }
  }

  die() {
    const g = this.game;
    this.closeKeypad();
    this.state = 'dying';
    this.timer = DEATH_TIME;
    g.player.movementEnabled = false;
    g.weapon.enabled = false;
    this.hud.setVisible(false);
    g.sfx.tone('sawtooth', 200, 50, 1.1, 0.2);
    this.music?.stop(DEATH_TIME);
  }

  finish() {
    const g = this.game;
    this.state = 'over';
    const result = this.run.results();
    const record = g.store.modeRecord(this.recordId);
    const isBest = updateRecord(record, {
      date: new Date().toISOString(),
      difficulty: result.difficulty,
      wave: result.wave,
      score: result.score,
      kills: result.kills,
      accuracy: result.accuracy,
      time: Math.round(result.time),
    });
    g.store.persist();
    g.player.movementEnabled = true;
    g.input.unlock();
    g.hud.setVisible(false);
    g.ui.show(zombieResultsScreen({ result, record: this.record, isBest, variant: this.variant, onRetry: () => g.input.lock(), onMenu: () => g.quitToMenu() }));
  }

  shopState() {
    const r = this.run;
    return { cash: r.cash, owned: r.owned, perks: r.perks, bag: this.grenadeBag, health: r.health, maxHealth: r.maxHealth, reserveFull: r.reserveFull(), defense: !!this.bar, bottlesMissing: this.bar?.missing ?? 0 };
  }

  openShop() {
    if (this.state !== 'intermission' || this.shopOpen) return;
    const g = this.game;
    this.shopOpen = true;
    g.input.unlock();
    g.hud.setVisible(false);
    this.renderShop();
  }

  renderShop() {
    const g = this.game;
    g.ui.show(zombieShopScreen({ state: this.shopState(), onBuy: (item) => this.buy(item), onClose: () => g.input.lock() }));
  }

  buy(item) {
    const g = this.game;
    const r = this.run;
    if (cannotBuy(item, { ...this.shopState(), points: r.cash })) return;
    r.cash -= item.price;
    switch (item.kind) {
      case 'ammo':
        r.refillReserves();
        break;
      case 'grenade':
        this.grenadeBag[item.id] = Math.min(GRENADE_MAX[item.id], this.grenadeBag[item.id] + item.amount);
        g.grenades.type = item.id;
        break;
      case 'heal':
        r.health = r.maxHealth;
        break;
      case 'restock':
        this.bar?.restock(DEFENSE.restock);
        break;
    }
    g.hud.setHealth(r.health / r.maxHealth);
    g.onWeaponChange();
    g.sfx.purchase();
    this.renderShop();
  }

  onRunEvent(type, data) {
    const { hud, sfx } = this.game;
    switch (type) {
      case 'waveStart':
        sfx.horn();
        break;
      case 'waveClear':
        sfx.complete();
        hud.flash(`Ronda superada · +${data.bonus}`, 'good');
        break;
      case 'cash':
        this.hud?.popGain(data.amount);
        break;
      case 'powerup':
        sfx.powerup();
        hud.flash(POWERUPS[data.id].name, 'good');
        if (data.id === 'nuke') this.game.grenades.shake = 1;
        break;
      case 'powerupEnd':
        hud.flash(`${POWERUPS[data.id].name}: terminó`, 'info');
        break;
      case 'groan': {
        const z = data.zombie;
        if (z.heavy && z.t < 2) sfx.zombieVoice('roar', this.game.panFor(z.position), data.dist);
        else sfx.groan(this.game.panFor(z.position), data.dist, z.type);
        break;
      }
      case 'hurt':
        sfx.zombieVoice('snarl', this.game.panFor(data.zombie.position), 1);
        break;
      case 'kill': {
        const z = data.zombie;
        if (Math.random() < 0.7) sfx.zombieVoice(z.heavy ? 'brute' : 'death', this.game.panFor(z.position), z.position.distanceTo(this.game.player.position));
        break;
      }
      case 'tear': {
        const at = data.barricade.mouth;
        sfx.propHit('wood', this.game.panFor(at), 1);
        sfx.noiseBurst({ type: 'bandpass', f0: 2600, f1: 900, q: 1.5, peak: 0.12, decay: 0.12, pan: this.game.panFor(at) });
        break;
      }
      case 'multi':
        hud.flash(`¡${data.kills} de una sola granada!`, 'good');
        break;
      case 'death':
        hud.flash('Te alcanzaron', 'bad');
        break;
      case 'door':
        hud.flash(`${DOORS[data.id].name} abierto: también entran zombis por ahí`, 'good');
        sfx.explosion(18, this.game.panFor(this.game.world.doors[data.id].home));
        break;
      case 'perk':
        hud.flash(`${PERKS[data.id].name}: ${PERKS[data.id].desc}`, 'good');
        sfx.powerup();
        break;
      case 'weapon':
        hud.flash(`${WEAPONS[data.id].name} comprada${data.dropped ? ` · dejaste ${WEAPONS[data.dropped].name}` : ''}`, 'good');
        break;
      case 'box':
        hud.flash(`Caja fuerte: ¡${WEAPONS[data.id].name}!${data.dropped ? ` · dejaste ${WEAPONS[data.dropped].name}` : ''}`, 'good');
        sfx.powerup();
        break;
      case 'bossSpawn':
        hud.flash('¡Llegó El Jefe! Lleva el código de la caja fuerte', 'bad');
        sfx.zombieVoice('roar', this.game.panFor(data.zombie.position), 6);
        break;
      case 'boss': {
        const z = data.zombie;
        const pan = this.game.panFor(z.position);
        const dist = z.position.distanceTo(this.game.player.position);
        const g = this.game;
        if (data.kind === 'chargeWind') {
          sfx.zombieVoice('roar', pan, Math.min(dist, 4));
          hud.flash('¡El Jefe va a embestir! Sal de su camino', 'bad');
        } else if (data.kind === 'slamWind') sfx.zombieVoice('brute', pan, dist);
        else if (data.kind === 'slam') {
          sfx.explosion(Math.max(4, dist), pan);
          g.grenades.shake = Math.max(g.grenades.shake ?? 0, Math.max(0.15, 0.7 - dist * 0.05));
        } else if (data.kind === 'chargeHit') g.grenades.shake = Math.max(g.grenades.shake ?? 0, 0.6);
        else if (data.kind === 'crash') {
          sfx.explosion(Math.max(18, dist), pan);
          g.grenades.shake = Math.max(g.grenades.shake ?? 0, Math.max(0.1, 0.4 - dist * 0.03));
          hud.flash('El Jefe quedó aturdido: ¡a la cabeza!', 'good');
        } else if (data.kind === 'summon') {
          sfx.zombieVoice('roar', pan, Math.min(dist, 5));
          if (data.spawned) hud.flash('El Jefe llamó a la horda', 'bad');
        } else if (data.kind === 'enrage') {
          sfx.zombieVoice('roar', pan, Math.min(dist, 3));
          hud.flash('El Jefe está furioso', 'bad');
        }
        break;
      }
      case 'bossKill':
        hud.flash(`El Jefe cayó · código de la caja fuerte: ${data.code}`, 'good');
        sfx.complete();
        this.game.grenades.shake = 0.5;
        break;
      case 'safeOpen':
        this.closeKeypad();
        hud.flash('¡Caja fuerte abierta! Ahora te da un arma al azar', 'good');
        sfx.tone('square', 600, 1800, 0.25, 0.08);
        sfx.powerup();
        break;
      case 'safeWrong':
        sfx.tone('sawtooth', 180, 90, 0.4, 0.12);
        break;
      case 'ammo':
        hud.flash(`Munición de ${WEAPONS[data.id].name}`, 'good');
        break;
      case 'barAttacked':
        hud.flash('¡Están atacando la barra!', 'bad');
        break;
      case 'bottleShot':
        hud.flash(`¡Cuidado con las botellas! Quedan ${data.left}`, 'bad');
        break;
      case 'barDestroyed':
        hud.flash('Se rompió la última botella', 'bad');
        break;
      case 'power':
        hud.flash('¡Hay luz! Las máquinas de bebidas y la Forja funcionan', 'good');
        sfx.tone('sawtooth', 45, 130, 1.6, 0.22);
        sfx.tone('sine', 90, 260, 1.3, 0.18);
        this.game.grenades.shake = 0.35;
        break;
      case 'forge':
        hud.flash(`${WEAPONS[data.id].name} forjada: doble daño y cargador más grande`, 'good');
        sfx.powerup();
        this.game.onWeaponChange();
        break;
      case 'boxMove':
        hud.flash(`La caja fuerte se fue a ${data.where}`, 'info');
        break;
      case 'lastStand':
        hud.flash('Último Aliento: ¡te levantaste!', 'good');
        sfx.powerup();
        break;
    }
  }

  dispose() {
    const g = this.game;
    this.closeKeypad();
    this.music?.stop(1);
    this.music = null;
    g.sfx.setSpace(1);
    this.run?.dispose();
    this.run = null;
    this.hud?.dispose();
    this.hud = null;
    this.ash?.dispose();
    this.ash = null;
    this.blood?.dispose();
    this.blood = null;
    setGrade(null);
    this.flashlight?.dispose();
    this.flashlight = null;
    for (const v of this.vmLights ?? []) v.light.intensity = v.base;
    this.vmLights = null;
    g.world.setDread?.(false);
    setZombieRim(1);
    g.world.camera = null;
    this.bar?.dispose();
    this.bar = null;
    this.root.removeFromParent();
    g.weapon.onShot = null;
    g.weapon.reserveBy = null;
    g.weapon.magazineBy = null;
    this.forgeGlow?.removeFromParent();
    this.forgeGlow = null;
    g.weapon.reloadMul = 1;
    g.weapon.rateMul = 1;
    g.player.perkSpeed = 1;
    g.player.movementEnabled = true;
    g.world.resetDoors?.();
    g.world.resetBarricades?.();
    g.effects.clear();
    g.grenades.clear();
    g.hud.setHealth(null);
    this.shopOpen = false;
  }
}
