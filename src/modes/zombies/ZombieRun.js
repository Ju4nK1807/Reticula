import * as THREE from 'three';
import { Phase } from '../evaluation/Phase.js';
import { glow } from '../../gfx/surfaces.js';
import { explosionDamage } from '../../combat/Grenades.js';
import { WEAPONS } from '../../combat/weapons.js';
import { clock } from '../../utils/format.js';
import { rand } from '../../utils/math.js';
import { NavGrid } from './navGrid.js';
import { Zombie } from './Zombie.js';
import { DOORS, DROP, GRENADE_MAX, KNIFE_DAMAGE, PERKS, PLAYER, POWERUPS, RESERVE, WALL_BUYS, perkStats, pointsFor, rollDrop, wallAmmoPrice, waveConfig, waveRoster, zombieStats } from './zombieData.js';

const NAV_EVERY = 0.25; // s entre recálculos del campo de flujo
const VIEW_AVOID = Math.PI / 3; // en oleadas altas se prefieren entradas fuera de la vista (±60°)
const NEAR_ENTRIES = 4; // los zombis salen de las entradas abiertas más cercanas al jugador
const _v = new THREE.Vector3();
const _to = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const powerGeo = new THREE.OctahedronGeometry(0.32, 0);
// Cabeza que sale volando (low-poly, piel gris verdosa).
const headGeo = new THREE.DodecahedronGeometry(0.13, 0);
const headMat = new THREE.MeshStandardMaterial({ color: '#5f6b55', roughness: 0.85, flatShading: true });

/*
  Una partida del modo zombi. Extiende Phase para reutilizar disparos, vida, daño direccional,
  estadísticas y colisiones con el jugador. El modo (Zombies.js) controla el flujo entre oleadas.

  Avisa al modo con listener(tipo, datos):
    waveStart { wave, count, runnerNight } · waveClear { wave, bonus } · kill { zombie, part, points }
    cash { amount } · powerup { id } · powerupEnd { id } · hurt · groan { zombie, dist } · death
    door { id } · perk { id } · weapon { id } · ammo { id }   (compras en el mapa)
*/
export class ZombieRun extends Phase {
  static info = { id: 'zombies', name: 'Zombis', desc: '', auto: true, health: true };

  constructor(mode) {
    super(mode);
    this.duration = Infinity;
    this.listener = null;
    this.state = 'idle';
    this.wave = 0;
    this.cfg = null;
    this.roster = [];
    this.spawnTimer = 0;
    this.lastEntry = null;
    this.cash = PLAYER.startPoints;
    this.maxHealth = PLAYER.maxHealth;
    this.health = this.maxHealth;
    this.sinceHurt = 99;
    this.owned = new Set(['pistol']);
    this.perks = new Set(); // bebidas tomadas (zombieData.PERKS)
    this.dmgMul = 1;
    this.regenDelay = PLAYER.regenDelay;
    this.regenRate = PLAYER.regenRate;
    this.timers = { double: 0, instakill: 0 };
    this.sinceDrop = DROP.cooldown;
    this.drops = []; // { id, mesh, t }
    this.heads = []; // cabezas que salieron volando { mesh, vel, spin, t }
    this.waveKills = 0;
    this.stats.headKills = 0;
    this.stats.meleeKills = 0;
    this.stats.grenadeKills = 0;

    const w = this.world;
    this.nav = new NavGrid({ ...w.nav, cell: 1, radius: 0.45, colliders: w.colliders });
    this.navT = 0;
    this.navCell = -1;
    this.ctx.zombies = this.bots;
    this.ctx.colliders = w.colliders;
    this.ctx.decoy = null; // señuelo activo: { x, z }
  }

  emit(type, data = {}) {
    this.listener?.(type, data);
  }

  get aliveCount() {
    let n = 0;
    for (const z of this.bots) if (z.alive) n++;
    return n;
  }

  get remaining() {
    return this.state === 'wave' ? this.roster.length + this.aliveCount : 0;
  }

  // --- Oleadas ------------------------------------------------------------------------------------
  startWave(n) {
    this.wave = n;
    this.cfg = waveConfig(n);
    this.roster = waveRoster(this.cfg);
    this.spawnTimer = 0.8;
    this.waveKills = 0;
    this.state = 'wave';
    this.emit('waveStart', { wave: n, count: this.cfg.count, runnerNight: this.cfg.runnerNight });
  }

