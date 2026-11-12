import * as THREE from 'three';
import { DEG } from '../utils/math.js';
import { ALL_WEAPONS, DEFAULT_WEAPON, WEAPONS, getWeapon } from './weapons.js';

// Compatibilidad: el rifle sigue siendo el arma de referencia.
export const RIFLE = WEAPONS.rifle;

const MAX_TRACERS_PER_SHOT = 5; // la escopeta no satura el pool de trazadoras
const DRY_FIRE_COOLDOWN = 0.25;
const PART_RANK = { head: 3, body: 2, legs: 1 };
const PROP_IMPULSE = 0.035; // N·s por punto de daño al cuerpo: una lata sale volando, una caja apenas se mueve

const _dir = new THREE.Vector3();
const _shot = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _end = new THREE.Vector3();
const _muzzle = new THREE.Vector3();
const _ray = new THREE.Vector3();
const _ndc = new THREE.Vector2();
const MUZZLE_DEPTH = 0.7; // m delante de la cámara donde nace la trazadora

// Desvía `out` (unitario) un ángulo aleatorio dentro de un cono de `deg` grados (distribución uniforme).
function jitter(out, deg, right, up) {
  if (deg <= 0) return out;
  const a = Math.random() * Math.PI * 2;
  const r = Math.tan(deg * Math.sqrt(Math.random()) * DEG);
  return out.addScaledVector(right, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r).normalize();
}

/*
  Arma del jugador: disparo hitscan desde el centro de la cámara con dispersión (movimiento, ráfaga,
  disparo sin apuntar), perdigones, cargador por arma, recarga, desenfunde y mira telescópica.

  El modo recibe cada disparo en onShot(hit, spread, time):
  - hit: resultado de Ballistics.cast o null. Con perdigones, el impacto del objetivo que recibió más
    perdigones (y su mejor zona) con hit.pelletHits = cuántos le dieron. Phase multiplica el daño.
  - time: instante del clic (ms, misma base que performance.now()).
  onChange() avisa al cambiar de arma o de modo de disparo (HUD, mira).
*/
export class Weapon {
  constructor(game) {
    this.game = game;
    this.stats = getWeapon(DEFAULT_WEAPON);
    this.enabled = false;
    this.scoped = false;
    this.cooldown = 0;
    this.bloom = 0;
    this.reloadLeft = 0;
    this.drawLeft = 0;
    this.aiming = false; // apuntando con las miras (lo decide Game.updateScope)
    // Munición de reserva por arma (balas fuera del cargador). null = infinita (todos los modos salvo
    // los que la administran, como el modo zombi). Un arma sin entrada también es infinita.
    this.reserveBy = null;
    this.reloadMul = 1; // multiplicador del tiempo de recarga (bebida "Mano rápida" del modo zombi)
    this.rateMul = 1; // multiplicador de la cadencia (bebida "Doble plomo" del modo zombi)
    this.magazineBy = null; // { [arma]: multiplicador del cargador } (armas forjadas del modo zombi)
    // Munición infinita: los modos de entrenamiento no cuentan balas ni obligan a recargar (una
    // recarga a destiempo dejaba escapar enemigos y restaba puntos). La decide Game cada cuadro.
    this.infinite = false;
    this.mode = 'semi'; // 'semi' | 'auto' | 'burst'
    this.burstLeft = 0; // balas que quedan de la ráfaga en curso
    this.ammoBy = Object.fromEntries(ALL_WEAPONS.map((id) => [id, WEAPONS[id].magazine]));
    this.onShot = null;
    this.onChange = null;
  }

  get id() {
    return this.stats.id;
  }

  get ammo() {
    return this.ammoBy[this.stats.id];
  }

  set ammo(v) {
    this.ammoBy[this.stats.id] = v;
  }

  get reloading() {
    return this.reloadLeft > 0;
  }

  get drawing() {
    return this.drawLeft > 0;
  }

