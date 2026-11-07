import * as THREE from 'three';
import { acquireZombieSkin, loadZombieModel, releaseZombieSkin } from './zombieSkin.js';
import { pushCircleOut } from '../../physics/obb.js';
import { DEFENSE } from './zombieData.js';

/*
  Un zombi. Misma interfaz que los bots para que Phase, Ballistics y el jugador lo traten igual:
  alive, removable, escaped, hitMeshes (con userData.bot/part), damage(), bodyCollider(), update(),
  dispose() y opts.behavior.

  Estados: chase → attack → chase … · stagger (golpe fuerte) · dying → gone.
  - Persigue siguiendo el campo de flujo de la partida (navGrid.js); de cerca va directo.
  - Se separa de los otros zombis y no atraviesa la geometría del mapa.
  - Ataca con preparación: el golpe se aplica a mitad del gesto y solo si el jugador sigue al alcance
    (se puede esquivar retrocediendo).
  - Las hitboxes (cajas invisibles) siguen al cuerpo; el reptante las tiene a ras del suelo.
*/

const RADIUS = 0.42;
const TURN = 7; // rad/s
const DIRECT_RANGE = 2.6; // m: más cerca, directo al jugador
const DEATH_TIME = 2.2; // s tendido antes de hundirse
const SINK_TIME = 0.7;
const ATTACK_HIT_AT = 0.45; // fracción del ciclo de ataque en que golpea
const STAGGER_TIME = 0.32;

const hitboxGeo = new THREE.BoxGeometry(1, 1, 1);
const hitboxMat = new THREE.MeshBasicMaterial({ visible: false });
const _dir = { x: 0, z: 0 };
const _near = { x: 0, z: 0 };
const _v = new THREE.Vector3();

// Hitboxes [parte, ancho, alto, fondo, y, z] en metros para una altura de 1.78 (se escalan).
const UPRIGHT = [
  ['head', 0.28, 0.3, 0.3, 1.6, 0.17],
  ['body', 0.52, 0.62, 0.32, 1.16, 0.04],
  ['legs', 0.42, 0.86, 0.28, 0.44, 0],
];
// El corredor va encorvado: cabeza más baja y adelantada.
const RUNNING = [
  ['head', 0.28, 0.3, 0.3, 1.4, 0.3],
  ['body', 0.52, 0.6, 0.34, 1.02, 0.14],
  ['legs', 0.42, 0.8, 0.3, 0.42, 0],
];
const CRAWLING = [
  ['head', 0.3, 0.3, 0.32, 0.42, 0.72],
  ['body', 0.52, 0.38, 0.95, 0.32, 0.12],
  ['legs', 0.46, 0.28, 0.8, 0.18, -0.72],
];

export class Zombie {
  constructor(run, stats, position) {
    this.run = run;
    this.stats = stats;
    this.type = stats.type;
    this.opts = { behavior: {} }; // compatibilidad con Phase
    this.hp = stats.hp;
    this.maxHp = stats.hp;
    this.state = 'chase';
    this.escaped = false;
    this.t = 0;
    this.attackT = 0;
    this.hitDone = false;
    this.staggerT = 0;
    this.flashT = 0;
    this.yaw = 0;
    this.speedNow = 0;
    this.aggroT = 0; // s que sigue enojado con el jugador (defensa: deja la barra y lo persigue)
    this.attackOn = 'player';
    this.scale = stats.height / 1.78;
    this.radius = RADIUS * this.scale;
    this.dieAnim = Math.random() < 0.5 ? 'die' : 'die2';
    this.groanT = 1 + Math.random() * 4;

    this.group = new THREE.Group();
    this.group.position.copy(position);
    this.hitMeshes = [];
    this.layout = stats.low ? CRAWLING : stats.type === 'runner' ? RUNNING : UPRIGHT;
    for (const [part, w, h, d, y, z] of this.layout) {
      const m = new THREE.Mesh(hitboxGeo, hitboxMat);
      m.scale.set(w * this.scale, h * this.scale, d * this.scale);
      m.position.set(0, y * this.scale, z * this.scale);
      m.userData.bot = this;
      m.userData.part = part;
      this.group.add(m);
      this.hitMeshes.push(m);
    }
    run.root.add(this.group);
    this.group.updateMatrixWorld(true);

    this.skin = null;
    loadZombieModel(stats.model).then((template) => {
      if (!template || this.disposed) return;
      this.skin = acquireZombieSkin(template, { height: stats.height, tint: stats.tint ?? null });
      run.root.add(this.skin.root);
      this.syncSkin();
    });
  }