  update(dt) {
    super.update(dt); // zombis y retirada de los muertos
    this.updateHeads(dt);
    this.updateNav(dt);
    this.updateHealth(dt);
    this.updateDrops(dt);
    for (const k of Object.keys(this.timers)) {
      if (this.timers[k] > 0 && (this.timers[k] -= dt) <= 0) this.emit('powerupEnd', { id: k });
    }
    this.sinceDrop += dt;
    if (this.state !== 'wave' || this.died) return;
    this.spawnTimer -= dt;
    if (this.roster.length && this.spawnTimer <= 0 && this.aliveCount < this.cfg.maxAlive) {
      this.spawn(this.roster.shift());
      this.spawnTimer = rand(...this.cfg.spawnGap);
    }
    if (!this.roster.length && this.aliveCount === 0) {
      this.state = 'clear';
      this.addCash(this.cfg.clearBonus);
      this.emit('waveClear', { wave: this.wave, bonus: this.cfg.clearBonus, kills: this.waveKills });
    }
  }

  // Campo de flujo hacia el jugador: se rehace cada NAV_EVERY s o al cambiar de celda.
  updateNav(dt) {
    this.navT -= dt;
    const p = this.game.player.position;
    const cell = this.nav.index(p.x, p.z);
    if (this.navT > 0 && cell === this.navCell) return;
    this.navT = NAV_EVERY;
    this.navCell = cell;
    this.nav.build(p.x, p.z);
  }

  // Entrada: solo de las secciones abiertas y, entre ellas, de las más cercanas al jugador (la horda
  // llega a donde estás, no al otro lado del mapa). No repetir la anterior; en oleadas altas, mejor
  // fuera de la vista.
  pickEntry() {
    const w = this.world;
    const p = this.game.player.position;
    const open = w.entries.filter((e) => w.isOpen?.(e.section ?? 'plaza') ?? true);
    const byDist = open.map((e) => ({ e, d: Math.hypot(e.center.x - p.x, e.center.z - p.z) })).sort((a, b) => a.d - b.d);
    let options = byDist.slice(0, NEAR_ENTRIES).map((x) => x.e).filter((e) => e !== this.lastEntry);
    if (!options.length) options = open;
    if (this.wave >= 4) {
      const hidden = options.filter((e) => Math.abs(this.game.angleTo(e.center)) > VIEW_AVOID);
      if (hidden.length) options = hidden;
    }
    const e = options[Math.floor(Math.random() * options.length)] ?? w.entries[0];
    this.lastEntry = e;
    return e;
  }

  spawn(type) {
    const entry = this.pickEntry();
    const pos = entry.spawn.clone();
    pos.x += rand(-1.2, 1.2);
    pos.z += rand(-1.2, 1.2);
    const z = new Zombie(this, zombieStats(type, this.cfg), pos);
    this.bots.push(z);
    return z;
  }

  // --- Daño a los zombis ------------------------------------------------------------------------
  damageMultiplier() {
    return this.dmgMul;
  }

  // Aplica daño a un zombi y reparte puntos (impacto y baja). Devuelve si murió.
  // tick: daño continuo (fuego): solo da los puntos de la baja, no los de cada impacto.
  hitZombie(z, amount, part, { melee = false, grenade = false, tick = false } = {}) {
    if (!z.alive) return false;
    // El cuchillo tiene daño fijo (las bebidas de daño solo afectan a las armas).
    const dmg = this.timers.instakill > 0 ? z.hp + 1 : amount * (melee ? 1 : this.dmgMul);
    const { killed } = z.damage(dmg, part);
    let points = pointsFor({ part, killed, type: z.type, melee }, this.timers.double > 0);
    if (tick) points = killed ? points - pointsFor({ part, killed: false }, this.timers.double > 0) : 0;
    this.addCash(points);
    if (killed) {
      this.stats.kills++;
      this.waveKills++;
      if (part === 'head') this.stats.headKills++;
      if (melee) this.stats.meleeKills++;
      if (grenade) this.stats.grenadeKills++;
      this.emit('kill', { zombie: z, part, points });
      this.maybeDrop(z);
    }
    return killed;
  }

