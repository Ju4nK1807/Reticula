import * as THREE from 'three';
import { glow } from '../gfx/surfaces.js';

/*
  Granadas (G lanza, Q cambia de tipo; teclas reasignables).

  - Al pulsar se ve el brazo con la granada en la mano (Viewmodel.throwGrenade) y sale al soltarla
    (RELEASE s después): el gesto se ve y se siente.
  - Vuelan con la velocidad del jugador sumada; caen con gravedad y rebotan en el suelo y en los
    colisionadores del mapa (perdiendo velocidad), hasta detenerse.
  - Cuatro tipos (GRENADE_TYPES):
      frag   · fragmentación: explota a los `fuse` s; daño que baja con la distancia.
      fire   · incendiaria: se rompe al tocar el suelo y deja fuego `burn` s (daño por segundo).
      stun   · aturdidora: destello que frena a los enemigos cercanos `stun` s (sin daño).
      decoy  · señuelo: al caer pita y atrae a la horda; al final explota.
  - El daño no atraviesa paredes: el modo lo aplica con losFn(objetivo) (línea de visión desde la
    explosión). Hooks del modo: onExplosion(punto, radio, los, { damageAt, type }),
    onFireTick(punto, radio, daño, los), onStun(punto, radio, segundos, los), setDecoy(punto | null).
  - Inventario: mode.grenadeBag = { frag, fire, stun, decoy } (cantidades) o, en los modos que solo
    dan granadas de fragmentación, mode.grenades = cantidad.
  Física pura en stepGrenade (probada en tests/grenades.test.js).
*/

export const GRENADE = {
  fuse: 1.6, // s
  speed: 15, // m/s del lanzamiento
  lift: 3.2, // m/s hacia arriba extra
  gravity: 16, // m/s² (algo más que la real: el arco se siente ágil)
  restitution: 0.38, // rebote
  friction: 0.62, // velocidad horizontal que conserva al tocar el suelo
  radius: 6.5, // m de daño
  damage: 420, // en el centro
  shakeRange: 22, // m: más lejos, no sacude la cámara
  cooldown: 0.8, // s entre lanzamientos
  propImpulse: 90, // N·s en el centro sobre la utilería con física (una caja salta, una lata vuela lejos)
};
const RELEASE = 0.16; // s entre pulsar y que la granada salga de la mano
const BALL = 0.07; // radio físico de la granada (m)
const VISUAL = 1.35; // se dibujan algo más grandes: en vuelo se ven

export const GRENADE_TYPES = {
  frag: { name: 'Fragmentación', fuse: GRENADE.fuse, radius: GRENADE.radius, damage: GRENADE.damage },
  fire: { name: 'Incendiaria', fuse: 3, impact: true, radius: 4.2, burn: 6, dps: 75 },
  stun: { name: 'Aturdidora', fuse: 1.3, radius: 9, stun: 4.5 },
  decoy: { name: 'Señuelo', fuse: 6, radius: 4.5, damage: 320, lure: true },
};
export const GRENADE_ORDER = ['frag', 'fire', 'stun', 'decoy'];

/**
 * Integra un paso de la granada contra el suelo (y = groundY) y cajas sólidas (Box3).
 * Muta pos y vel. Devuelve true si rebotó con fuerza (para el sonido).
 */
export function stepGrenade(pos, vel, dt, colliders = [], groundY = 0) {
  vel.y -= GRENADE.gravity * dt;
  pos.addScaledVector(vel, dt);
  let bounced = false;
  if (pos.y < groundY + BALL) {
    pos.y = groundY + BALL;
    if (vel.y < 0) {
      bounced = vel.y < -2;
      vel.y = -vel.y * GRENADE.restitution;
      vel.x *= GRENADE.friction;
      vel.z *= GRENADE.friction;
      if (Math.abs(vel.y) < 0.6) vel.y = 0;
    }
  }
  for (const b of colliders) {
    if (pos.x < b.min.x - BALL || pos.x > b.max.x + BALL || pos.y < b.min.y - BALL || pos.y > b.max.y + BALL || pos.z < b.min.z - BALL || pos.z > b.max.z + BALL) continue;
    // Sale por la cara más cercana y refleja esa componente.
    const pens = [
      ['x', b.min.x - BALL - pos.x, -1], ['x', b.max.x + BALL - pos.x, 1],
      ['y', b.min.y - BALL - pos.y, -1], ['y', b.max.y + BALL - pos.y, 1],
      ['z', b.min.z - BALL - pos.z, -1], ['z', b.max.z + BALL - pos.z, 1],
    ];
    let best = pens[0];
    for (const p of pens) if (Math.abs(p[1]) < Math.abs(best[1])) best = p;
    const [axis, d, sign] = best;
    pos[axis] += d;
    if (vel[axis] * sign < 0) {
      bounced ||= Math.abs(vel[axis]) > 2;
      vel[axis] = -vel[axis] * GRENADE.restitution;
      if (axis === 'y') {
        vel.x *= GRENADE.friction;
        vel.z *= GRENADE.friction;
      }
    }
  }
  return bounced;
}

