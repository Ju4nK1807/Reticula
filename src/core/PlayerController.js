import * as THREE from 'three';
import { pushCircleOut } from '../physics/obb.js';
import { degPerCount } from '../config/sensitivity.js';
import { DEFAULT_KEYS } from '../config/keybinds.js';
import { DEG, clamp } from '../utils/math.js';

const PITCH_LIMIT = 89 * DEG;
const RADIUS = 0.32;
const EYE_STAND = 1.62;
const EYE_CROUCH = 1.12;
const HEIGHT_STAND = 1.8;
const HEIGHT_CROUCH = 1.3;
const SPEED_RUN = 5.4; // m/s, similar a los shooters tácticos
const SPEED_SPRINT = 7.6; // manteniendo la tecla de correr (Shift), solo hacia delante
const SPEED_WALK = 2.6;
const SPEED_CROUCH = 1.9;
const JUMP_VELOCITY = 5.0;
const GRAVITY = 16;

const NO_BODIES = [];

const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _wish = new THREE.Vector3();

// Jugador en primera persona: mirada (yaw/pitch en radianes) + movimiento WASD con colisiones.
// Controles (reasignables): WASD mover · Shift correr · Z caminar · C agacharse · Espacio saltar.
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
    this.sprinting = false;
    this.movementEnabled = true;
    this.radPerCount = degPerCount('reticula', 1.25) * DEG;
    this.sensScale = 1; // con mira telescópica la sensibilidad baja en proporción al zoom
    this.speedScale = 1; // multiplicador de velocidad (apuntar)
    this.perkSpeed = 1; // multiplicador de velocidad de las bebidas del modo zombi ("Pies ligeros")
    this.invertY = false;
    this.world = null;
    // Cuerpos móviles que bloquean al jugador (bots vivos): [{ x, z, r, y0, h }]. Los aporta el modo.
    this.bodies = NO_BODIES;
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
      const k = this.radPerCount * this.sensScale;
      this.yaw -= dx * k;
      this.pitch -= dy * k * (this.invertY ? -1 : 1);
      this.pitch = clamp(this.pitch, -PITCH_LIMIT, PITCH_LIMIT);
    }
    if (this.world) this.move(dt, active && this.movementEnabled);
    this.apply();
  }

  move(dt, active) {
    const keys = this.input;
    // Teclas reasignables (config/keybinds.js); una entrada sin acciones (pruebas) usa las de siempre.
    const down = (id) => (keys.isAction ? keys.isAction(id) : keys.isDown(DEFAULT_KEYS[id]));
    const crouching = active && down('crouch');
    this.crouch += ((crouching ? 1 : 0) - this.crouch) * Math.min(1, dt * 12);

    _wish.set(0, 0, 0);
    let f = 0;
    if (active) {
      _fwd.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
      _right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
      // Teclado (digital) + joystick táctil (analógico: inclinarlo poco = caminar más lento).
      const axis = keys.axis ?? { x: 0, y: 0 };
      f = (down('forward') ? 1 : 0) - (down('back') ? 1 : 0) + axis.y;
      const r = (down('right') ? 1 : 0) - (down('left') ? 1 : 0) + axis.x;
      _wish.addScaledVector(_fwd, f).addScaledVector(_right, r);
      if (_wish.lengthSq() > 1) _wish.normalize();
    }

    // Sprint (mantener Shift): solo avanzando, de pie, sin apuntar ni disparar. Disparar o apuntar lo
    // corta al instante, como en los shooters. En el aire conserva el impulso que traía.
    const wantSprint = active && down('sprint') && f > 0.3 && !crouching && this.speedScale >= 1 && !keys.mouseDown;
    this.sprinting = wantSprint && (this.onGround || this.sprinting);
    // speedScale: apuntar con las miras o con la mira telescópica obliga a caminar más lento.
    const base = crouching ? SPEED_CROUCH : active && down('walk') ? SPEED_WALK : this.sprinting ? SPEED_SPRINT : SPEED_RUN;
    const max = base * this.speedScale * this.perkSpeed;
    // En el suelo la velocidad responde rápido (frenar es casi instantáneo, como el counter-strafe);
    // en el aire hay poco control.
    const response = this.onGround ? (_wish.lengthSq() > 0 ? 11 : 16) : 1.5;
    const k = Math.min(1, dt * response);
    this.velocity.x += (_wish.x * max - this.velocity.x) * k;
    this.velocity.z += (_wish.z * max - this.velocity.z) * k;

    if (active && this.onGround && down('jump')) {
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
    // Primero los bots y después el mapa: si un bot empuja al jugador contra un muro, gana el muro.
    this.collideBodies(this.bodies, height);
    this.collide(this.world.colliders, height);
    this.collide(this.world.playerBlockers, height);
    const z = this.world.playerZone;
    p.x = clamp(p.x, z.minX, z.maxX);
    p.z = clamp(p.z, z.minZ, z.maxZ);
  }

  // Empuja al jugador (círculo en XZ) fuera de cada caja que se solape en altura.
  // (Las cajas giradas usan su forma real: physics/obb.js.)
  collide(boxes, height) {
    const p = this.position;
    for (const b of boxes) {
      if (b.max.y <= p.y + 0.01 || b.min.y >= p.y + height) continue;
      if (p.x + RADIUS < b.min.x || p.x - RADIUS > b.max.x || p.z + RADIUS < b.min.z || p.z - RADIUS > b.max.z) continue;
      const out = pushCircleOut(b, p.x, p.z, RADIUS);
      if (out) {
        p.x = out[0];
        p.z = out[1];
      }
    }
  }

  // Empuja al jugador fuera de cada cuerpo cilíndrico (bots) que se solape en altura.
  collideBodies(bodies, height) {
    const p = this.position;
    for (const b of bodies) {
      if (b.y0 >= p.y + height || b.y0 + b.h <= p.y + 0.01) continue;
      const dx = p.x - b.x;
      const dz = p.z - b.z;
      const min = RADIUS + b.r;
      const d2 = dx * dx + dz * dz;
      if (d2 >= min * min) continue;
      const d = Math.sqrt(d2);
      if (d > 1e-6) {
        p.x += (dx / d) * (min - d);
        p.z += (dz / d) * (min - d);
      } else {
        p.z += min; // exactamente en el centro: salir hacia atrás
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