  // Disparo del jugador (sin penalización por fallar: aquí se gana o no se gana).
  handleShot(hit, time = performance.now()) {
    const s = this.stats;
    const { hud, sfx } = this.game;
    this.shotTime = time;
    s.shots++;
    if (!hit?.bot || !hit.bot.alive) return;
    const { bot, part } = hit;
    s.hits++;
    s[part]++;
    const base = this.game.weapon.stats.damage[part] * (hit.pelletHits ?? 1);
    const before = bot.hp;
    const killed = this.hitZombie(bot, base, part);
    // Tiro a la cabeza: si lo mata, la cabeza sale volando; si no, a veces también (un golpe fuerte) y
    // el zombi sigue caminando sin ella hasta desangrarse, como en los clásicos.
    if (part === 'head' && bot.type !== 'brute') {
      const strong = (before - Math.max(0, bot.hp)) >= bot.maxHp * 0.25;
      if (killed || (strong && Math.random() < 0.45)) this.decapitate(bot, hit);
    }
    hud.hitmarker(killed ? 'kill' : part === 'head' ? 'head' : 'hit');
    if (part === 'head') sfx.headshot();
    else sfx.hit();
    if (killed) sfx.kill();
  }

  // Cuchillo: daño fijo KNIFE_DAMAGE (1 golpe en la ronda 1, 2 en la 2, 3 en la 3…).
  // La cabeza sale volando: salpicadura y la cabeza que cae rodando (y la hitbox desaparece).
  decapitate(z, hit) {
    if (!z.decapitate()) return;
    const g = this.game;
    const head = z.headPosition(new THREE.Vector3());
    g.effects.burst(head, _up, '#6b0d0d', 22, 4.5);
    g.effects.burst(head, _up, '#a8261f', 12, 2.5);
    const dir = hit?.point ? head.clone().sub(g.player.eye).setY(0).normalize() : new THREE.Vector3(0, 0, 1);
    const mesh = new THREE.Mesh(headGeo, headMat);
    mesh.position.copy(head);
    mesh.scale.setScalar(z.scale);
    this.root.add(mesh);
    this.heads.push({ mesh, vel: dir.multiplyScalar(2.5).setY(3.2), spin: new THREE.Vector3(Math.random() * 9, Math.random() * 9, 0), t: 0 });
    g.sfx.meleeHit?.();
  }

  // Sin cabeza se desangra: daño continuo que solo da los puntos de la baja (a la cabeza).
  onBleed(z, amount) {
    if (this.hitZombie(z, amount, 'head', { tick: true })) this.game.hud.hitmarker('kill');
  }

  updateHeads(dt) {
    for (let i = this.heads.length - 1; i >= 0; i--) {
      const h = this.heads[i];
      h.t += dt;
      h.vel.y -= 14 * dt;
      h.mesh.position.addScaledVector(h.vel, dt);
      const floor = 0.12 * h.mesh.scale.x;
      if (h.mesh.position.y < floor) {
        h.mesh.position.y = floor;
        h.vel.y = Math.abs(h.vel.y) * 0.3;
        h.vel.x *= 0.6;
        h.vel.z *= 0.6;
      }
      h.mesh.rotation.x += h.spin.x * dt * Math.min(1, h.vel.length());
      h.mesh.rotation.y += h.spin.y * dt * Math.min(1, h.vel.length());
      if (h.t > 6) {
        h.mesh.removeFromParent();
        this.heads.splice(i, 1);
      }
    }
  }

  handleMelee(hit) {
    if (!hit.bot?.alive) return;
    const killed = this.hitZombie(hit.bot, KNIFE_DAMAGE, hit.part, { melee: true });
    this.game.hud.hitmarker(killed ? 'kill' : 'hit');
    if (killed) this.game.sfx.kill();
  }

  // Granada: daño por distancia al pecho, solo con línea de visión.
  onExplosion(point, radius, los, { damageAt = explosionDamage } = {}) {
    let kills = 0;
    for (const z of this.bots) {
      if (!z.alive) continue;
      const chest = z.chestPosition(_to);
      const d = chest.distanceTo(point);
      if (d > radius || !los(chest)) continue;
      if (this.hitZombie(z, damageAt(d), 'body', { grenade: true })) kills++;
    }
    if (kills) this.game.hud.hitmarker('kill');
    if (kills >= 3) this.emit('multi', { kills });
  }

  // Incendiaria: daño continuo a quien pise el fuego (distancia en el plano).
  onFireTick(point, radius, damage, los) {
    for (const z of this.bots) {
      if (!z.alive) continue;
      const p = z.position;
      if (Math.hypot(p.x - point.x, p.z - point.z) > radius || !los(z.chestPosition(_to))) continue;
      z.flashT = 0.05;
      if (this.hitZombie(z, damage, 'body', { grenade: true, tick: true })) this.game.hud.hitmarker('kill');
    }
  }

