import * as THREE from 'three';
import { Phase } from '../evaluation/Phase.js';
import { glow } from '../../gfx/surfaces.js';
import { explosionDamage } from '../../combat/Grenades.js';
import { WEAPONS } from '../../combat/weapons.js';
import { clock } from '../../utils/format.js';
import { rand } from '../../utils/math.js';
import { NavGrid } from './navGrid.js';
import { Zombie } from './Zombie.js';
import { ALIVE_BY_DETAIL } from './roundConfig.js';
import { BARRICADE, BOX_MOVE, BOX_PRICE, rollBox, DOORS, MAX_WEAPONS, DROP, FORGE, GRENADE_MAX, KNIFE_DAMAGE, PERKS, PLAYER, POWERUPS, RESERVE, WALL_BUYS, perkStats, pointsFor, rollDrop, wallAmmoPrice, waveConfig, waveRoster, zombieStats } from './zombieData.js';

const NAV_EVERY = 0.25; // s entre recálculos del campo de flujo
const PLAYER_RADIUS = 0.38; // los zombis no se meten dentro del jugador (ni de la cámara)
const CROWD_PASSES = 2; // pasadas de separación firme entre zombis por cuadro
const VIEW_AVOID = Math.PI / 3; // en oleadas altas se prefieren entradas fuera de la vista (±60°)
const NEAR_ENTRIES = 4; // los zombis salen de las entradas abiertas más cercanas al jugador
const LEG_LOSS = { near: 0.55, chance: 0.45 }; // explosión a menos de esa fracción del radio: puede dejarlo sin piernas
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
    power · forge { id } · box { id } · boxMove { where } · lastStand
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
    this.difficulty = mode.difficulty ?? 'normal';
    this.defense = mode.variant === 'defense';
    this.cash = PLAYER.startPoints;
    this.maxHealth = PLAYER.maxHealth;
    this.health = this.maxHealth;
    this.sinceHurt = 99;
    this.owned = new Set(['pistol']);
    this.slots = ['pistol']; // espacios de armas en orden (teclas 1-3); hasta MAX_WEAPONS
    this.perks = new Set(); // bebidas tomadas (zombieData.PERKS)
    this.upgraded = new Set(); // armas forjadas (zombieData.FORGE)
    this.game.weapon.magazineBy = {};
    this.boxUses = 0; // tiradas de la caja en su lugar actual (cada tantas se muda)
    this.boxMoveAt = BOX_MOVE.min + Math.floor(Math.random() * (BOX_MOVE.max - BOX_MOVE.min + 1));
    this.dmgMul = 1;
    this.regenDelay = PLAYER.regenDelay;
    this.regenRate = PLAYER.regenRate;
    this.repairPoints = 0;
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
    // Defensa: los zombis van por la barra con su propio campo de flujo (fijo: la barra no se mueve).
    this.bar = mode.bar ?? null;
    this.blood = mode.blood ?? null; // neblina y manchas de sangre (BloodFx)
    this.ctx.objective = null;
    if (this.defense && this.bar) {
      const barNav = new NavGrid({ ...w.nav, cell: 1, radius: 0.45, colliders: w.colliders });
      barNav.buildToMany(this.bar.attackPoints);
      this.ctx.objective = { bar: this.bar, nav: barNav };
    }
    this.barHitT = 0;
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
    this.cfg = waveConfig(n, this.difficulty);
    this.roster = waveRoster(this.cfg);
    this.spawnTimer = 0.8;
    this.waveKills = 0;
    this.repairPoints = 0; // tope de puntos por reparar barricadas en cada oleada
    this.state = 'wave';
    this.emit('waveStart', { wave: n, count: this.cfg.count, runnerNight: this.cfg.runnerNight });
  }

  update(dt) {
    super.update(dt); // zombis y retirada de los muertos
    this.updateHeads(dt);
    this.resolveCrowd();
    this.barHitT -= dt;
    this.updateNav(dt);
    this.updateHealth(dt);
    this.updateDrops(dt);
    for (const k of Object.keys(this.timers)) {
      if (this.timers[k] > 0 && (this.timers[k] -= dt) <= 0) this.emit('powerupEnd', { id: k });
    }
    this.sinceDrop += dt;
    if (this.state !== 'wave' || this.died) return;
    this.spawnTimer -= dt;
    if (this.roster.length && this.spawnTimer <= 0 && this.aliveCount < this.maxAlive()) {
      this.spawn(this.roster.shift());
      this.spawnTimer = rand(...this.cfg.spawnGap);
    }
    if (!this.roster.length && this.aliveCount === 0) {
      this.state = 'clear';
      this.addCash(this.cfg.clearBonus);
      this.emit('waveClear', { wave: this.wave, bonus: this.cfg.clearBonus, kills: this.waveKills });
    }
  }

  /*
    Colisión firme de la horda (después de que todos se movieron): ningún zombi queda dentro de otro
    ni del jugador. Se reparten el empujón según el tamaño (el bruto casi no se mueve) y, si eso los
    metió en una pared, la pared manda.
  */
  resolveCrowd() {
    const list = this.bots;
    const p = this.game.player.position;
    for (let pass = 0; pass < CROWD_PASSES; pass++) {
      for (let i = 0; i < list.length; i++) {
        const a = list[i];
        if (!a.alive) continue;
        const pa = a.group.position;
        for (let j = i + 1; j < list.length; j++) {
          const b = list[j];
          if (!b.alive) continue;
          const pb = b.group.position;
          const dx = pb.x - pa.x;
          const dz = pb.z - pa.z;
          const min = a.radius + b.radius;
          const d2 = dx * dx + dz * dz;
          if (d2 >= min * min) continue;
          const d = Math.sqrt(d2) || 1e-4;
          const push = min - d;
          const wa = b.radius / min; // el más grande se mueve menos
          const nx = d2 > 1e-8 ? dx / d : 1;
          const nz = d2 > 1e-8 ? dz / d : 0;
          pa.x -= nx * push * wa;
          pa.z -= nz * push * wa;
          pb.x += nx * push * (1 - wa);
          pb.z += nz * push * (1 - wa);
        }
        // Fuera del jugador.
        const dx = pa.x - p.x;
        const dz = pa.z - p.z;
        const min = a.radius + PLAYER_RADIUS;
        const d2 = dx * dx + dz * dz;
        if (d2 < min * min) {
          const d = Math.sqrt(d2) || 1e-4;
          pa.x = p.x + (d2 > 1e-8 ? dx / d : 0) * min;
          pa.z = p.z + (d2 > 1e-8 ? dz / d : 1) * min;
        }
      }
      for (const z of list) if (z.alive) z.collideWorld(this.ctx.colliders);
    }
    for (const z of list) if (z.alive) z.group.updateMatrixWorld(true);
  }

  // --- Defensa de la barra ----------------------------------------------------------------------
  onZombieAttackBar(z) {
    if (this.died || !this.bar) return;
    const broke = this.bar.damage(z.stats.damage, z.position);
    if (broke) this.emit('bar', { broke, left: this.bar.left, zombie: z });
    if (this.barHitT <= 0) {
      this.barHitT = 2.5;
      this.emit('barAttacked', { zombie: z });
    }
    if (this.bar.destroyed) {
      this.died = true;
      this.finished = true;
      this.emit('barDestroyed');
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
    z.entry = entry; // para arrancar los tablones de su barricada
    if (entry.rise) z.rise(); // las ventanas del vestíbulo: salen de la tierra
    this.bots.push(z);
    return z;
  }

  // Un zombi arranca un tablón de su barricada (crujido de madera, ubicado en estéreo).
  onTearBoard(z, b) {
    if (!this.world.removeBoard?.(b)) return;
    const g = this.game;
    g.sfx.propHit?.('wood', g.panFor(b.mouth), 0.9);
    this.emit('tear', { barricade: b });
  }

  /** Repara un tablón (el jugador mantiene la tecla de usar). Devuelve true si se clavó uno. */
  repairBoard(b) {
    if (!this.world.addBoard?.(b)) return false;
    if (this.repairPoints < BARRICADE.repairCapPerWave) {
      this.repairPoints += BARRICADE.repairPoints;
      this.addCash(BARRICADE.repairPoints);
    }
    return true;
  }

  // --- Daño a los zombis ------------------------------------------------------------------------
  // Zombis vivos a la vez: el de la ronda, sin pasar el tope de la calidad gráfica (rendimiento).
  maxAlive() {
    return Math.min(this.cfg.maxAlive, ALIVE_BY_DETAIL[this.game.engine?.detail] ?? Infinity);
  }

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
    const mul = this.cfg?.pointsMul ?? 1;
    let points = pointsFor({ part, killed, type: z.type, melee }, this.timers.double > 0, mul);
    if (tick) points = killed ? points - pointsFor({ part, killed: false }, this.timers.double > 0, mul) : 0;
    this.addCash(points);
    if (killed) {
      this.stats.kills++;
      this.waveKills++;
      if (part === 'head') this.stats.headKills++;
      if (melee) this.stats.meleeKills++;
      if (grenade) this.stats.grenadeKills++;
      if (!tick || Math.random() < 0.5) this.blood?.pool(z.position, z.scale);
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
    // Una botella de la barra: el tiro la rompe (y se pierde).
    if (hit?.object?.userData.bottle && this.bar) {
      const b = this.bar.bottleOf(hit.object, hit.instanceId);
      if (b && this.bar.breakBottle(b)) {
        this.emit('bottleShot', { left: this.bar.left });
        if (this.bar.destroyed && !this.died) {
          this.died = true;
          this.finished = true;
          this.emit('barDestroyed');
        }
      }
      return;
    }
    if (!hit?.bot || !hit.bot.alive) return;
    const { bot, part } = hit;
    s.hits++;
    s[part]++;
    const w = this.game.weapon;
    const base = w.stats.damage[part] * (hit.pelletHits ?? 1) * (this.upgraded.has(w.stats.id) ? FORGE.damage : 1);
    const before = bot.hp;
    if (hit.point) {
      bot.wound(hit.point, part); // la herida queda en el cuerpo, donde entró la bala
      this.blood?.hit(hit.point, _v.copy(hit.point).sub(this.game.player.eye).normalize(), part === 'head' ? 1.3 : 1);
    }
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

  // Chorro de sangre del cuello de un zombi sin cabeza (mientras sigue caminando).
  onNeckSpurt(z) {
    const neck = z.chestPosition(_to);
    neck.y += 0.42 * z.scale;
    this.game.effects.burst(neck, _up, '#5a0a08', 4, 2.2);
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

  // Granada: daño por distancia al pecho, solo con línea de visión. A los que sobreviven cerca del
  // estallido a veces les arranca las piernas: siguen arrastrándose (como en los clásicos).
  onExplosion(point, radius, los, { damageAt = explosionDamage } = {}) {
    let kills = 0;
    for (const z of this.bots) {
      if (!z.alive) continue;
      const chest = z.chestPosition(_to);
      const d = chest.distanceTo(point);
      if (d > radius || !los(chest)) continue;
      if (this.hitZombie(z, damageAt(d), 'body', { grenade: true })) kills++;
      else if (d < radius * LEG_LOSS.near && Math.random() < LEG_LOSS.chance && z.loseLegs()) {
        const hips = z.position.clone().setY(0.6 * z.scale);
        this.game.effects.burst(hips, _up, '#4a0806', 18, 3.5);
        this.blood?.pool(z.position, 1.2);
      }
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
    const powered = this.world.powered ?? true;
    if (it.kind === 'door') {
      if (this.world.doors?.[it.id]?.open ?? this.world.isOpen(it.id)) return null;
      return { price: DOORS[it.id].price, name: DOORS[it.id].name, label: `Abrir · ${DOORS[it.id].name}` };
    }
    if (it.kind === 'power') return powered ? null : { price: 0, label: 'Encender la electricidad del barrio' };
    if (it.kind === 'perk') {
      const p = PERKS[it.id];
      if (this.perks.has(it.id)) return { price: 0, label: `${p.name} · ya la tomaste`, done: true };
      if (p.power !== false && !powered) return { price: 0, label: `${p.name} · sin electricidad (enciende el generador)`, done: true, reason: 'Sin electricidad' };
      return { price: p.price, label: `Beber ${p.name} · ${p.desc}` };
    }
    if (it.kind === 'forge') {
      const id = this.game.weapon.stats.id;
      if (!powered) return { price: 0, label: 'Forja · sin electricidad (enciende el generador)', done: true, reason: 'Sin electricidad' };
      if (this.upgraded.has(id)) return { price: 0, label: `Forja · ${WEAPONS[id].name} ya está forjada`, done: true, reason: 'Ya está forjada' };
      return { price: FORGE.price, label: `Forjar ${WEAPONS[id].name} · doble daño, cargador y reserva más grandes` };
    }
    if (it.kind === 'box') return { price: BOX_PRICE, label: `Caja misteriosa · un arma al azar${this.swapNote()}` };
    const name = WEAPONS[it.id]?.name ?? it.id;
    if (this.owned.has(it.id)) return { price: wallAmmoPrice(it.id), label: `Munición · ${name}`, ammo: true };
    return { price: WALL_BUYS[it.id], label: `Comprar ${name}${this.swapNote()}` };
  }

  /** Compra algo del mapa. Devuelve null si se compró o el motivo si no. */
  buy(it) {
    const o = this.offer(it);
    if (!o) return 'Ya está abierta';
    if (o.done) return o.reason ?? 'Ya la tienes';
    if (o.ammo && this.reserveFullFor(it.id)) return 'Munición llena';
    if (this.cash < o.price) return it.kind === 'door' ? 'Dinero insuficiente' : 'Faltan puntos';
    const g = this.game;
    if (it.kind === 'box') {
      const id = rollBox(this.owned);
      if (!id) return 'Ya tienes todas las armas';
      this.cash -= o.price;
      const dropped = this.giveWeapon(id);
      this.emit('box', { id, dropped });
      if (++this.boxUses >= this.boxMoveAt) this.moveBox();
      return null;
    }
    if (it.kind === 'power') {
      this.world.setPower(true);
      this.emit('power');
      return null;
    }
    this.cash -= o.price;
    if (it.kind === 'forge') {
      const id = g.weapon.stats.id;
      this.upgraded.add(id);
      g.weapon.magazineBy[id] = FORGE.magazine;
      g.weapon.ammo = g.weapon.magazine;
      if (RESERVE[id] !== null) g.weapon.reserveBy[id] = this.reserveMax(id);
      this.emit('forge', { id });
      return null;
    }
    if (it.kind === 'door') {
      this.world.openDoor(it.id);
      this.nav.setColliders(this.world.colliders);
      this.navT = 0;
      // En la defensa, el camino hacia la barra también cambia al abrir una puerta.
      const obj = this.ctx.objective;
      if (obj) {
        obj.nav.setColliders(this.world.colliders);
        obj.nav.buildToMany(this.bar.attackPoints);
      }
      this.emit('door', { id: it.id });
    } else if (it.kind === 'perk') {
      this.perks.add(it.id);
      const before = this.maxHealth;
      this.applyPerks();
      this.health = Math.min(this.maxHealth, this.health + Math.max(0, this.maxHealth - before));
      g.hud.setHealth(this.health / this.maxHealth);
      this.emit('perk', { id: it.id });
    } else if (o.ammo) {
      g.weapon.reserveBy[it.id] = this.reserveMax(it.id);
      g.weapon.ammoBy[it.id] = g.weapon.magazineOf(it.id);
      this.emit('ammo', { id: it.id });
    } else {
      const dropped = this.giveWeapon(it.id);
      this.emit('weapon', { id: it.id, dropped });
    }
    return null;
  }

  // Con las manos llenas, lo que se compre cambia el arma de la mano (se dice en el mensaje).
  swapNote() {
    if (this.slots.length < MAX_WEAPONS) return '';
    return ` (cambia tu ${WEAPONS[this.handSlotWeapon()]?.name ?? 'arma'})`;
  }

  handSlotWeapon() {
    const cur = this.game.weapon.id;
    return this.slots.includes(cur) ? cur : this.slots[this.slots.length - 1];
  }

  /**
   * Arma nueva con su cargador lleno y su reserva; queda en la mano. Si ya hay MAX_WEAPONS, reemplaza a
   * la que está en la mano (en su mismo espacio) y la pierde con su forja. Devuelve la que dejó (o null).
   */
  giveWeapon(id) {
    const w = this.game.weapon;
    let dropped = null;
    if (!this.owned.has(id)) {
      if (this.slots.length >= MAX_WEAPONS) {
        dropped = this.handSlotWeapon();
        this.slots[this.slots.indexOf(dropped)] = id;
        this.owned.delete(dropped);
        this.upgraded.delete(dropped);
        if (w.reserveBy) delete w.reserveBy[dropped];
        if (w.magazineBy) delete w.magazineBy[dropped];
      } else this.slots.push(id);
      this.owned.add(id);
    }
    w.reserveBy[id] = this.reserveMax(id);
    w.setWeapon(id, { force: true });
    w.ammo = w.magazine;
    return dropped;
  }

  // Reserva máxima de un arma (más grande si está forjada); null = infinita.
  reserveMax(id) {
    const r = RESERVE[id];
    return r === null || r === undefined ? r : Math.round(r * (this.upgraded.has(id) ? FORGE.reserve : 1));
  }

  reserveFullFor(id) {
    const res = this.game.weapon.reserveBy;
    return !res || RESERVE[id] === null || res[id] >= this.reserveMax(id);
  }

  // La caja se muda a otro lugar (al azar, nunca el mismo) y la horda recalcula sus caminos.
  moveBox() {
    const w = this.world;
    const n = w.boxSpots?.length ?? 0;
    if (!w.moveBox || !w.box || n < 2) return;
    let i = w.box.spot;
    while (i === w.box.spot) i = Math.floor(Math.random() * n);
    const spot = w.moveBox(i);
    this.boxUses = 0;
    this.boxMoveAt = BOX_MOVE.min + Math.floor(Math.random() * (BOX_MOVE.max - BOX_MOVE.min + 1));
    this.nav.setColliders(w.colliders);
    this.navT = 0;
    this.emit('boxMove', { where: spot.where });
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
    g.sfx.hurt();
    // Último Aliento: en vez de caer, te levantas una vez con toda la vida (y se gasta la bebida).
    if (this.health <= 0 && this.perks.has('aliento')) {
      this.perks.delete('aliento');
      this.applyPerks();
      this.health = this.maxHealth;
      this.sinceHurt = 99;
      this.emit('lastStand');
    }
    g.hud.setHealth(this.health / this.maxHealth);
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
    this.health = Math.min(this.maxHealth, this.health + this.regenRate * (this.cfg?.regenMul ?? 1) * dt);
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
    const base = (z.floorY ?? 0) + 0.9; // sobre el piso donde cayó (también en los pisos altos)
    mesh.position.copy(z.position).setY(base);
    this.root.add(mesh);
    this.drops.push({ id, mesh, t: 0, base });
  }

  updateDrops(dt) {
    const p = this.game.player.position;
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.t += dt;
      d.mesh.rotation.y += dt * 2.2;
      d.mesh.position.y = d.base + Math.sin(d.t * 3) * 0.12;
      // Parpadea antes de desaparecer.
      const left = DROP.lifetime - d.t;
      d.mesh.visible = left > DROP.blinkFrom || Math.floor(left * 6) % 2 === 0;
      const near = Math.hypot(d.mesh.position.x - p.x, d.mesh.position.z - p.z) < DROP.pickupRadius && Math.abs(d.base - 0.9 - p.y) < 1.5;
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
    for (const id of this.owned) if (RESERVE[id] !== null) res[id] = this.reserveMax(id);
  }

  reserveFull() {
    const res = this.game.weapon.reserveBy;
    if (!res) return true;
    return [...this.owned].every((id) => RESERVE[id] === null || res[id] >= this.reserveMax(id));
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
      difficulty: this.difficulty,
      variant: this.defense ? 'defense' : 'survival',
      bottles: this.bar ? this.bar.left : null,
      bottlesTotal: this.bar ? this.bar.total : null,
      lostBy: this.bar?.destroyed ? 'bar' : 'player',
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
