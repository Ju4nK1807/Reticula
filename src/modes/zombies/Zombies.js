import * as THREE from 'three';
import './zombies.css';
import { Mode } from '../Mode.js';
import { Ambience } from '../../effects/Ambience.js';
import { ZombieRun } from './ZombieRun.js';
import { ZombieHud } from './ZombieHud.js';
import { zombieIntroScreen, zombieResultsScreen, zombieShopScreen } from './zombieScreens.js';
import { DOORS, FIRST_COUNTDOWN, GRENADE_MAX, INTERMISSION, PERKS, PLAYER, POWERUPS, RESERVE, ZOMBIE_TYPES, cannotBuy, emptyRecord, updateRecord } from './zombieData.js';
import { WEAPONS } from '../../combat/weapons.js';
import { keyLabel } from '../../config/keybinds.js';
import { acquireZombieSkin, loadZombieModel, releaseZombieSkin } from './zombieSkin.js';

export const MODE_ID = 'zombies';
export const WORLD_ID = 'ruins';

const DEATH_TIME = 2.2; // s de cámara lenta antes del resumen
const DEATH_SLOWMO = 0.3;
const WAVE_BANNER = 2.2;
const COMBAT = new Set(['countdown', 'wave', 'intermission']);

/*
  Modo zombi. Estados:
    intro → (captura del mouse) → countdown → wave → intermission → wave → … → dying → over
  - intermission: descanso con la armería (tecla E o botón táctil); mientras está abierta el tiempo se
    detiene y el mouse queda libre.
  La lógica de juego vive en ZombieRun; aquí están el flujo, las compras, la presentación y el sonido.
*/
export class Zombies extends Mode {
  constructor(game) {
    super(game);
    this.root = new THREE.Group();
    this.state = 'intro';
    this.run = null;
    this.hud = null;
    this.timer = 0;
    this.nextWave = 1;
    this.lastBeep = null;
    this.waveBannerT = 0;
    this.shopOpen = false;
    // Granadas por tipo (las lee combat/Grenades.js).
    this.grenadeBag = { frag: 0, fire: 0, stun: 0, decoy: 0 };
    this.near = null; // lo comprable del mapa que tiene delante el jugador
    this.ash = null;
  }

  // Total de granadas (botón táctil y HUD).
  get grenades() {
    return Object.values(this.grenadeBag).reduce((s, n) => s + n, 0);
  }

  get record() {
    return { ...emptyRecord(), ...this.game.store.modeRecord(MODE_ID) };
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
    this.showIntro();
    this.warmZombies();
  }

  // Mientras se lee la pantalla de inicio: carga los modelos, compila sus sombreadores (dibujo real,
  // diminuto, detrás del menú) y deja zombis creados en reserva. El primero ya no traba la partida.
  // La reserva cubre una oleada llena (hasta 24 vivos): crear un zombi en plena partida (clonar su
  // esqueleto) costaba varios ms y se notaba como tirones cuando aparecían muchos a la vez. Se crean
  // de a pocos, cediendo el hilo entre tandas, para no trabar la pantalla de inicio.
  async warmZombies() {
    const g = this.game;
    const kinds = [
      ['walker', ZOMBIE_TYPES.walker, 18],
      ['runner', ZOMBIE_TYPES.runner, 10],
      ['walker', ZOMBIE_TYPES.brute, 2],
    ];
    const breathe = () => new Promise((r) => setTimeout(r, 30));
    for (const [model, type, n] of kinds) {
      const template = await loadZombieModel(model);
      if (!template || g.mode !== this) return;
      const opts = { height: type.height, tint: type.tint ?? null };
      // Uno se dibuja diminuto delante de la cámara: compila sus sombreadores.
      const first = acquireZombieSkin(template, opts);
      const cam = g.engine.camera;
      first.root.position.set(0, 0, -3).applyQuaternion(cam.quaternion).add(cam.position);
      first.root.scale.setScalar(0.002);
      first.update(1 / 60, { anim: 'walk', speed: 1 });
      g.engine.warmup(g.world.scene, cam, [first.root]);
      const made = [first];
      for (let i = 1; i < n; i++) {
        if (i % 3 === 0) {
          await breathe();
          if (g.mode !== this) break;
        }
        made.push(acquireZombieSkin(template, opts));
      }
      for (const s of made) releaseZombieSkin(s);
    }
  }