/** Daño de la explosión a `dist` metros (lineal, 0 fuera del radio). */
export function explosionDamage(dist, radius = GRENADE.radius, damage = GRENADE.damage) {
  return dist >= radius ? 0 : Math.round(damage * (1 - dist / radius));
}

// --- Aspecto de cada tipo (en vuelo y en la mano) ------------------------------------------------
const std = (color, roughness = 0.5, metalness = 0.4, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
const LOOK = {
  body: { frag: std('#3a4a35', 0.55, 0.4), fire: std('#5a3a1c', 0.15, 0.1, { transparent: true, opacity: 0.85 }), stun: std('#7a8088', 0.35, 0.8), decoy: std('#25282c', 0.5, 0.6) },
  light: { frag: glow('#ffb54d'), fire: glow('#ff8a2a'), stun: glow('#6ad3ff'), decoy: glow('#ff3b2f') },
};
const sphere = new THREE.SphereGeometry(BALL, 12, 9);
const can = new THREE.CylinderGeometry(BALL * 0.5, BALL * 0.5, BALL * 1.7, 12);
const bottle = new THREE.CylinderGeometry(BALL * 0.5, BALL * 0.55, BALL * 1.9, 10);
const neck = new THREE.CylinderGeometry(BALL * 0.18, BALL * 0.22, BALL * 0.8, 8);
const nub = new THREE.BoxGeometry(BALL * 0.42, BALL * 0.42, BALL * 0.42);
const band = new THREE.CylinderGeometry(BALL * 0.52, BALL * 0.52, BALL * 0.28, 12);

/** Malla de una granada del tipo dado (se usa en vuelo y en la mano del arma en pantalla). */
export function grenadeMesh(type = 'frag') {
  const g = new THREE.Group();
  const add = (geo, mat, y = 0, x = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, 0);
    m.castShadow = true;
    g.add(m);
    return m;
  };
  if (type === 'fire') {
    add(bottle, LOOK.body.fire);
    add(neck, LOOK.body.fire, BALL * 1.3);
    add(nub, LOOK.light.fire, BALL * 1.8); // trapo encendido
  } else if (type === 'stun') {
    add(can, LOOK.body.stun);
    add(band, LOOK.light.stun, BALL * 0.2);
    add(nub, LOOK.body.stun, BALL * 1.05, BALL * 0.25);
  } else if (type === 'decoy') {
    add(can, LOOK.body.decoy);
    g.userData.blink = add(nub, LOOK.light.decoy, BALL * 1.0);
  } else {
    add(sphere, LOOK.body.frag);
    add(nub, LOOK.light.frag, BALL); // espoleta
  }
  return g;
}

const blastGeo = new THREE.SphereGeometry(1, 16, 12);
const fireDisc = new THREE.CircleGeometry(1, 28);
const flameGeo = new THREE.ConeGeometry(0.22, 0.8, 6);
const _v = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

export class Grenades {
  constructor(game) {
    this.game = game;
    this.active = []; // { mesh, vel, t, type, landed }
    this.blasts = []; // { mesh, t, life, grow }
    this.fires = []; // { pos, t, radius, group, flames }
    this.decoy = null; // granada señuelo activa
    this.pending = null; // lanzamiento en curso (la granada aún está en la mano)
    this.cooldown = 0;
    this.type = 'frag';
    this.root = new THREE.Group();
    this.shake = 0;
  }

  attach(scene) {
    this.root.removeFromParent();
    scene.add(this.root);
  }