  // Progreso de la recarga 0-1, o null si no está recargando.
  get reloadProgress() {
    return this.reloading ? 1 - this.reloadLeft / (this.stats.reloadTime * this.reloadMul) : null;
  }

  get canToggleMode() {
    return this.stats.fireModes.length > 1;
  }

  // true en automático (mantener el clic dispara). Asignarlo elige automático o semiautomático.
  get auto() {
    return this.mode === 'auto';
  }

  set auto(v) {
    this.mode = v ? 'auto' : this.stats?.fireModes.includes('semi') ? 'semi' : this.stats?.fireModes[0] ?? 'semi';
  }

  // Cambia de arma (conserva la munición de cada una). `force` re-equipa aunque sea la misma.
  setWeapon(id, { force = false } = {}) {
    const next = getWeapon(id);
    if (next === this.stats && !force) return false;
    this.cancelReload();
    this.stats = next;
    this.mode = next.fireModes[0];
    this.burstLeft = 0;
    this.bloom = 0;
    this.cooldown = 0;
    this.scoped = false;
    this.drawLeft = next.drawTime;
    this.game.viewmodel.setWeapon(next.id);
    this.game.viewmodel.startDraw(next.drawTime);
    this.game.sfx.draw?.();
    this.onChange?.();
    return true;
  }

  // Fija automático (true) o semiautomático (false) si el arma lo admite; un arma de un solo modo
  // conserva el suyo. Devuelve si quedó en automático.
  setMode(auto) {
    const modes = this.stats.fireModes;
    const want = auto ? 'auto' : 'semi';
    this.mode = modes.includes(want) ? want : modes[0];
    this.burstLeft = 0;
    this.bloom = 0;
    this.onChange?.();
    return this.auto;
  }

  // Pasa al siguiente modo del arma (tecla B). Devuelve si quedó en automático (null si no cambia).
  toggleMode() {
    if (!this.canToggleMode) return null;
    const modes = this.stats.fireModes;
    this.mode = modes[(modes.indexOf(this.mode) + 1) % modes.length];
    this.burstLeft = 0;
    this.bloom = 0;
    this.onChange?.();
    return this.auto;
  }

  // Texto corto del modo para el HUD.
  get modeLabel() {
    return { auto: 'AUTO', semi: 'SEMI', burst: 'RÁFAGA' }[this.mode] ?? 'SEMI';
  }

  // Todas las armas con el cargador lleno (al empezar una fase o partida).
  refill() {
    for (const id of ALL_WEAPONS) this.ammoBy[id] = this.magazineOf(id);
    this.reloadLeft = 0;
    this.cooldown = 0;
    this.drawLeft = 0;
    this.game.viewmodel.cancelReload();
  }

  cancelReload() {
    if (!this.reloading) return;
    this.reloadLeft = 0;
    this.game.viewmodel.cancelReload();
  }

  // Balas de reserva del arma actual (Infinity si no hay límite).
  get reserve() {
    const r = this.reserveBy?.[this.stats.id];
    return r === undefined || r === null ? Infinity : r;
  }

  set reserve(v) {
    if (this.reserveBy) this.reserveBy[this.stats.id] = v;
  }

  // Tamaño del cargador del arma (el de sus datos o agrandado por el modo).
  magazineOf(id) {
    return Math.round(WEAPONS[id].magazine * (this.magazineBy?.[id] ?? 1));
  }

  get magazine() {
    return this.magazineOf(this.stats.id);
  }

  reload() {
    if (this.infinite || this.reloading || this.drawing || this.ammo >= this.magazine) return;
    if (this.reserve <= 0) {
      this.game.hud.flash('Sin munición de reserva', 'bad');
      return;
    }
    this.reloadLeft = this.stats.reloadTime * this.reloadMul;
    this.scoped = false;
    this.game.sfx.reloadStart();
    this.game.viewmodel.startReload(this.stats.reloadTime * this.reloadMul);
  }

