import * as THREE from 'three';
import { acquireZombieSkin, loadZombieModel, releaseZombieSkin } from './zombieSkin.js';
import { pushCircleOut } from '../../physics/obb.js';
import { DEFENSE } from './zombieData.js';

/*
  Un zombi. Misma interfaz que los bots para que Phase, Ballistics y el jugador lo traten igual:
  alive, removable, escaped, hitMeshes (con userData.bot/part), damage(), bodyCollider(), update(),
  dispose() y opts.behavior.

  Estados: chase → attack → chase … · stagger (golpe fuerte) · dying → gone.
  - Persigue en línea recta si nada se interpone; si no, sigue el campo de flujo (navGrid.js).
  - El rumbo y la velocidad cambian de forma gradual (STEER, ACCEL): sin el zigzag de la cuadrícula
    ni giros bruscos al cruzar de celda. El cuerpo mira hacia donde camina.
  - Se separa de los otros zombis (empuje aparte del rumbo, para que no tiemble en grupo) y no
    atraviesa la geometría del mapa.
  - La animación sigue la velocidad real (si se frena contra un muro o la horda, no patina).
  - Ataca con preparación: el golpe se aplica a mitad del gesto y solo si el jugador sigue al alcance
    (se puede esquivar retrocediendo).
  - Las hitboxes (cajas invisibles) siguen al cuerpo; el reptante las tiene a ras del suelo.
*/

const RADIUS = 0.42;
const TURN = 5; // rad/s: giro del cuerpo
const STEER = 4.5; // 1/s: qué tan rápido cambia el rumbo hacia la dirección deseada
const ACCEL = 5; // 1/s: arranque y frenado
const DIRECT_RANGE = 2.6; // m: más cerca, directo al jugador
const LINE_EVERY = 0.2; // s entre comprobaciones de línea despejada hacia el jugador
const SEPARATION = 1.1; // fuerza del empuje entre zombis (m/s por unidad de solape)
const ROAR_TIME = 1.6; // s que el bruto ruge quieto al aparecer
const RISE_TIME = 1.3; // s que tarda en salir de la tierra (entradas del vestíbulo)
const TEAR_EVERY = 1.1; // s por tablón arrancado (zombieData.BARRICADE.tearEvery)
const BLEED = 0.14; // sin cabeza pero vivo: pierde esta fracción de su vida por segundo
const DEATH_TIME = 2.2; // s tendido antes de hundirse
const SINK_TIME = 0.7;
const ATTACK_HIT_AT = 0.45; // fracción del ciclo de ataque en que golpea
const STAGGER_TIME = 0.32;
const LEGLESS_SPEED = 0.85; // m/s arrastrándose sin piernas