  showIntro() {
    const g = this.game;
    this.state = 'intro';
    g.hud.setVisible(false);
    g.ui.show(
      zombieIntroScreen(g, {
        record: this.record,
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

  // Botón Atrás de Android con la armería abierta: vuelve al combate (no abandona la partida).
  onBack() {
    if (!this.shopOpen) return false;
    this.game.input.lock();
    return true;
  }

  // Acciones propias del modo (las llama Game.onKey): usar / comprar.
  onKey(e, action) {
    if (action !== 'interact' || e.repeat) return;
    if (this.near) this.buyNear();
    else this.openShop();
  }

  // Lo comprable del mapa más cercano al alcance (puerta, arma de pared o bebida), o null.
  findNear() {
    const run = this.run;
    const items = this.game.world.interactables ?? [];
    const p = this.game.player.position;
    let best = null;
    let bestD = Infinity;
    for (const it of items) {
      const d = Math.hypot(it.pos.x - p.x, it.pos.z - p.z);
      if (d > it.radius || d >= bestD || !run.offer(it)) continue;
      best = it;
      bestD = d;
    }
    return best;
  }

  buyNear() {
    const g = this.game;
    const why = this.run.buy(this.near);
    if (why) {
      g.hud.flash(why, 'bad');
      g.sfx.dryFire();
      return;
    }
    g.sfx.purchase();
    g.onWeaponChange();
  }

  // --- Partida ------------------------------------------------------------------------------------
  beginRun() {
    const g = this.game;
    this.run?.dispose();
    g.world.resetDoors?.(); // todas las secciones cerradas otra vez (antes de crear la navegación)
    this.run = new ZombieRun(this);
    this.run.listener = (type, data) => this.onRunEvent(type, data);
    g.world.props?.reset(); // la utilería vuelve a su lugar
    g.player.reset(g.world.spawn);
    g.player.movementEnabled = true;
    // Equipo inicial: pistola (munición infinita); el resto se compra en las paredes, con su reserva.
    g.weapon.reserveBy = Object.fromEntries(Object.entries(RESERVE).map(([id, n]) => [id, n === null ? null : 0]));
    this.run.applyPerks(); // sin bebidas: valores base (vida, daño, recarga, velocidad)
    g.weapon.setWeapon('pistol', { force: true });
    g.weapon.refill();
    g.onWeaponChange();
    g.effects.clear();
    g.grenades.clear();
    g.grenades.type = 'frag';
    this.grenadeBag = { frag: PLAYER.startGrenades, fire: 0, stun: 0, decoy: 0 };
    this.near = null;
    g.hud.setVisible(true);
    g.hud.setHealth(1);
    g.hud.setLabel('Modo zombi · Barrio en ruinas');
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
    // Lo comprable que hay delante (puerta, arma de pared o bebida) y su aviso.
    this.near = COMBAT.has(this.state) && !this.shopOpen && !run.died ? this.findNear() : null;
    this.hud.setPrompt(this.near ? this.promptFor(this.near) : null);
    g.hud.setStats(run.hudStats());
    this.hud.update(g, run, this);
  }

  promptFor(it) {
    const o = this.run.offer(it);
    const key = this.game.touchMode ? 'Toca «Usar»' : keyLabel(this.game.settings.keys, 'interact');
    if (o.done) return { key: null, text: o.label, price: null, ok: false };
    return { key, text: o.label, price: o.price, ok: this.run.cash >= o.price };
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
    const record = g.store.modeRecord(MODE_ID);
    const isBest = updateRecord(record, {
      date: new Date().toISOString(),
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
    g.ui.show(zombieResultsScreen({ result, record: this.record, isBest, onRetry: () => g.input.lock(), onMenu: () => g.quitToMenu() }));
  }

  // --- Armería ------------------------------------------------------------------------------------
  shopState() {
    const r = this.run;
    return { cash: r.cash, owned: r.owned, perks: r.perks, bag: this.grenadeBag, health: r.health, maxHealth: r.maxHealth, reserveFull: r.reserveFull() };
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
      case 'ammo':
        r.refillReserves();
        break;
      case 'grenade':
        this.grenadeBag[item.id] = Math.min(GRENADE_MAX[item.id], this.grenadeBag[item.id] + item.amount);
        g.grenades.type = item.id; // la recién comprada queda elegida
        break;
      case 'heal':
        r.health = r.maxHealth;
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
      case 'door':
        hud.flash(`${DOORS[data.id].name} abierto: también entran zombis por ahí`, 'good');
        sfx.explosion(18, this.game.panFor(this.game.world.doors[data.id].home));
        break;
      case 'perk':
        hud.flash(`${PERKS[data.id].name}: ${PERKS[data.id].desc}`, 'good');
        sfx.powerup();
        break;
      case 'weapon':
        hud.flash(`${WEAPONS[data.id].name} comprada`, 'good');
        break;
      case 'ammo':
        hud.flash(`Munición de ${WEAPONS[data.id].name}`, 'good');
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
    this.root.removeFromParent();
    g.weapon.onShot = null;
    g.weapon.reserveBy = null;
    g.weapon.reloadMul = 1;
    g.weapon.rateMul = 1;
    g.player.perkSpeed = 1;
    g.player.movementEnabled = true;
    g.world.resetDoors?.();
    g.effects.clear();
    g.grenades.clear();
    g.hud.setHealth(null);
    this.shopOpen = false;
  }
}
