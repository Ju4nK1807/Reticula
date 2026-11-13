import * as THREE from 'three';
import { HorrorMusic } from '../../audio/HorrorMusic.js';
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

export const MODE_ID = 'zombies';
export const DEFENSE_ID = 'zombie-defense';
export const WORLD_ID = 'ruins';

const DEATH_TIME = 2.2; // s de cámara lenta antes del resumen
const DEATH_SLOWMO = 0.3;
const WAVE_BANNER = 2.2;
const COMBAT = new Set(['countdown', 'wave', 'intermission']);
// Zombis que se dejan creados en la reserva entre oleadas (uno por cuadro, sin que se note): crear uno
// en plena oleada (clonar el esqueleto y armar sus animaciones) era lo que producía tirones. Todos los
// tipos usan el mismo modelo, así que una sola reserva cubre una oleada llena (hasta 24 vivos) y los
// que mueren mientras salen otros.
// Material del brillo de las armas forjadas (aditivo, animado, sin profundidad: va encima del arma).
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
const PREFILL = 30;
const WARM = 26; // los que se crean mientras se lee la pantalla de inicio
// Color de la noche de terror (calidad alta): desaturado y frío, negros profundos, viñeta fuerte y grano.
const GRADE = { saturation: 0.74, contrast: 1.16, vignette: 0.95, grain: 0.045, lift: [0, 0.003, 0.008], gain: [0.98, 0.99, 1.0] };
// Cámara más cerrada que en los demás modos (aumento sobre el campo de visión elegido): se ve menos
// alrededor y los zombis se ven más grandes y cerca.
const VIEW_ZOOM = 1.3;
// Luz del arma en primera persona (se dibuja aparte): a oscuras casi no se ve; con la linterna, algo más.
const VM_DARK = 0.2;
const VM_LIT = 0.55;

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
    // Sangre: neblina en los impactos y manchas en el suelo.
    this.blood = new BloodFx();
    this.blood.attach(g.world.scene);
    this.blood.floorAt = g.world.floorAt?.bind(g.world);
    // Noche: reflejos de cielo oscuro y fuego, niebla baja también en la ceniza y la sangre, luces que
    // se reparten según lo que mira el jugador y el color de la noche (calidad alta: postproceso).
    g.world.scene.environment = nightEnvironment(g.engine.renderer);
    g.world.camera = g.engine.camera;
    addHeightFog(this.ash.points.material);
    addHeightFog(this.blood.decals.material);
    setGrade(GRADE);
    // Terror: el barrio casi a oscuras y con más niebla; la linterna es la luz del jugador (se crea
    // antes de precalentar: los sombreadores ya cuentan con ella).
    g.world.setDread?.(true);
    setZombieRim(0.35); // sin luna, la silueta casi no se recorta: se ven por los ojos
    this.flashlight = new Flashlight(g.world.scene);
    this.flashlight.onEmpty = () => {
      g.sfx.tone('square', 1200, 400, 0.05, 0.05);
      g.hud.flash('La linterna se quedó sin batería: se recarga apagada', 'bad');
    };
    this.flashlight.setShadows(g.engine.detail === 'alta');
    // Sonido: música de terror y más eco (barrio abierto entre fachadas).
    this.music = new HorrorMusic(g.sfx, { paused: () => g.paused || this.shopOpen });
    g.sfx.setSpace(1.35);
    this.vmLights = g.viewmodel.scene.children.filter((o) => o.isLight).map((light) => ({ light, base: light.intensity }));
    // Defensa: la fuente se vuelve una barra llena de botellas.
    if (this.variant === 'defense') this.bar = new Bar(g, this.root);
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
    const breathe = () => new Promise((r) => setTimeout(r, 30));
    const template = await loadZombieModel();
    if (!template || g.mode !== this) return;
    const type = ZOMBIE_TYPES.walker;
    // Uno se dibuja diminuto delante de la cámara: compila sus sombreadores (también el de su sombra).
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

  // Dibuja de verdad TODO el mapa una vez (también lo que queda fuera de cámara): en Windows, ANGLE
  // termina de compilar cada sombreador en su primer dibujo real, y lo que el precalentamiento normal no
  // veía (secciones lejanas, fuego, conos de luz, la Forja) congelaba el primer cuadro de la partida.
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

  // Llena la reserva de zombis de a uno por cuadro (entre oleadas, cuando no hay nadie en pantalla).
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

  // --- Interfaz de modo -------------------------------------------------------------------------------
  // Aumento de la cámara principal (Game lo multiplica por el de las miras).
  get viewZoom() {
    return VIEW_ZOOM;
  }

  // Prende o apaga la linterna (tecla F o botón táctil).
  toggleFlashlight() {
    if (!this.flashlight || !COMBAT.has(this.state) || this.shopOpen) return;
    if (this.flashlight.toggle()) this.game.sfx.tone('square', 2300, 1500, 0.025, 0.05); // clic del interruptor
    else {
      // Sin batería: el clic suena hueco y no prende.
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

  // Espacios de armas (Game: teclas 1-3, rueda y HUD con solo las que se tienen).
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

  // Botón Atrás de Android con la armería abierta: vuelve al combate (no abandona la partida).
  onBack() {
    if (!this.shopOpen) return false;
    this.game.input.lock();
    return true;
  }

  // Acciones propias del modo (las llama Game.onKey): usar / comprar.
  onKey(e, action) {
    if (action === 'flashlight' && !e.repeat) this.toggleFlashlight();
    if (action !== 'interact' || e.repeat) return;
    if (this.nearBarricade) return; // reparar se hace manteniendo la tecla (en update)
    if (this.near) this.buyNear();
    else this.openShop();
  }

  // Barricada dañada al alcance, del lado de dentro (desde donde se repara), o null.
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

  // Mantener la tecla de usar junto a una barricada dañada: un tablón cada BARRICADE.repairEvery s.
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

  // Lo comprable del mapa más cercano al alcance (puerta, arma de pared o bebida), o null.
  findNear() {
    const run = this.run;
    const items = this.game.world.interactables ?? [];
    const p = this.game.player.position;
    let best = null;
    let bestD = Infinity;
    for (const it of items) {
      const d = Math.hypot(it.pos.x - p.x, it.pos.z - p.z);
      // En otro piso no se alcanza (lo que está arriba de una tarima se usa desde arriba).
      if (d > it.radius || d >= bestD || Math.abs((it.pos.y ?? 0) - p.y) > 1.5 || !run.offer(it)) continue;
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
    g.world.resetBarricades?.();
    // Sin electricidad al empezar (hay que encender el generador de la Subestación). En la Defensa de la
    // barra el barrio ya tiene luz. La caja vuelve a la plaza.
    g.world.setPower?.(this.variant === 'defense');
    g.world.moveBox?.(0);
    if (this.bar) {
      // Defensa: la barra está en la plaza, así que su puerta empieza abierta.
      g.world.openDoor?.('plaza');
      this.bar.restock(this.bar.total); // barra llena en cada partida
      this.bar.acc = 0;
    }
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
    this.waveBannerT = WAVE_BANNER;
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
    this.updateMusic();
    // Lo que hay delante: barricada para reparar o algo comprable (puerta, arma, bebida, caja).
    const active = COMBAT.has(this.state) && !this.shopOpen && !run.died;
    this.nearBarricade = active ? this.findBarricade() : null;
    this.near = active && !this.nearBarricade ? this.findNear() : null;
    this.updateRepair(dt);
    if (this.nearBarricade) {
      const key = g.touchMode ? 'Mantén «Usar»' : `Mantén ${keyLabel(g.settings.keys, 'interact')}`;
      const b = this.nearBarricade;
      const capped = run.repairPoints >= BARRICADE.repairCapPerWave;
      this.hud.setPrompt({ key, text: `Reparar barricada (${b.boards}/${b.max})${capped ? '' : ` · +${BARRICADE.repairPoints} por tablón`}`, price: null, ok: true });
    } else this.hud.setPrompt(this.near ? this.promptFor(this.near) : null);
    g.hud.setStats(run.hudStats());
    this.hud.update(g, run, this);
    this.updateForgeGlow(dt);
  }

  // Música: calma entre rondas; durante la ronda, más tensa cuantos más zombis hay cerca.
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

  // La linterna sigue la mirada; el arma en primera persona se ilumina según esté prendida.
  updateFlashlight(dt) {
    const g = this.game;
    if (!this.flashlight) return;
    this.flashlight.update(dt, g.engine.camera, g.engine.detail);
    const k = VM_DARK + (VM_LIT - VM_DARK) * this.flashlight.level;
    for (const v of this.vmLights) v.light.intensity = v.base * k;
  }

  // Sufijo del nombre del arma en el HUD: las forjadas lo dicen.
  weaponHudSuffix() {
    return this.run?.upgraded.has(this.game.weapon.stats.id) ? ' · FORJADA' : '';
  }

  // Brillo de la Forja sobre el arma en primera persona: una copia del modelo con un material aditivo
  // animado (vetas violeta y cian). Se vuelve a poner si el arma cambia de modelo.
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
    // Puertas: «Presiona [E] para abrir ($750)»; si no alcanza, «Dinero insuficiente».
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

  // --- Armería ------------------------------------------------------------------------------------
  shopState() {
    const r = this.run;
    return { cash: r.cash, owned: r.owned, perks: r.perks, bag: this.grenadeBag, health: r.health, maxHealth: r.maxHealth, reserveFull: r.reserveFull(), defense: !!this.bar, bottlesMissing: this.bar?.missing ?? 0 };
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
      case 'restock':
        this.bar?.restock(DEFENSE.restock);
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
        if (z.type === 'brute' && z.t < 2) sfx.zombieVoice('roar', this.game.panFor(z.position), data.dist);
        else sfx.groan(this.game.panFor(z.position), data.dist, z.type);
        break;
      }
      case 'hurt': // el que te alcanzó gruñe al morder
        sfx.zombieVoice('snarl', this.game.panFor(data.zombie.position), 1);
        break;
      case 'kill': {
        const z = data.zombie;
        if (Math.random() < 0.7) sfx.zombieVoice(z.type === 'brute' ? 'brute' : 'death', this.game.panFor(z.position), z.position.distanceTo(this.game.player.position));
        break;
      }
      case 'tear': { // arrancan un tablón de la barricada
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
        hud.flash(`Caja misteriosa: ¡${WEAPONS[data.id].name}!${data.dropped ? ` · dejaste ${WEAPONS[data.dropped].name}` : ''}`, 'good');
        sfx.powerup();
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
        sfx.tone('sawtooth', 45, 130, 1.6, 0.22); // el generador arranca
        sfx.tone('sine', 90, 260, 1.3, 0.18);
        this.game.grenades.shake = 0.35;
        break;
      case 'forge':
        hud.flash(`${WEAPONS[data.id].name} forjada: doble daño y cargador más grande`, 'good');
        sfx.powerup();
        this.game.onWeaponChange();
        break;
      case 'boxMove':
        hud.flash(`La caja misteriosa se fue a ${data.where}`, 'info');
        break;
      case 'lastStand':
        hud.flash('Último Aliento: ¡te levantaste!', 'good');
        sfx.powerup();
        break;
    }
  }

  dispose() {
    const g = this.game;
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