  // --- Inventario del modo ---------------------------------------------------------------------
  count(type = this.type) {
    const m = this.game.mode;
    if (!m) return 0;
    if (m.grenadeBag) return m.grenadeBag[type] ?? 0;
    return type === 'frag' ? m.grenades ?? 0 : 0;
  }

  spend(type) {
    const m = this.game.mode;
    if (m.grenadeBag) m.grenadeBag[type]--;
    else m.grenades--;
  }

  get busy() {
    return !!this.pending;
  }

  get allowed() {
    const m = this.game.mode;
    return !!m?.grenadesAllowed?.() && this.game.playing && GRENADE_ORDER.some((t) => this.count(t) > 0);
  }

  // Siguiente tipo que tengas (Q). Devuelve el tipo elegido o null si no hay otro.
  cycleType() {
    const m = this.game.mode;
    if (!m?.grenadesAllowed?.()) return null;
    if (!m.grenadeBag) {
      this.game.hud?.flash?.('Aquí solo hay granadas de fragmentación', 'info');
      return null;
    }
    const i = GRENADE_ORDER.indexOf(this.type);
    for (let k = 1; k <= GRENADE_ORDER.length; k++) {
      const t = GRENADE_ORDER[(i + k) % GRENADE_ORDER.length];
      if (this.count(t) > 0 || k === GRENADE_ORDER.length) {
        this.type = t;
        this.game.hud?.flash?.(`Granada: ${GRENADE_TYPES[t].name} ×${this.count(t)}`, 'info');
        return t;
      }
    }
    return null;
  }

  throw() {
    const g = this.game;
    if (!this.allowed || this.cooldown > 0 || this.pending || g.melee?.busy) return false;
    // Sin granadas del tipo elegido: la siguiente que tengas.
    if (this.count(this.type) <= 0) this.type = GRENADE_ORDER.find((t) => this.count(t) > 0);
    const type = this.type;
    this.spend(type);
    this.cooldown = GRENADE.cooldown;
    this.pending = { t: 0, type };
    g.weapon?.cancelReload?.();
    g.sfx.throwGrenade();
    if (g.viewmodel.throwGrenade) g.viewmodel.throwGrenade(type, 0.5);
    else g.viewmodel.melee?.(0.4); // el arma baja un instante (gesto de lanzar)
    g.mode.onGrenadeThrown?.(type);
    return true;
  }

  // La granada sale de la mano: aparece delante de la cámara con la velocidad del lanzamiento.
  release(type) {
    const g = this.game;
    const cam = g.engine.camera;
    const dir = _v.set(0, 0.12, -1).applyQuaternion(cam.quaternion).normalize();
    const mesh = grenadeMesh(type);
    mesh.scale.setScalar(VISUAL);
    mesh.position.copy(cam.position).addScaledVector(dir, 0.45);
    mesh.position.y -= 0.12;
    const vel = dir.clone().multiplyScalar(GRENADE.speed * (type === 'fire' ? 0.9 : 1));
    vel.y += GRENADE.lift;
    if (g.player.velocity) vel.add(g.player.velocity);
    this.root.add(mesh);
    // La mecha cuenta desde que se pulsó (t parte en RELEASE): explota a los `fuse` s del lanzamiento.
    this.active.push({ mesh, vel, t: RELEASE, type, landed: false, trailT: 0, spin: new THREE.Vector3(Math.random() * 8, Math.random() * 8, 0) });
  }

