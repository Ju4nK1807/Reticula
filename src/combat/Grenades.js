import * as THREE from 'three';
import { glow } from '../gfx/surfaces.js';

/*
  Granadas de fragmentación (tecla G o botón táctil).

  - Se lanzan desde la cámara con la velocidad del jugador sumada; caen con gravedad y rebotan en el
    suelo y en los colisionadores del mapa (perdiendo velocidad), hasta detenerse.
  - Explotan a los FUSE segundos: destello, partículas, sonido con paneo y sacudida de cámara según la
    distancia. El daño baja con la distancia (explosionDamage: lineal hasta RADIUS) y no atraviesa
    paredes: el modo lo aplica en mode.onExplosion(punto, radio, losFn), donde losFn(objetivo) dice si
    hay línea de visión desde la explosión.
  - Solo en los modos que las dan (mode.grenadesAllowed() y mode.grenades = cantidad).
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
};
const BALL = 0.07; // radio de la granada (m)

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
export function explosionDamage(dist) {
  return dist >= GRENADE.radius ? 0 : Math.round(GRENADE.damage * (1 - dist / GRENADE.radius));
}

const geo = new THREE.SphereGeometry(BALL, 10, 8);
const mat = new THREE.MeshStandardMaterial({ color: '#3a4a35', roughness: 0.55, metalness: 0.4 });
const pinMat = glow('#ffb54d');
const pinGeo = new THREE.BoxGeometry(0.03, 0.03, 0.03);
const blastGeo = new THREE.SphereGeometry(1, 16, 12);
const _v = new THREE.Vector3();

export class Grenades {
  constructor(game) {
    this.game = game;
    this.active = []; // { mesh, vel, t }
    this.blasts = []; // { mesh, t }
    this.cooldown = 0;
    this.root = new THREE.Group();
    this.shake = 0;
  }

  attach(scene) {
    this.root.removeFromParent();
    scene.add(this.root);
  }

  get allowed() {
    const m = this.game.mode;
    return !!m?.grenadesAllowed?.() && this.game.playing && (m.grenades ?? 0) > 0;
  }

  throw() {
    const g = this.game;
    if (!this.allowed || this.cooldown > 0 || g.melee?.busy) return false;
    g.mode.grenades--;
    this.cooldown = GRENADE.cooldown;
    const cam = g.engine.camera;
    const dir = _v.set(0, 0.12, -1).applyQuaternion(cam.quaternion).normalize();
    const mesh = new THREE.Mesh(geo, mat);
    const pin = new THREE.Mesh(pinGeo, pinMat);
    pin.position.y = BALL;
    mesh.add(pin);
    mesh.castShadow = true;
    mesh.position.copy(cam.position).addScaledVector(dir, 0.45);
    mesh.position.y -= 0.12;
    const vel = dir.clone().multiplyScalar(GRENADE.speed);
    vel.y += GRENADE.lift;
    if (g.player.velocity) vel.add(g.player.velocity);
    this.root.add(mesh);
    this.active.push({ mesh, vel, t: 0, spin: new THREE.Vector3(Math.random() * 8, Math.random() * 8, 0) });
    g.sfx.throwGrenade();
    g.viewmodel.melee?.(0.4); // el arma baja un instante (gesto de lanzar)
    g.mode.onGrenadeThrown?.();
    return true;
  }

  update(dt) {
    const g = this.game;
    this.cooldown = Math.max(0, this.cooldown - dt);
    const colliders = g.world?.colliders ?? [];
    for (let i = this.active.length - 1; i >= 0; i--) {
      const n = this.active[i];
      n.t += dt;
      // Subpasos: a 15 m/s una granada no atraviesa un muro fino entre cuadros.
      const steps = Math.max(1, Math.ceil((n.vel.length() * dt) / 0.2));
      for (let s = 0; s < steps; s++) {
        if (stepGrenade(n.mesh.position, n.vel, dt / steps, colliders)) g.sfx.bounce(g.panFor(n.mesh.position));
      }
      n.mesh.rotation.x += n.spin.x * dt * Math.min(1, n.vel.length() / 4);
      n.mesh.rotation.y += n.spin.y * dt * Math.min(1, n.vel.length() / 4);
      if (n.t >= GRENADE.fuse) {
        this.explode(n.mesh.position.clone());
        n.mesh.removeFromParent();
        this.active.splice(i, 1);
      }
    }
    for (let i = this.blasts.length - 1; i >= 0; i--) {
      const b = this.blasts[i];
      b.t += dt;
      const k = b.t / 0.45;
      b.mesh.scale.setScalar(0.5 + k * GRENADE.radius * 0.55);
      b.mesh.material.opacity = Math.max(0, 1 - k);
      if (k >= 1) {
        b.mesh.removeFromParent();
        b.mesh.material.dispose();
        this.blasts.splice(i, 1);
      }
    }
    this.shake = Math.max(0, this.shake - dt * 2.5);
  }

  explode(point) {
    const g = this.game;
    const flash = new THREE.Mesh(blastGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffc47a').multiplyScalar(2.2), transparent: true, depthWrite: false, toneMapped: false }));
    flash.position.copy(point);
    this.root.add(flash);
    this.blasts.push({ mesh: flash, t: 0 });
    g.effects.burst(point, _v.set(0, 1, 0), '#ffb26b', 26, 9);
    g.effects.burst(point, _v.set(0, 1, 0), '#3b3b3b', 18, 5);
    g.effects.decal?.(point.clone().setY(0.02), _v.set(0, 1, 0));
    const dist = point.distanceTo(g.engine.camera.position);
    g.sfx.explosion(dist, g.panFor(point));
    if (dist < GRENADE.shakeRange) this.shake = Math.max(this.shake, 1 - dist / GRENADE.shakeRange);
    g.mode?.onExplosion?.(point, GRENADE.radius, (target) => g.ballistics.lineOfSight(point.clone().setY(point.y + 0.3), target));
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
    this.active.length = 0;
    this.blasts.length = 0;
    this.shake = 0;
    this.cooldown = 0;
  }
}