  // Aturdidora: frena a los que estén cerca y a la vista del estallido.
  onStun(point, radius, seconds, los) {
    let n = 0;
    for (const z of this.bots) {
      if (!z.alive || z.position.distanceTo(point) > radius || !los(z.chestPosition(_to))) continue;
      z.stun(seconds);
      n++;
    }
    if (n) this.game.hud.flash(`${n} aturdido${n === 1 ? '' : 's'}`, 'good');
  }

  // Señuelo: la horda lo persigue mientras pita.
  setDecoy(point) {
    this.ctx.decoy = point ? { x: point.x, z: point.z } : null;
  }

  // --- Compras en el mapa (puertas, armas de la pared, bebidas) -----------------------------------
  /** Precio y texto de algo comprable del mapa, o null si ya no se puede usar (puerta abierta). */
  offer(it) {
    if (it.kind === 'door') {
      if (this.world.isOpen(it.id)) return null;
      return { price: DOORS[it.id].price, label: `Abrir · ${DOORS[it.id].name}` };
    }
    if (it.kind === 'perk') {
      const p = PERKS[it.id];
      if (this.perks.has(it.id)) return { price: 0, label: `${p.name} · ya la tomaste`, done: true };
      return { price: p.price, label: `Beber ${p.name} · ${p.desc}` };
    }
    const name = WEAPONS[it.id]?.name ?? it.id;
    if (this.owned.has(it.id)) return { price: wallAmmoPrice(it.id), label: `Munición · ${name}`, ammo: true };
    return { price: WALL_BUYS[it.id], label: `Comprar ${name}` };
  }

  /** Compra algo del mapa. Devuelve null si se compró o el motivo si no. */
  buy(it) {
    const o = this.offer(it);
    if (!o) return 'Ya está abierta';
    if (o.done) return 'Ya la tienes';
    if (o.ammo && this.reserveFullFor(it.id)) return 'Munición llena';
    if (this.cash < o.price) return 'Faltan puntos';
    this.cash -= o.price;
    const g = this.game;
    if (it.kind === 'door') {
      this.world.openDoor(it.id);
      this.nav.setColliders(this.world.colliders);
      this.navT = 0;
      this.emit('door', { id: it.id });
    } else if (it.kind === 'perk') {
      this.perks.add(it.id);
      const before = this.maxHealth;
      this.applyPerks();
      this.health = Math.min(this.maxHealth, this.health + Math.max(0, this.maxHealth - before));
      g.hud.setHealth(this.health / this.maxHealth);
      this.emit('perk', { id: it.id });
    } else if (o.ammo) {
      g.weapon.reserveBy[it.id] = RESERVE[it.id];
      g.weapon.ammoBy[it.id] = WEAPONS[it.id].magazine;
      this.emit('ammo', { id: it.id });
    } else {
      this.owned.add(it.id);
      g.weapon.reserveBy[it.id] = RESERVE[it.id];
      g.weapon.setWeapon(it.id, { force: true });
      g.weapon.ammo = g.weapon.stats.magazine;
      this.emit('weapon', { id: it.id });
    }
    return null;
  }

  reserveFullFor(id) {
    const res = this.game.weapon.reserveBy;
    return !res || RESERVE[id] === null || res[id] >= RESERVE[id];
  }

  // Efectos de las bebidas en el jugador y el arma.
  applyPerks() {
    const s = perkStats(this.perks);
    this.maxHealth = s.maxHealth;
    this.dmgMul = s.damage;
    this.regenDelay = s.regenDelay;
    this.regenRate = s.regenRate;
    this.game.weapon.rateMul = s.rate;
    this.game.weapon.reloadMul = s.reload;
    this.game.player.perkSpeed = s.speed;
  }

  onZombieDeath() {}

  // --- Jugador ------------------------------------------------------------------------------------
  onZombieAttack(z) {
    if (this.died) return;
    this.takeDamage(z.stats.damage, z.chestPosition(_v));
    this.emit('hurt', { zombie: z });
  }

  takeDamage(amount, from) {
    if (this.died) return;
    const g = this.game;
    this.health = Math.max(0, this.health - amount);
    this.stats.damageTaken += amount;
    this.sinceHurt = 0;
    g.hud.damage(g.angleTo(from));
    g.hud.setHealth(this.health / this.maxHealth);
    g.sfx.hurt();
    if (this.health <= 0) {
      this.died = true;
      this.finished = true;
      this.emit('death');
    }
  }