  update(dt) {
    const g = this.game;
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.pending && (this.pending.t += dt) >= RELEASE) {
      const { type } = this.pending;
      this.pending = null;
      this.release(type);
    }
    const colliders = g.world?.colliders ?? [];
    const groundY = g.world?.groundY ?? 0;
    for (let i = this.active.length - 1; i >= 0; i--) {
      const n = this.active[i];
      const cfg = GRENADE_TYPES[n.type];
      n.t += dt;
      // Subpasos: a 15 m/s una granada no atraviesa un muro fino entre cuadros.
      const steps = Math.max(1, Math.ceil((n.vel.length() * dt) / 0.2));
      let touched = false;
      for (let s = 0; s < steps; s++) {
        const { x, y, z } = n.vel;
        if (stepGrenade(n.mesh.position, n.vel, dt / steps, colliders, groundY)) g.sfx.bounce(g.panFor(n.mesh.position));
        // Tocó algo (suelo, muro o techo) si la velocidad cambió más allá de la gravedad.
        if (n.vel.x !== x || n.vel.z !== z || n.vel.y !== y - GRENADE.gravity * (dt / steps)) touched = true;
      }
      const speed = n.vel.length();
      n.mesh.rotation.x += n.spin.x * dt * Math.min(1, speed / 4);
      n.mesh.rotation.y += n.spin.y * dt * Math.min(1, speed / 4);
      // Estela tenue mientras vuela (se sigue con la vista).
      if (speed > 3 && (n.trailT -= dt) <= 0) {
        n.trailT = 0.035;
        g.effects.burst?.(n.mesh.position, UP, n.type === 'fire' ? '#ff9a4a' : '#9aa0a8', 1, 0.3);
      }
      // Señuelo: cuando se detiene, empieza a atraer a la horda.
      if (cfg.lure && !n.landed && speed < 0.4) {
        n.landed = true;
        this.decoy = n;
        g.mode?.setDecoy?.(n.mesh.position);
      }
      if (cfg.lure && n.landed) {
        const blink = n.mesh.userData.blink;
        const on = Math.floor(n.t * 4) % 2 === 0;
        if (blink) blink.visible = on;
        if (on && !n.beeped) g.sfx.decoyBeep?.(g.panFor(n.mesh.position));
        n.beeped = on;
      }
      const ignite = cfg.impact && n.t > RELEASE + 0.05 && (touched || n.mesh.position.y <= groundY + BALL + 0.002);
      if (ignite || n.t >= cfg.fuse) {
        this.detonate(n.type, n.mesh.position.clone());
        if (this.decoy === n) {
          this.decoy = null;
          g.mode?.setDecoy?.(null);
        }
        n.mesh.removeFromParent();
        this.active.splice(i, 1);
      }
    }
    this.updateBlasts(dt);
    this.updateFires(dt);
    this.shake = Math.max(0, this.shake - dt * 2.5);
  }

  updateBlasts(dt) {
    for (let i = this.blasts.length - 1; i >= 0; i--) {
      const b = this.blasts[i];
      b.t += dt;
      const k = b.t / b.life;
      b.mesh.scale.setScalar(0.5 + k * b.grow);
      b.mesh.material.opacity = Math.max(0, 1 - k);
      if (k >= 1) {
        b.mesh.removeFromParent();
        b.mesh.material.dispose();
        this.blasts.splice(i, 1);
      }
    }
  }

  // Fuego de la incendiaria: daño por segundo dentro del radio y llamas que se apagan al final.
  updateFires(dt) {
    const g = this.game;
    for (let i = this.fires.length - 1; i >= 0; i--) {
      const f = this.fires[i];
      f.t += dt;
      const cfg = GRENADE_TYPES.fire;
      const left = cfg.burn - f.t;
      const fade = Math.min(1, left / 1.2, f.t / 0.25);
      f.disc.material.opacity = 0.55 * fade * (0.85 + 0.15 * Math.sin(f.t * 17));
      f.flames.forEach((m, k) => {
        const s = (0.7 + 0.4 * Math.sin(f.t * (9 + k * 2.3) + k)) * fade;
        m.scale.set(1, Math.max(0.01, s), 1);
        m.position.y = f.pos.y + 0.4 * s;
      });
      if ((f.emberT -= dt) <= 0) {
        f.emberT = 0.08;
        _v.set(f.pos.x + (Math.random() - 0.5) * f.radius, f.pos.y + 0.1, f.pos.z + (Math.random() - 0.5) * f.radius);
        g.effects.burst?.(_v, UP, Math.random() < 0.5 ? '#ff8a2a' : '#ffd166', 2, 2.2);
      }
      if (left > 0) g.mode?.onFireTick?.(f.pos, f.radius, cfg.dps * dt, (target) => g.ballistics.lineOfSight(_v.copy(f.pos).setY(f.pos.y + 0.4), target));
      else {
        f.group.removeFromParent();
        f.disc.material.dispose();
        this.fires.splice(i, 1);
      }
    }
  }

  detonate(type, point) {
    if (type === 'fire') return this.ignite(point);
    if (type === 'stun') return this.stunBlast(point);
    const cfg = GRENADE_TYPES[type];
    return this.explode(point, { radius: cfg.radius, damage: cfg.damage, type });
  }

  explode(point, { radius = GRENADE.radius, damage = GRENADE.damage, type = 'frag' } = {}) {
    const g = this.game;
    this.flash(point, '#ffc47a', 2.2, 0.45, radius * 0.55);
    g.effects.burst(point, _v.set(0, 1, 0), '#ffb26b', 26, 9);
    g.effects.burst(point, _v.set(0, 1, 0), '#3b3b3b', 18, 5);
    g.effects.decal?.(point.clone().setY(0.02), _v.set(0, 1, 0));
    const dist = point.distanceTo(g.engine.camera.position);
    g.sfx.explosion(dist, g.panFor(point));
    if (dist < GRENADE.shakeRange) this.shake = Math.max(this.shake, 1 - dist / GRENADE.shakeRange);
    const damageAt = (d) => explosionDamage(d, radius, damage);
    g.mode?.onExplosion?.(point, radius, (target) => g.ballistics.lineOfSight(point.clone().setY(point.y + 0.3), target), { damageAt, type });
    g.world?.props?.explode(point, radius * 1.3, GRENADE.propImpulse * (damage / GRENADE.damage));
  }

  ignite(point) {
    const g = this.game;
    const cfg = GRENADE_TYPES.fire;
    const pos = point.clone().setY((g.world?.groundY ?? 0) + 0.03);
    const group = new THREE.Group();
    const disc = new THREE.Mesh(fireDisc, new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff7a2a').multiplyScalar(1.6), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    disc.rotation.x = -Math.PI / 2;
    disc.position.copy(pos);
    disc.scale.setScalar(cfg.radius);
    group.add(disc);
    const flames = [];
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2 + Math.random() * 0.5;
      const r = (k === 0 ? 0 : 0.35 + Math.random() * 0.55) * cfg.radius;
      const m = new THREE.Mesh(flameGeo, LOOK.light.fire);
      m.position.set(pos.x + Math.cos(a) * r, pos.y, pos.z + Math.sin(a) * r);
      m.scale.setScalar(0.01);
      group.add(m);
      flames.push(m);
    }
    this.root.add(group);
    this.fires.push({ pos, t: 0, radius: cfg.radius, group, disc, flames, emberT: 0 });
    g.effects.burst(pos, UP, '#ff9a4a', 22, 5);
    g.sfx.ignite?.(point.distanceTo(g.engine.camera.position), g.panFor(point));
  }

  stunBlast(point) {
    const g = this.game;
    const cfg = GRENADE_TYPES.stun;
    this.flash(point, '#e8f6ff', 3, 0.35, cfg.radius * 0.5);
    g.effects.burst(point, UP, '#cfeaff', 20, 7);
    const dist = point.distanceTo(g.engine.camera.position);
    g.sfx.stunBang?.(dist, g.panFor(point));
    if (dist < 7) g.hud?.whiteout?.(1 - dist / 7); // destello en pantalla si estás cerca
    g.mode?.onStun?.(point, cfg.radius, cfg.stun, (target) => g.ballistics.lineOfSight(point.clone().setY(point.y + 0.3), target));
  }

  flash(point, color, boost, life, grow) {
    const mesh = new THREE.Mesh(blastGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(boost), transparent: true, depthWrite: false, toneMapped: false }));
    mesh.position.copy(point);
    this.root.add(mesh);
    this.blasts.push({ mesh, t: 0, life, grow });
  }

  // Desplazamiento de cámara de la sacudida (lo aplica Game sobre la mirada).
  shakeOffset(time) {
    if (this.shake <= 0) return 0;
    return Math.sin(time * 60) * 0.012 * this.shake;
  }

  clear() {
    for (const n of this.active) n.mesh.removeFromParent();
    for (const b of this.blasts) {
      b.mesh.removeFromParent();
      b.mesh.material.dispose(); // cada destello tiene su material (la opacidad es propia)
    }
    for (const f of this.fires) {
      f.group.removeFromParent();
      f.disc.material.dispose();
    }
    if (this.decoy) this.game.mode?.setDecoy?.(null);
    this.active.length = 0;
    this.blasts.length = 0;
    this.fires.length = 0;
    this.decoy = null;
    this.pending = null;
    this.shake = 0;
    this.cooldown = 0;
  }
}