  get alive() {
    return this.state !== 'dying' && this.state !== 'gone';
  }

  get removable() {
    return this.state === 'gone';
  }

  get position() {
    return this.group.position;
  }

  chestPosition(out = _v) {
    const p = this.group.position;
    return out.set(p.x, p.y + this.layout[1][4] * this.scale, p.z);
  }

  headPosition(out = _v) {
    const p = this.group.position;
    return out.set(p.x, p.y + this.layout[0][4] * this.scale, p.z);
  }

  bodyCollider(out) {
    const p = this.group.position;
    out.x = p.x;
    out.z = p.z;
    out.r = this.radius;
    out.y0 = p.y;
    out.h = (this.stats.low ? 0.6 : 1.8) * this.scale;
    return out;
  }

  /** Recibe daño. part: zona tocada (para saber si fue en la cabeza). */
  damage(amount, part = 'body') {
    if (!this.alive) return { killed: false };
    this.hp -= amount;
    this.aggroT = DEFENSE.aggroTime; // quien lo lastima pasa a ser su objetivo un rato
    this.flashT = 0.07;
    if (this.hp <= 0) {
      this.state = 'dying';
      this.t = 0;
      this.run.onZombieDeath?.(this, part);
      return { killed: true };
    }
    // Un golpe fuerte (o en la cabeza) lo frena un instante; el bruto no se inmuta.
    if (this.type !== 'brute' && (amount >= this.maxHp * 0.35 || part === 'head') && this.state !== 'attack') {
      this.state = 'stagger';
      this.staggerT = STAGGER_TIME;
    }
    return { killed: false };
  }

  update(dt, ctx) {
    this.t += dt;
    this.flashT -= dt;
    this.aggroT -= dt;
    if (this.state === 'dying') return this.updateDeath(dt);
    if (this.state === 'gone') return;

    const p = this.group.position;
    const player = ctx.playerPos;
    const pdx = player.x - p.x;
    const pdz = player.z - p.z;
    const dist = Math.hypot(pdx, pdz);
    this.distToPlayer = dist;
    const reach = this.stats.attackRange * Math.max(1, this.scale * 0.9);

    // Objetivo: el jugador, o en la defensa la barra (salvo que el jugador esté encima o le haya
    // disparado hace poco y no se haya alejado demasiado).
    const obj = ctx.objective;
    const chasePlayer = !obj || dist < DEFENSE.aggroRange || (this.aggroT > 0 && dist < DEFENSE.aggroLeash);
    let tx = player.x;
    let tz = player.z;
    let tdist = dist;
    let nav = this.run.nav;
    if (!chasePlayer) {
      obj.bar.nearest(p.x, p.z, _near);
      tx = _near.x;
      tz = _near.z;
      tdist = obj.bar.distance(p.x, p.z);
      nav = obj.nav;
    }
    const dx = tx - p.x;
    const dz = tz - p.z;

    // Gruñidos de vez en cuando (más seguido cuanto más cerca).
    this.groanT -= dt;
    if (this.groanT <= 0) {
      this.groanT = (dist < 8 ? 2 : 4) + Math.random() * 4;
      this.run.onGroan?.(this, dist);
    }

    if (this.state === 'stagger') {
      this.staggerT -= dt;
      if (this.staggerT <= 0) this.state = 'chase';
      this.speedNow = 0;
    } else if (this.state === 'attack') {
      this.speedNow = 0;
      this.attackT += dt;
      const onBar = this.attackOn === 'bar';
      // Mientras ataca la barra, mira a la barra; si no, al jugador.
      if (onBar && obj) {
        obj.bar.nearest(p.x, p.z, _near);
        this.turnTowards(Math.atan2(_near.x - p.x, _near.z - p.z), dt);
      } else this.turnTowards(Math.atan2(pdx, pdz), dt);
      const targetDist = onBar && obj ? obj.bar.distance(p.x, p.z) : dist;
      if (!this.hitDone && this.attackT >= this.stats.attackEvery * ATTACK_HIT_AT) {
        this.hitDone = true;
        if (targetDist <= reach + 0.35) {
          if (onBar) this.run.onZombieAttackBar?.(this);
          else this.run.onZombieAttack?.(this);
        }
      }
      if (this.attackT >= this.stats.attackEvery) {
        this.attackT = 0;
        this.hitDone = false;
        // Termina el gesto: sigue si su objetivo sigue a mano; si cambió de objetivo, a perseguir.
        const wantBar = !chasePlayer;
        if (targetDist > reach * 1.15 || wantBar !== onBar) this.state = 'chase';
      }
    } else {
      // Persecución: dirección del campo de flujo (o directo si está cerca o no hay camino).
      let mx = dx / (tdist || Math.hypot(dx, dz) || 1);
      let mz = dz / (tdist || Math.hypot(dx, dz) || 1);
      if (tdist > DIRECT_RANGE && nav?.direction(p.x, p.z, _dir)) {
        mx = _dir.x;
        mz = _dir.z;
      }
      // Separación de los demás zombis (no se apilan): dirección; la corrección firme la hace la
      // partida después de mover a todos (ZombieRun.resolveCrowd).
      for (const o of ctx.zombies) {
        if (o === this || !o.alive) continue;
        const ox = p.x - o.group.position.x;
        const oz = p.z - o.group.position.z;
        const d2 = ox * ox + oz * oz;
        const min = this.radius + o.radius + 0.15;
        if (d2 > 0.0001 && d2 < min * min) {
          const d = Math.sqrt(d2);
          mx += (ox / d) * (1 - d / min) * 1.6;
          mz += (oz / d) * (1 - d / min) * 1.6;
        }
      }
      const len = Math.hypot(mx, mz) || 1;
      const speed = this.stats.speed;
      this.speedNow += (speed - this.speedNow) * Math.min(1, dt * 6);
      p.x += (mx / len) * this.speedNow * dt;
      p.z += (mz / len) * this.speedNow * dt;
      this.collideWorld(ctx.colliders);
      this.turnTowards(Math.atan2(mx, mz), dt);
      if (tdist <= reach) {
        this.state = 'attack';
        this.attackOn = chasePlayer ? 'player' : 'bar';
        this.attackT = 0;
        this.hitDone = false;
      }
    }
    this.group.rotation.y = this.yaw;
    this.group.updateMatrixWorld(true);
    this.updateSkin(dt, this.animKey());
  }

