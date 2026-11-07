import * as THREE from 'three';
import './zombies.css';
import { Mode } from '../Mode.js';
import { Ambience } from '../../effects/Ambience.js';
import { ZombieRun } from './ZombieRun.js';
import { ZombieHud } from './ZombieHud.js';
import { zombieIntroScreen, zombieResultsScreen, zombieShopScreen } from './zombieScreens.js';
import { DEFENSE, DIFFICULTIES, FIRST_COUNTDOWN, INTERMISSION, PLAYER, POWERUPS, RESERVE, ZOMBIE_TYPES, cannotBuy, emptyRecord, updateRecord } from './zombieData.js';
import { Bar } from './Bar.js';
import { acquireZombieSkin, loadZombieModel, pooledZombieSkins, prefillZombieSkin, releaseZombieSkin } from './zombieSkin.js';

export const MODE_ID = 'zombies';
export const DEFENSE_ID = 'zombie-defense';
export const WORLD_ID = 'ruins';

const DEATH_TIME = 2.2; // s de cámara lenta antes del resumen
const DEATH_SLOWMO = 0.3;
const WAVE_BANNER = 2.2;
const COMBAT = new Set(['countdown', 'wave', 'intermission']);
// Zombis que se dejan creados en la reserva entre oleadas (uno por cuadro, sin que se note): crear uno
// en plena oleada (clonar el esqueleto y armar sus animaciones) era lo que producía tirones.
const PREFILL = [
  ['walker', null, 22],
  ['runner', null, 12],
  ['walker', ZOMBIE_TYPES.brute.tint, 3],
];