  // Clic: un disparo en semiautomático, o el inicio de una ráfaga; `time` = timeStamp del clic.
  trigger(time = performance.now()) {
    if (!this.enabled || this.auto) return;
    if (this.mode === 'burst') {
      if (this.burstLeft > 0 || this.cooldown > 0) return;
      this.burstLeft = this.stats.burst ?? 3;
      this.burstFire(time);
      return;
    }
    this.tryFire(time);
  }

  // Siguiente bala de la ráfaga; al terminarla, la pausa entre ráfagas.
  burstFire(time = performance.now()) {
    if (!this.tryFire(time)) {
      this.burstLeft = 0;
      return;
    }
    this.burstLeft--;
    if (this.burstLeft === 0) this.cooldown += this.stats.burstDelay ?? 0.25;
  }

  update(dt) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.burstLeft > 0 && this.cooldown <= 0) {
      if (this.enabled) this.burstFire();
      else this.burstLeft = 0;
    }
    this.bloom = Math.max(0, this.bloom - dt * this.stats.bloomRecovery);
    this.drawLeft = Math.max(0, this.drawLeft - dt);
    if (this.reloading) {
      this.reloadLeft -= dt;
      if (this.reloadLeft <= 0) {
        this.reloadLeft = 0;
        // Se llena con lo que haya en la reserva (si es limitada).
        const take = Math.min(this.magazine - this.ammo, this.reserve);
        this.ammo += take;
        if (Number.isFinite(this.reserve)) this.reserve -= take;
        this.game.sfx.reloadEnd();
      }
    }
    if (this.enabled && this.auto && this.game.input.mouseDown) this.tryFire(performance.now());
  }

  // Dispara si se puede. Devuelve true si salió la bala.
  tryFire(time) {
    if (this.cooldown > 0 || this.reloading || this.drawing || this.game.melee?.busy || this.game.grenades?.busy) return false;
    if (this.infinite) {
      // Entrenamiento: el cargador nunca se vacía (si quedó a medias al entrar, se llena).
      this.ammo = this.magazine;
    } else if (this.ammo <= 0) {
      // Cargador vacío: "clic" en seco y, si está activada, recarga automática.
      this.cooldown = DRY_FIRE_COOLDOWN;
      this.game.sfx.dryFire();
      if (this.reserve <= 0) this.game.hud.flash('Sin munición: cambia de arma o busca munición', 'bad');
      else if (this.game.settings.gameplay.autoReload) this.reload();
      else this.game.hud.flash('Sin balas · R para recargar', 'bad');
      return false;
    }
    this.cooldown = 1 / (this.stats.rps * this.rateMul);
    if (!this.infinite) this.ammo--;
    this.fire(time);
    return true;
  }

  // Dispersión actual (grados): ráfaga + disparo sin apuntar + movimiento según el arma. Apuntando con
  // las miras (ADS) la ráfaga y el movimiento pesan menos (stats.ads.spread).
  currentSpread() {
    const g = this.game;
    const s = this.stats;
    const move = g.settings.gameplay.moveInaccuracy ? g.player.inaccuracy * s.moveSpread : 0;
    const hip = s.zoom && !this.scoped ? s.hipSpread : 0;
    return (this.bloom + move) * this.aimFactor + hip;
  }

  // Multiplicador de dispersión por apuntar con las miras (1 = sin apuntar).
  get aimFactor() {
    return this.aiming && this.stats.ads ? this.stats.ads.spread : 1;
  }

  // Punto del mundo desde el que sale la trazadora: sobre el rayo de la cámara que pasa por donde se ve
  // la boca del cañón en pantalla (a MUZZLE_DEPTH m). Así la bala sale del arma tanto desde la cadera
  // como apuntando con las miras (antes salía siempre de abajo a la derecha).
  muzzlePoint(out) {
    const g = this.game;
    const cam = g.engine.camera;
    if (!g.viewmodel.muzzleNdc || !g.engine.showOverlay) return out.set(0.16, -0.14, -0.6).applyMatrix4(cam.matrixWorld);
    g.viewmodel.muzzleNdc(_ndc);
    _ray.set(_ndc.x, _ndc.y, 0.5).unproject(cam).sub(cam.position).normalize();
    return out.copy(cam.position).addScaledVector(_ray, MUZZLE_DEPTH);
  }

  fire(time = performance.now()) {
    const g = this.game;
    const s = this.stats;
    const cam = g.engine.camera;
    const spread = this.currentSpread();
    const targets = g.mode?.hitMeshes?.() ?? [];

    _dir.set(0, 0, -1).applyQuaternion(cam.quaternion);
    _right.set(1, 0, 0).applyQuaternion(cam.quaternion);
    _up.set(0, 1, 0).applyQuaternion(cam.quaternion);
    jitter(_dir, spread, _right, _up);

    // Cada perdigón: dispersión propia dentro del cono del arma, alrededor de la dirección del disparo.
    const byBot = new Map();
    let firstHit = null;
    this.muzzlePoint(_muzzle);
    for (let i = 0; i < s.pellets; i++) {
      _shot.copy(_dir);
      jitter(_shot, s.pelletSpread * this.aimFactor, _right, _up);
      const hit = g.ballistics.cast(cam.position, _shot, targets);
      if (hit) _end.copy(hit.point);
      else _end.copy(cam.position).addScaledVector(_shot, 200);
      if (g.settings.gameplay.tracers && i < MAX_TRACERS_PER_SHOT) g.effects.tracer(_muzzle, _end, 'player');
      if (hit?.bot) {
        g.effects.burst(hit.point, hit.normal, hit.part === 'head' ? '#ffffff' : '#ffb26b', s.pellets > 1 ? 4 : 10, 3.5);
        const entry = byBot.get(hit.bot) ?? { count: 0, best: hit };
        entry.count++;
        if ((PART_RANK[hit.part] ?? 0) > (PART_RANK[entry.best.part] ?? 0)) entry.best = hit;
        byBot.set(hit.bot, entry);
      } else if (hit?.prop) {
        // Utilería con física: recibe el balazo en el punto exacto (sin marca: se mueve).
        g.world?.props?.hit(hit.prop, hit.point, _shot, PROP_IMPULSE * s.damage.body);
        if (i < MAX_TRACERS_PER_SHOT) g.effects.burst(hit.point, hit.normal, '#d8c9a8', s.pellets > 1 ? 3 : 6, 2.5);
      } else if (hit?.object?.userData.bottle) {
        // Botella de la barra (defensa): el modo la rompe; sin marca de impacto en el aire.
      } else if (hit) {
        g.effects.decal(hit.point, hit.normal);
        if (i < MAX_TRACERS_PER_SHOT) g.effects.burst(hit.point, hit.normal, '#c9c2b4', s.pellets > 1 ? 3 : 6, 2.5);
      }
      firstHit ??= hit;
    }

    // Resultado del disparo: el objetivo que más perdigones recibió (o lo primero que tocó).
    let result = firstHit;
    let most = 0;
    for (const { count, best } of byBot.values()) {
      if (count > most) {
        most = count;
        result = { ...best, pelletHits: count };
      }
    }

    // La ráfaga abre la dispersión en automático y en las armas que no tienen automático (pistola,
    // revólver, ráfaga). El rifle en semiautomático no acumula, como siempre.
    if (this.auto || !s.fireModes.includes('auto')) this.bloom = Math.min(s.maxBloom, this.bloom + s.bloomPerShot);

    g.sfx.shot(s.sound, s.soundRate ?? 1);
    g.viewmodel.kick(s.recoil);
    if (g.settings.gameplay.casings !== false) g.casings?.eject(s.id);
    this.onShot?.(result, spread, time);
  }
}