  animKey() {
    if (this.state === 'attack') return this.type === 'brute' ? 'heavy' : 'attack';
    if (this.state === 'stagger') return 'hit';
    if (this.stats.low) return 'crawl';
    if (this.type === 'runner') return 'run';
    if (this.type === 'brute') return this.t < 1.4 ? 'scream' : 'walk';
    return this.stats.speed > 1.6 ? 'fast' : 'walk';
  }

  turnTowards(target, dt) {
    let d = target - this.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.yaw += Math.sign(d) * Math.min(Math.abs(d), TURN * dt);
  }

  // Empuja al zombi fuera de las cajas del mapa (círculo contra caja en el plano).
  // Contra cajas fijas y giradas (barreras, autos: su forma real, ver physics/obb.js).
  collideWorld(colliders) {
    const p = this.group.position;
    const r = this.radius;
    for (const b of colliders) {
      if (b.max.y < 0.3 || b.min.y > 1.6) continue;
      if (p.x + r < b.min.x || p.x - r > b.max.x || p.z + r < b.min.z || p.z - r > b.max.z) continue;
      const out = pushCircleOut(b, p.x, p.z, r);
      if (out) {
        p.x = out[0];
        p.z = out[1];
      }
    }
  }

  updateDeath(dt) {
    if (this.t > DEATH_TIME) this.group.position.y = -((this.t - DEATH_TIME) / SINK_TIME) * 0.9 * this.scale;
    if (this.t > DEATH_TIME + SINK_TIME) this.state = 'gone';
    this.updateSkin(dt, this.dieAnim, true);
  }

  updateSkin(dt, anim, falling = false) {
    const s = this.skin;
    if (!s) return;
    this.syncSkin();
    s.update(dt, {
      distance: this.distToPlayer ?? 0,
      anim,
      speed: this.speedNow,
      cycle: anim === 'attack' || anim === 'heavy' ? this.stats.attackEvery : 0,
      flash: this.flashT > 0 ? 1.4 : 0,
      falling,
    });
  }

  syncSkin() {
    const r = this.skin.root;
    r.position.copy(this.group.position);
    r.rotation.y = this.group.rotation.y;
  }

  dispose() {
    this.disposed = true;
    if (this.skin) releaseZombieSkin(this.skin);
    this.skin = null;
    this.group.removeFromParent();
  }
}