  // Regeneración tras unos segundos sin recibir daño.
  updateHealth(dt) {
    this.sinceHurt += dt;
    if (this.died || this.health >= this.maxHealth || this.sinceHurt < this.regenDelay) return;
    this.health = Math.min(this.maxHealth, this.health + this.regenRate * dt);
    this.game.hud.setHealth(this.health / this.maxHealth);
  }

  onGroan(z, dist) {
    this.emit('groan', { zombie: z, dist });
  }

  addCash(n) {
    if (!n) return;
    this.cash += n;
    this.score += n;
    this.emit('cash', { amount: n });
  }

  // --- Potenciadores ------------------------------------------------------------------------------
  maybeDrop(z) {
    const id = rollDrop(this.sinceDrop);
    if (!id) return;
    this.sinceDrop = 0;
    const mesh = new THREE.Mesh(powerGeo, glow(POWERUPS[id].color));
    mesh.position.copy(z.position).setY(0.9);
    this.root.add(mesh);
    this.drops.push({ id, mesh, t: 0 });
  }

  updateDrops(dt) {
    const p = this.game.player.position;
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.t += dt;
      d.mesh.rotation.y += dt * 2.2;
      d.mesh.position.y = 0.9 + Math.sin(d.t * 3) * 0.12;
      // Parpadea antes de desaparecer.
      const left = DROP.lifetime - d.t;
      d.mesh.visible = left > DROP.blinkFrom || Math.floor(left * 6) % 2 === 0;
      const near = Math.hypot(d.mesh.position.x - p.x, d.mesh.position.z - p.z) < DROP.pickupRadius;
      if (near && !this.died) this.applyPowerup(d.id);
      if (near || left <= 0) {
        d.mesh.removeFromParent();
        d.mesh.material.dispose();
        this.drops.splice(i, 1);
      }
    }
  }

  applyPowerup(id) {
    const g = this.game;
    switch (id) {
      case 'ammo':
        this.refillReserves();
        g.weapon.refill();
        if (this.ev.grenadeBag) this.ev.grenadeBag.frag = Math.min(GRENADE_MAX.frag, this.ev.grenadeBag.frag + 1);
        break;
      case 'double':
      case 'instakill':
        this.timers[id] = POWERUPS[id].duration;
        break;
      case 'nuke':
        for (const z of this.bots) if (z.alive) this.hitZombie(z, z.hp + 1, 'body');
        this.addCash(DROP.nukePoints);
        break;
      case 'medkit':
        this.health = this.maxHealth;
        g.hud.setHealth(1);
        break;
    }
    this.emit('powerup', { id });
  }

  // Reserva completa de todas las armas que se tienen.
  refillReserves() {
    const res = this.game.weapon.reserveBy;
    if (!res) return;
    for (const id of this.owned) if (RESERVE[id] !== null) res[id] = RESERVE[id];
  }

  reserveFull() {
    const res = this.game.weapon.reserveBy;
    if (!res) return true;
    return [...this.owned].every((id) => RESERVE[id] === null || res[id] >= RESERVE[id]);
  }

  // --- Interfaz / resultados ----------------------------------------------------------------------
  hudStats() {
    // Los puntos para gastar van en su propio panel (dorado); arriba, las bajas.
    // Sin precisión: aquí no se puntúa la puntería, se sobrevive (accLabel null oculta ese dato).
    return { score: this.stats.kills, scoreLabel: 'Bajas', accLabel: null, accText: '', time: clock(this.elapsed) };
  }

  results() {
    const s = this.stats;
    return {
      wave: this.wave,
      score: this.score,
      kills: s.kills,
      headKills: s.headKills,
      meleeKills: s.meleeKills,
      grenadeKills: s.grenadeKills,
      accuracy: this.accuracy,
      hsRate: s.kills ? s.headKills / s.kills : null,
      damageTaken: s.damageTaken,
      time: this.elapsed,
    };
  }

  dispose() {
    for (const d of this.drops) {
      d.mesh.removeFromParent();
      d.mesh.material.dispose();
    }
    this.drops.length = 0;
    for (const h of this.heads) h.mesh.removeFromParent();
    this.heads.length = 0;
    super.dispose();
  }
}