const hitboxGeo = new THREE.BoxGeometry(1, 1, 1);
const hitboxMat = new THREE.MeshBasicMaterial({ visible: false });
const _dir = { x: 0, z: 0 };
const _near = { x: 0, z: 0 };
const _v = new THREE.Vector3();
const _head = new THREE.Vector3();

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
    this.floorY = 0; // altura del piso donde pisa (pisos altos y rampas: world.floorAt)
    this.attackT = 0;
    this.hitDone = false;
    this.staggerT = 0;
    this.flashT = 0;
    this.yaw = 0;
    this.speedNow = 0;
    this.moveSpeed = 0; // velocidad real medida (para el ritmo de la animación)
    this.heading = null; // rumbo actual {x, z} (unitario); se fija al primer cuadro
    this.lineT = Math.random() * LINE_EVERY; // escalonado: no todos comprueban en el mismo cuadro
    this.lineClear = false;
    this.pace = 0.92 + Math.random() * 0.16; // cada zombi camina un poco distinto
    this.stunT = 0; // aturdido (granada aturdidora): se mueve a media velocidad
    this.headless = false; // le volaron la cabeza (sigue caminando si le queda vida)
    this.aggroT = 0; // s que sigue enojado con el jugador (defensa: deja la barra y lo persigue)
    this.attackOn = 'player';
    this.entry = null; // entrada por la que llegó (su barricada hay que arrancarla para pasar)
    this.passed = false; // ya cruzó la barricada
    this.tearT = 0;
    this.riseT = 0; // saliendo de la tierra
    this.scale = stats.height / 1.78;
    this.radius = RADIUS * this.scale;
    this.dieAnim = Math.random() < 0.5 ? 'die' : 'die2';
    this.attackAnim = 'attack';
    this.groanT = stats.type === 'brute' ? 0.2 : 1 + Math.random() * 4; // el bruto ruge al aparecer
    this.legless = false; // una explosión le arrancó las piernas: se arrastra con los brazos
    this.bleedT = 0;

    this.group = new THREE.Group();
    this.group.position.copy(position);
    this.hitMeshes = [];
    this.buildHitboxes(stats.low ? CRAWLING : stats.type === 'runner' ? RUNNING : UPRIGHT);
    run.root.add(this.group);
    this.group.updateMatrixWorld(true);

    this.skin = null;
    loadZombieModel().then((template) => {
      if (!template || this.disposed) return;
      this.skin = acquireZombieSkin(template, { height: stats.height, kind: stats.look ?? 'normal', bulk: stats.bulk ?? 1 });
      run.root.add(this.skin.root);
      this.syncSkin();
      if (this.headless) this.skin.decapitate(); // perdió la cabeza antes de que llegara el modelo
      if (this.legless) this.skin.amputateLegs();
      this.skin.desync(); // cada uno en otro punto del ciclo: la horda no marcha al unísono
    });
  }

  // Cajas invisibles de impacto según la postura (de pie, encorvado o en el suelo).
  buildHitboxes(layout) {
    for (const m of this.hitMeshes) m.removeFromParent();
    this.hitMeshes = [];
    this.layout = layout;
    this.headBox = null;
    for (const [part, w, h, d, y, z] of layout) {
      if (part === 'head' && this.headless) continue;
      const m = new THREE.Mesh(hitboxGeo, hitboxMat);
      m.scale.set(w * this.scale, h * this.scale, d * this.scale);
      m.position.set(0, y * this.scale, z * this.scale);
      m.userData.bot = this;
      m.userData.part = part;
      this.group.add(m);
      this.hitMeshes.push(m);
      if (part === 'head') this.headBox = m;
    }
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
    // La caja de la cabeza sigue al hueso cuando el modelo ya llegó (ver followHead).
    if (this.headBox) return this.headBox.getWorldPosition(out);
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
    this.aggroT = DEFENSE.aggroTime; // quien lo lastima pasa a ser su objetivo un rato (defensa)
    this.flashT = 0.07;
    if (this.hp <= 0) {
      this.state = 'dying';
      this.t = 0;
      this.run.onZombieDeath?.(this, part);
      return { killed: true };
    }
    // Un golpe fuerte (o en la cabeza) lo frena un instante; el bruto no se inmuta. Sin cabeza, el daño
    // "a la cabeza" es el desangrado: no lo frena (si no, quedaría congelado en vez de seguir caminando).
    const headHit = part === 'head' && !this.headless;
    if (this.type !== 'brute' && (amount >= this.maxHp * 0.35 || headHit) && this.state !== 'attack') {
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

    // Sin cabeza se desangra: la baja se acredita al jugador (la decide el modo). Del cuello brota sangre.
    if (this.headless) {
      this.run.onBleed?.(this, this.maxHp * BLEED * dt);
      if (!this.alive) return this.updateDeath(dt);
      if ((this.bleedT -= dt) <= 0) {
        this.bleedT = 0.18 + Math.random() * 0.12;
        this.run.onNeckSpurt?.(this);
      }
    }

    const p = this.group.position;
    const player = ctx.playerPos;
    const pdx = player.x - p.x;
    const pdz = player.z - p.z;
    // Con el jugador en otro piso (arriba de una tarima) la distancia cuenta la altura: no lo alcanza
    // desde abajo y va por la rampa.
    const dy = Math.abs((player.y ?? 0) - this.floorY);
    const dist = Math.hypot(pdx, pdz) + (dy > 1 ? dy * 4 : 0);
    this.distToPlayer = dist;
    const reach = this.stats.attackRange * Math.max(1, this.scale * 0.9);

    // Objetivo: el jugador o, en la Defensa de la barra, la barra (salvo que el jugador esté encima o
    // le haya disparado hace poco y no se haya alejado demasiado).
    const obj = ctx.objective;
    const chasePlayer = !obj || dist < DEFENSE.aggroRange || (this.aggroT > 0 && dist < DEFENSE.aggroLeash);
    let dx = pdx;
    let dz = pdz;
    let tdist = dist;
    let nav = this.run.nav;
    if (!chasePlayer) {
      obj.bar.nearest(p.x, p.z, _near);
      dx = _near.x - p.x;
      dz = _near.z - p.z;
      tdist = obj.bar.distance(p.x, p.z);
      nav = obj.nav;
    }

    // Gruñidos de vez en cuando (más seguido cuanto más cerca).
    this.groanT -= dt;
    if (this.groanT <= 0) {
      this.groanT = (dist < 8 ? 2 : 4) + Math.random() * 4;
      this.run.onGroan?.(this, dist);
    }

    // Saliendo de la tierra: sube sin moverse (no se le puede dar hasta que asoma).
    if (this.riseT > 0) {
      this.riseT = Math.max(0, this.riseT - dt);
      const k = 1 - this.riseT / RISE_TIME;
      p.y = -1.9 * this.scale * (1 - k * (2 - k));
      this.turnTowards(Math.atan2(dx, dz), dt);
      this.group.rotation.y = this.yaw;
      this.group.updateMatrixWorld(true);
      this.updateSkin(dt, 'attack');
      return;
    }

    if (this.state === 'stagger') {
      this.staggerT -= dt;
      if (this.staggerT <= 0) this.state = 'chase';
      this.speedNow = 0;
    } else if (this.state === 'tear') {
      // Arranca los tablones de su entrada; si el jugador está al otro lado, lo ataca por la ventana.
      const b = this.entry.barricade;
      this.speedNow = 0;
      this.moveSpeed = 0;
      this.turnTowards(Math.atan2(b.inward.x, b.inward.z), dt);
      if (dist <= reach) {
        this.state = 'attack';
        this.attackOn = 'player';
        this.attackT = 0;
        this.hitDone = false;
      } else if (b.boards <= 0) this.state = 'chase';
      else if ((this.tearT += dt) >= TEAR_EVERY) {
        this.tearT = 0;
        this.run.onTearBoard?.(this, b);
      }
    } else if (this.state === 'attack') {
      this.speedNow = 0;
      this.attackT += dt;
      const onBar = this.attackOn === 'bar' && !!obj;
      // Mientras ataca la barra, mira a la barra; si no, al jugador.
      if (onBar) {
        obj.bar.nearest(p.x, p.z, _near);
        this.turnTowards(Math.atan2(_near.x - p.x, _near.z - p.z), dt);
      } else this.turnTowards(Math.atan2(pdx, pdz), dt);
      const targetDist = onBar ? obj.bar.distance(p.x, p.z) : dist;
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
        // Termina el gesto: sigue si su objetivo sigue a mano; si cambió de objetivo, a perseguir. Si
        // atacaba por una ventana aún tapiada, vuelve a los tablones.
        if (targetDist > reach * 1.15 || chasePlayer === onBar) this.state = this.blockedByBarricade() ? 'tear' : 'chase';
      }
    } else {
      this.chase(dt, ctx, dx, dz, tdist, nav);
      if (tdist <= reach && this.state === 'chase') {
        this.state = 'attack';
        this.attackOn = chasePlayer ? 'player' : 'bar';
        this.attackT = 0;
        this.hitDone = false;
        this.attackAnim = Math.random() < 0.5 ? 'attack' : 'attack2'; // dos zarpazos distintos
      }
    }
    if (this.state !== 'chase') this.separate(dt, ctx, 0.5);
    this.stunT = Math.max(0, this.stunT - dt);
    p.y = this.floorY = this.run.world?.floorAt?.(p.x, p.z, this.floorY) ?? 0;
    this.group.rotation.y = this.yaw;
    this.group.updateMatrixWorld(true);
    this.updateSkin(dt, this.animKey());
  }

  // Hacia dónde quiere ir: directo si está cerca o la recta está despejada; si no, el campo de flujo
  // (que siempre lleva al jugador). Con señuelo va directo a él.
  desiredDirection(dt, ctx, dx, dz, dist, nav = this.run.nav) {
    const p = this.group.position;
    _dir.x = dx / (dist || 1);
    _dir.z = dz / (dist || 1);
    if (dist <= DIRECT_RANGE || !nav || ctx.decoy) return _dir;
    this.lineT -= dt;
    if (this.lineT <= 0) {
      this.lineT = LINE_EVERY;
      this.lineClear = nav.clearLine?.(p.x, p.z, p.x + dx, p.z + dz) ?? false;
    }
    if (!this.lineClear) nav.direction(p.x, p.z, _dir);
    return _dir;
  }

  // dx, dz, dist: hacia su objetivo (jugador o barra); nav: el campo de flujo de ese objetivo.
  chase(dt, ctx, dx, dz, dist, nav = this.run.nav) {
    const p = this.group.position;
    // Señuelo: mientras dura, la horda va hacia él en vez de al jugador.
    if (ctx.decoy) {
      dx = ctx.decoy.x - p.x;
      dz = ctx.decoy.z - p.z;
      dist = Math.hypot(dx, dz);
    }
    // Barricada: al llegar a los tablones de su entrada se pone a arrancarlos.
    if (this.blockedByBarricade()) {
      this.state = 'tear';
      this.tearT = 0;
      this.speedNow = 0;
      return;
    }
    const want = this.desiredDirection(dt, ctx, dx, dz, dist, nav);
    // Rumbo suave: gira hacia la dirección deseada a una velocidad angular limitada.
    if (!this.heading) this.heading = { x: want.x, z: want.z };
    const h = this.heading;
    const k = Math.min(1, dt * STEER);
    h.x += (want.x - h.x) * k;
    h.z += (want.z - h.z) * k;
    const hl = Math.hypot(h.x, h.z) || 1;
    h.x /= hl;
    h.z /= hl;

    const roaring = this.type === 'brute' && this.t < ROAR_TIME;
    const target = roaring ? 0 : this.stats.speed * this.pace * (this.stunT > 0 ? 0.45 : 1);
    this.speedNow += (target - this.speedNow) * Math.min(1, dt * ACCEL);
    const x0 = p.x;
    const z0 = p.z;
    p.x += h.x * this.speedNow * dt;
    p.z += h.z * this.speedNow * dt;
    this.separate(dt, ctx, 1);
    this.collideWorld(ctx.colliders);
    this.holdAtBarricade();
    // Velocidad real (suavizada) para el ritmo de la animación.
    const moved = Math.hypot(p.x - x0, p.z - z0) / Math.max(dt, 1e-4);
    this.moveSpeed += (moved - this.moveSpeed) * Math.min(1, dt * 8);
    this.turnTowards(Math.atan2(h.x, h.z), dt);
  }

  // Lado de la barricada de su entrada en que está: > 0 dentro, < 0 fuera (en m). null sin barricada.
  barricadeSide() {
    const b = this.entry?.barricade;
    if (!b || this.passed) return null;
    const p = this.group.position;
    const ox = p.x - b.mouth.x;
    const oz = p.z - b.mouth.z;
    const side = ox * b.inward.x + oz * b.inward.z;
    if (side > 0.35) {
      this.passed = true;
      return null;
    }
    // Distancia a lo largo del hueco: lejos del hueco la barricada no le afecta.
    const lateral = Math.abs(ox * b.inward.z - oz * b.inward.x);
    return lateral < b.width / 2 + 1.2 ? side : null;
  }

  // ¿Está frente a los tablones de su entrada (y quedan)?
  blockedByBarricade() {
    const side = this.barricadeSide();
    return side !== null && this.entry.barricade.boards > 0 && side > -(this.radius + 0.4);
  }

  // Con tablones puestos no cruza el hueco, aunque la horda lo empuje.
  holdAtBarricade() {
    const side = this.barricadeSide();
    const b = this.entry?.barricade;
    if (side === null || b.boards <= 0) return;
    const limit = -(this.radius + 0.3);
    if (side > limit) this.group.position.addScaledVector(b.inward, limit - side);
  }

  /** Sale de la tierra antes de avanzar (entradas del vestíbulo). */
  rise() {
    this.riseT = RISE_TIME;
    this.floorY = 0;
    this.group.position.y = -1.9 * this.scale;
  }

  // Empuje entre zombis: corrige la posición poco a poco (no el rumbo), así el grupo no tiembla.
  separate(dt, ctx, strength) {
    const p = this.group.position;
    let sx = 0;
    let sz = 0;
    for (const o of ctx.zombies) {
      if (o === this || !o.alive) continue;
      const ox = p.x - o.group.position.x;
      const oz = p.z - o.group.position.z;
      const d2 = ox * ox + oz * oz;
      const min = this.radius + o.radius + 0.15;
      if (d2 >= min * min) continue;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        sx += (ox / d) * (1 - d / min);
        sz += (oz / d) * (1 - d / min);
      } else {
        // Exactamente encima: se abren hacia un lado fijo según quién es quién.
        sx += this.pace > o.pace ? 0.5 : -0.5;
      }
    }
    if (!sx && !sz) return;
    const push = SEPARATION * strength * Math.max(1, this.stats.speed) * dt;
    p.x += sx * push;
    p.z += sz * push;
  }

  /**
   * Le vuela la cabeza. Si sigue vivo, camina sin ella y se desangra (BLEED por segundo) hasta caer;
   * sin cabeza ya no hay hitbox de la cabeza. Devuelve false si ya no la tenía.
   */
  decapitate() {
    if (this.headless) return false;
    this.headless = true;
    this.headBox?.removeFromParent();
    this.headBox = null;
    this.hitMeshes = this.hitMeshes.filter((m) => m.userData.part !== 'head');
    this.skin?.decapitate();
    return true;
  }

  /**
   * Una explosión le arranca las piernas: sigue vivo, arrastrándose con los brazos (más lento y con
   * las cajas de impacto a ras del suelo). El bruto y los que ya se arrastran no las pierden.
   */
  loseLegs() {
    if (this.legless || this.stats.low || this.type === 'brute' || !this.alive) return false;
    this.legless = true;
    this.stats = { ...this.stats, low: true, speed: Math.min(this.stats.speed, LEGLESS_SPEED), attackRange: Math.min(this.stats.attackRange, 1.15) };
    this.buildHitboxes(CRAWLING);
    this.group.updateMatrixWorld(true);
    this.skin?.amputateLegs();
    if (this.state === 'stagger' || this.state === 'attack') this.state = 'chase';
    return true;
  }

  /** Marca de bala en el cuerpo (donde pegó). */
  wound(point, part) {
    this.skin?.wound(point, part === 'head' ? 6 : 9);
  }

  /** Aturdido por una granada: se mueve a media velocidad durante `t` segundos. */
  stun(t) {
    if (!this.alive) return;
    this.stunT = Math.max(this.stunT, t);
    if (this.type !== 'brute' && this.state !== 'attack') {
      this.state = 'stagger';
      this.staggerT = STAGGER_TIME;
    }
  }

  animKey() {
    if (this.state === 'attack') return this.type === 'brute' ? 'heavy' : this.legless ? 'attack2' : this.attackAnim;
    if (this.state === 'tear') return 'attack2'; // arrancando tablones
    if (this.state === 'stagger') return this.stats.low ? (this.legless ? 'drag' : 'crawl') : 'hit';
    if (this.legless) return 'drag';
    if (this.stats.low) return 'crawl';
    if (this.type === 'runner') return 'run';
    // El bruto ruge quieto al aparecer y luego camina con el ciclo rápido a un ritmo acorde a su tamaño.
    if (this.type === 'brute') return this.t < ROAR_TIME ? 'scream' : 'fast';
    // El ciclo lento (arrastrando los pies) solo para los que van despacio: acelerado parecía cámara rápida.
    return this.stats.speed * this.pace > 1.05 ? 'fast' : 'walk';
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
    if (this.t > DEATH_TIME) this.group.position.y = this.floorY - ((this.t - DEATH_TIME) / SINK_TIME) * 0.9 * this.scale;
    if (this.t > DEATH_TIME + SINK_TIME) this.state = 'gone';
    this.updateSkin(dt, this.dieAnim, true);
  }

  updateSkin(dt, anim, falling = false) {
    const s = this.skin;
    if (!s) return;
    this.syncSkin();
    const attacking = anim === 'attack' || anim === 'attack2' || anim === 'heavy';
    s.update(dt, {
      distance: this.distToPlayer ?? 0, // de lejos se anima a 20 Hz y sin sombra (zombieSkin.js)
      anim,
      speed: this.state === 'chase' ? this.moveSpeed : this.speedNow,
      cycle: this.state === 'tear' ? TEAR_EVERY : attacking ? this.stats.attackEvery : 0,
      flash: this.flashT > 0 ? 0.55 : 0,
      falling,
    });
    if (!falling) this.followHead();
  }

  // La caja de la cabeza va donde está la cabeza del modelo (al atacar, gritar o encorvarse se mueve
  // mucho): los tiros a la cabeza se deciden por lo que se ve.
  followHead() {
    const box = this.headBox;
    if (!box || !this.skin?.headCenter(_head)) return;
    this.group.worldToLocal(_head);
    box.position.copy(_head);
    box.updateMatrix();
    box.updateMatrixWorld(true);
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