/*
  Modo zombi. Estados:
    intro → (captura del mouse) → countdown → wave → intermission → wave → … → dying → over
  - intermission: descanso con la armería (tecla E o botón táctil); mientras está abierta el tiempo se
    detiene y el mouse queda libre.
  La lógica de juego vive en ZombieRun; aquí están el flujo, las compras, la presentación y el sonido.
*/
export class Zombies extends Mode {
  /** @param {{ variant?: 'survival' | 'defense' }} [opts] */
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
    this.waveBannerT = 0;
    this.shopOpen = false;
    this.grenades = 0; // lo lee el sistema de granadas (combat/Grenades.js)
    this.ash = null;
  }

  get record() {
    return { ...emptyRecord(), ...this.game.store.modeRecord(this.recordId) };
  }

  // Dificultad elegida (se recuerda por modo).
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
    // Ceniza y brasas flotando en la plaza.
    this.ash = new Ambience({ spark: '#ff8a3d', dust: '#8a8f96', count: 200 });
    this.ash.attach(g.world.scene, g.world.spawn);
    // Defensa: la fuente se vuelve una barra llena de botellas.
    if (this.variant === 'defense') this.bar = new Bar(g, this.root);
    this.showIntro();
    this.warmZombies();
  }

  // Mientras se lee la pantalla de inicio: carga los modelos, compila sus sombreadores (dibujo real,
  // diminuto, detrás del menú) y deja zombis creados en reserva. El primero ya no traba la partida.
  async warmZombies() {
    const g = this.game;
    const kinds = [
      ['walker', ZOMBIE_TYPES.walker, 6],
      ['runner', ZOMBIE_TYPES.runner, 4],
      ['walker', ZOMBIE_TYPES.brute, 1],
    ];
    for (const [model, type, n] of kinds) {
      const template = await loadZombieModel(model);
      if (!template || g.mode !== this) return;
      const skins = Array.from({ length: n }, () => acquireZombieSkin(template, { height: type.height, tint: type.tint ?? null }));
      const cam = g.engine.camera;
      for (const s of skins) {
        s.root.position.set(0, 0, -3).applyQuaternion(cam.quaternion).add(cam.position);
        s.root.scale.setScalar(0.002);
        s.update(1 / 60, { anim: 'walk', speed: 1 });
      }
      g.engine.warmup(g.world.scene, cam, skins.map((s) => s.root));
      for (const s of skins) releaseZombieSkin(s);
    }
  }

  // Llena la reserva de zombis de a uno por cuadro (entre oleadas, cuando no hay nadie en pantalla).
  prefillSkins() {
    if (this.prefilling) return;
    for (const [model, tint, target] of PREFILL) {
      if (pooledZombieSkins(model, tint) >= target) continue;
      this.prefilling = true;
      loadZombieModel(model).then((template) => {
        this.prefilling = false;
        if (!template || this.game.mode !== this) return;
        const type = tint ? ZOMBIE_TYPES.brute : model === 'runner' ? ZOMBIE_TYPES.runner : ZOMBIE_TYPES.walker;
        prefillZombieSkin(template, { height: type.height, tint });
      });
      return;
    }
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

  // --- Interfaz de modo -------------------------------------------------------------------------------
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

  meleeAllowed() {
    return COMBAT.has(this.state) && !this.shopOpen;
  }

  onMeleeHit(hit, damage) {
    this.run?.handleMelee(hit, damage);
  }

  grenadesAllowed() {
    return this.state === 'wave';
  }

  onExplosion(point, radius, los) {
    this.run?.onExplosion(point, radius, los);
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

  // Botón Atrás de Android con la armería abierta: vuelve al combate (no abandona la partida).
  onBack() {
    if (!this.shopOpen) return false;
    this.game.input.lock();
    return true;
  }

  // Teclas propias del modo (las llama Game.onKey).
  onKey(e) {
    if (e.code === 'KeyE' && !e.repeat) this.openShop();
  }

  // --- Partida ------------------------------------------------------------------------------------
  beginRun() {
    const g = this.game;
    this.run?.dispose();
    if (this.bar) {
      this.bar.restock(this.bar.total); // barra llena en cada partida
      this.bar.acc = 0;
    }
    this.run = new ZombieRun(this);
    this.run.listener = (type, data) => this.onRunEvent(type, data);
    g.world.props?.reset(); // la utilería vuelve a su lugar
    g.player.reset(g.world.spawn);
    g.player.movementEnabled = true;
    // Equipo inicial: pistola (munición infinita); el resto se compra, con su reserva.
    g.weapon.reserveBy = Object.fromEntries(Object.entries(RESERVE).map(([id, n]) => [id, n === null ? null : 0]));
    g.weapon.reloadMul = 1;
    g.weapon.setWeapon('pistol', { force: true });
    g.weapon.refill();
    g.onWeaponChange();
    g.effects.clear();
    g.grenades.clear();
    this.grenades = PLAYER.startGrenades;
    g.hud.setVisible(true);
    g.hud.setHealth(1);
    g.hud.setLabel(`${this.variant === 'defense' ? 'Defensa de la barra' : 'Modo zombi'} · ${DIFFICULTIES[this.difficulty].name}`);
    this.hud.setVisible(true);
    this.state = 'countdown';
    this.timer = FIRST_COUNTDOWN;
    this.nextWave = 1;
    this.lastBeep = null;
    this.shopOpen = false;
  }

  startWave() {
    this.state = 'wave';
    this.run.startWave(this.nextWave);
    this.waveBannerT = WAVE_BANNER;
  }

  update(dt) {
    const g = this.game;
    const run = this.run;
    this.ash?.update(dt, true);
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
        this.waveBannerT -= dt;
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
          this.die(); // la barra se quedó sin botellas (a balazos)
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
    g.hud.setStats(run.hudStats());
    this.hud.update(g, run, this);
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
    this.state = 'dying';
    this.timer = DEATH_TIME;
    g.player.movementEnabled = false;
    g.weapon.enabled = false;
    this.hud.setVisible(false);
    g.sfx.tone('sawtooth', 200, 50, 1.1, 0.2);
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

  // --- Armería ------------------------------------------------------------------------------------
  shopState() {
    const r = this.run;
    return { cash: r.cash, owned: r.owned, upgrades: r.upgrades, grenades: this.grenades, health: r.health, maxHealth: r.maxHealth, reserveFull: r.reserveFull(), defense: !!this.bar, bottlesMissing: this.bar?.missing ?? 0 };
  }

  openShop() {
    if (this.state !== 'intermission' || this.shopOpen) return;
    const g = this.game;
    this.shopOpen = true;
    g.input.unlock(); // con shopOpen, soltar el mouse no pausa
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
      case 'weapon':
        r.owned.add(item.id);
        g.weapon.reserveBy[item.id] = RESERVE[item.id];
        g.weapon.ammoBy[item.id] = g.weapon.ammoBy[item.id] ?? 0;
        g.weapon.setWeapon(item.id, { force: true });
        g.weapon.ammo = g.weapon.stats.magazine;
        break;
      case 'ammo':
        r.refillReserves();
        break;
      case 'grenades':
        this.grenades = Math.min(PLAYER.maxGrenades, this.grenades + 2);
        break;
      case 'heal':
        r.health = r.maxHealth;
        break;
      case 'restock':
        this.bar?.restock(DEFENSE.restock);
        break;
      case 'upgrade':
        r.upgrades.add(item.id);
        if (item.id === 'armor') {
          r.maxHealth = PLAYER.armoredHealth;
          r.health = Math.min(r.maxHealth, r.health + (PLAYER.armoredHealth - PLAYER.maxHealth));
        } else if (item.id === 'reload') g.weapon.reloadMul = 0.65;
        else if (item.id === 'damage') r.dmgMul = 1.25;
        break;
    }
    g.hud.setHealth(r.health / r.maxHealth);
    g.onWeaponChange();
    g.sfx.purchase();
    this.renderShop();
  }

  // --- Eventos de la partida → sonido y avisos --------------------------------------------------------------
  onRunEvent(type, data) {
    const { hud, sfx } = this.game;
    switch (type) {
      case 'waveStart':
        sfx.horn();
        break;
      case 'waveClear':
        sfx.complete();
        hud.flash(`Oleada superada · +${data.bonus}`, 'good');
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
      case 'groan':
        sfx.groan(this.game.panFor(data.zombie.position), data.dist, data.zombie.type);
        break;
      case 'multi':
        hud.flash(`¡${data.kills} de una sola granada!`, 'good');
        break;
      case 'death':
        hud.flash('Te alcanzaron', 'bad');
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
    }
  }

  dispose() {
    const g = this.game;
    this.run?.dispose();
    this.run = null;
    this.hud?.dispose();
    this.hud = null;
    this.ash?.dispose();
    this.ash = null;
    this.bar?.dispose();
    this.bar = null;
    this.root.removeFromParent();
    g.weapon.onShot = null;
    g.weapon.reserveBy = null;
    g.weapon.reloadMul = 1;
    g.player.movementEnabled = true;
    g.effects.clear();
    g.grenades.clear();
    g.hud.setHealth(null);
    this.shopOpen = false;
  }
}
