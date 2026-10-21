import * as THREE from 'three';
import { degPerCount } from '../config/sensitivity.js';
import { DEG, clamp } from '../utils/math.js';

const PITCH_LIMIT = 89 * DEG;
const RADIUS = 0.32;
const EYE_STAND = 1.62;
const EYE_CROUCH = 1.12;
const HEIGHT_STAND = 1.8;
const HEIGHT_CROUCH = 1.3;
const SPEED_RUN = 5.4; // m/s, similar a los shooters tácticos
const SPEED_WALK = 2.6;
const SPEED_CROUCH = 1.9;
const JUMP_VELOCITY = 5.0;
const GRAVITY = 16;

const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _wish = new THREE.Vector3();

// Jugador en primera persona: mirada (yaw/pitch en radianes) + movimiento WASD con colisiones.
// Controles: WASD mover · Shift caminar · C agacharse · Espacio saltar.
export class PlayerController {
  constructor(camera, input) {
    this.camera = camera;
    this.input = input;
    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.crouch = 0; // 0 de pie, 1 agachado (suavizado)
    this.onGround = true;
    this.movementEnabled = true;
    this.radPerCount = degPerCount('reticula', 1.25) * DEG;
    this.invertY = false;
    this.world = null;
    this.mouseDelta = { dx: 0, dy: 0 };
  }

  configure(sens) {
    this.radPerCount = degPerCount(sens.game, sens.value) * DEG;
    this.invertY = !!sens.invertY;
  }

  setWorld(world) {
    this.world = world;
  }

  reset(position, yaw = 0, pitch = 0) {
    this.position.copy(position);
    this.velocity.set(0, 0, 0);
    this.crouch = 0;
    this.onGround = true;
    this.look(yaw, pitch);
  }

  get eyeHeight() {
    return EYE_STAND + (EYE_CROUCH - EYE_STAND) * this.crouch;
  }

  get eye() {
    return this.camera.position;
  }

  get horizontalSpeed() {
    return Math.hypot(this.velocity.x, this.velocity.z);
  }

  get maxSpeed() {
    return SPEED_RUN;
  }

  // Desviación (grados) al disparar: quieto = 0, corriendo o en el aire = mucha.
  get inaccuracy() {
    if (!this.onGround) return 6;
    const s = this.horizontalSpeed;
    if (s <= 1.5) return 0;
    return ((s - 1.5) / (SPEED_RUN - 1.5)) * 4.5 * (1 - 0.25 * this.crouch);
  }

  // `active`: el mouse está capturado y el juego no está en pausa.
  update(dt, active) {
    this.mouseDelta = this.input.consumeMouse();
    if (active) {
      const { dx, dy } = this.mouseDelta;
      this.yaw -= dx * this.radPerCount;
      this.pitch -= dy * this.radPerCount * (this.invertY ? -1 : 1);
      this.pitch = clamp(this.pitch, -PITCH_LIMIT, PITCH_LIMIT);
    }
    if (this.world) this.move(dt, active && this.movementEnabled);
    this.apply();
  }

  move(dt, active) {
    const keys = this.input;
    const crouching = active && keys.isDown('KeyC');
    this.crouch += ((crouching ? 1 : 0) - this.crouch) * Math.min(1, dt * 12);

    _wish.set(0, 0, 0);
    if (active) {
      _fwd.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
      _right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
      const f = (keys.isDown('KeyW') ? 1 : 0) - (keys.isDown('KeyS') ? 1 : 0);
      const r = (keys.isDown('KeyD') ? 1 : 0) - (keys.isDown('KeyA') ? 1 : 0);
      _wish.addScaledVector(_fwd, f).addScaledVector(_right, r);
      if (_wish.lengthSq() > 0) _wish.normalize();
    }

    const max = crouching ? SPEED_CROUCH : active && keys.isDown('ShiftLeft') ? SPEED_WALK : SPEED_RUN;
    // En el suelo la velocidad responde rápido (frenar es casi instantáneo, como el counter-strafe);
    // en el aire hay poco control.
    const response = this.onGround ? (_wish.lengthSq() > 0 ? 11 : 16) : 1.5;
    const k = Math.min(1, dt * response);
    this.velocity.x += (_wish.x * max - this.velocity.x) * k;
    this.velocity.z += (_wish.z * max - this.velocity.z) * k;

    if (active && this.onGround && keys.isDown('Space')) {
      this.velocity.y = JUMP_VELOCITY;
      this.onGround = false;
    }
    this.velocity.y -= GRAVITY * dt;

    const p = this.position;
    p.x += this.velocity.x * dt;
    p.z += this.velocity.z * dt;
    p.y += this.velocity.y * dt;
    if (p.y <= 0) {
      p.y = 0;
      this.velocity.y = 0;
      this.onGround = true;
    }

    const height = HEIGHT_STAND + (HEIGHT_CROUCH - HEIGHT_STAND) * this.crouch;
    this.collide(this.world.colliders, height);
    this.collide(this.world.playerBlockers, height);
    const z = this.world.playerZone;
    p.x = clamp(p.x, z.minX, z.maxX);
    p.z = clamp(p.z, z.minZ, z.maxZ);
  }

  // Empuja al jugador (círculo en XZ) fuera de cada caja que se solape en altura.
  collide(boxes, height) {
    const p = this.position;
    for (const b of boxes) {
      if (b.max.y <= p.y + 0.01 || b.min.y >= p.y + height) continue;
      const cx = clamp(p.x, b.min.x, b.max.x);
      const cz = clamp(p.z, b.min.z, b.max.z);
      const dx = p.x - cx;
      const dz = p.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= RADIUS * RADIUS) continue;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        p.x += (dx / d) * (RADIUS - d);
        p.z += (dz / d) * (RADIUS - d);
      } else {
        // Centro dentro de la caja: salir por el lado más cercano.
        const exits = [
          [b.min.x - RADIUS - p.x, 0],
          [b.max.x + RADIUS - p.x, 0],
          [0, b.min.z - RADIUS - p.z],
          [0, b.max.z + RADIUS - p.z],
        ];
        exits.sort((a, c) => Math.abs(a[0] + a[1]) - Math.abs(c[0] + c[1]));
        p.x += exits[0][0];
        p.z += exits[0][1];
      }
    }
  }

  look(yaw, pitch) {
    this.yaw = yaw;
    this.pitch = clamp(pitch, -PITCH_LIMIT, PITCH_LIMIT);
    this.apply();
  }

  apply() {
    this.camera.position.set(this.position.x, this.position.y + this.eyeHeight, this.position.z);
    this.camera.rotation.set(this.pitch, this.yaw, 0);
  }
}
