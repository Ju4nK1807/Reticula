import * as THREE from 'three';
import { haloTexture } from '../gfx/canvasTextures.js';

/*
  Chispas con física (soldadura, metal golpeado, fuego): un solo THREE.Points con una reserva fija de
  partículas, una llamada de dibujo. Cada chispa sale con velocidad aleatoria dentro de un cono, cae
  con gravedad, rebota apagándose contra el suelo y se desvanece (color de blanco a naranja).
*/

const GRAVITY = 9.8;
const DRAG = 1.6; // 1/s: frenado del aire
const BOUNCE = 0.35;
const _dir = new THREE.Vector3();

export class Sparks {
  /** @param {{ count?: number, size?: number, groundY?: number }} [opts] */
  constructor({ count = 96, size = 0.05, groundY = 0 } = {}) {
    this.count = count;
    this.groundY = groundY;
    this.pos = new Float32Array(count * 3);
    this.col = new Float32Array(count * 3);
    this.vel = new Float32Array(count * 3);
    this.life = new Float32Array(count); // s que le quedan (0 = libre)
    this.maxLife = new Float32Array(count);
    this.next = 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.points = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        size,
        map: haloTexture(),
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    );
    this.points.frustumCulled = false;
    this.points.userData.dynamic = true;
    // Las libres quedan lejos (debajo del suelo) y negras: no se ven.
    for (let i = 0; i < count; i++) this.pos[i * 3 + 1] = -100;
    this.alive = 0;
  }

  /**
   * Lanza n chispas desde `origin` hacia `dir` (normalizado) con una apertura `spread` (rad).
   * @param {THREE.Vector3} origin @param {THREE.Vector3} dir
   */
  burst(origin, dir, n = 18, { speed = [1.5, 4.5], spread = 0.9, life = [0.35, 0.9] } = {}) {
    for (let k = 0; k < n; k++) {
      const i = this.next;
      this.next = (this.next + 1) % this.count;
      // Dirección aleatoria dentro del cono alrededor de `dir`.
      _dir.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize();
      _dir.multiplyScalar(Math.sin(spread) * Math.random()).add(dir).normalize();
      const v = speed[0] + Math.random() * (speed[1] - speed[0]);
      this.pos.set([origin.x, origin.y, origin.z], i * 3);
      this.vel.set([_dir.x * v, _dir.y * v, _dir.z * v], i * 3);
      const l = life[0] + Math.random() * (life[1] - life[0]);
      this.life[i] = l;
      this.maxLife[i] = l;
    }
  }

  update(dt) {
    const { pos, vel, col, life, maxLife } = this;
    let alive = 0;
    const drag = Math.exp(-DRAG * dt);
    for (let i = 0; i < this.count; i++) {
      if (life[i] <= 0) continue;
      life[i] -= dt;
      const j = i * 3;
      if (life[i] <= 0) {
        pos[j + 1] = -100;
        col[j] = col[j + 1] = col[j + 2] = 0;
        continue;
      }
      alive++;
      vel[j + 1] -= GRAVITY * dt;
      vel[j] *= drag;
      vel[j + 1] *= drag;
      vel[j + 2] *= drag;
      pos[j] += vel[j] * dt;
      pos[j + 1] += vel[j + 1] * dt;
      pos[j + 2] += vel[j + 2] * dt;
      if (pos[j + 1] < this.groundY && vel[j + 1] < 0) {
        pos[j + 1] = this.groundY;
        vel[j + 1] *= -BOUNCE;
        vel[j] *= 0.6;
        vel[j + 2] *= 0.6;
      }
      // Blanco amarillento al nacer → naranja → rojo apagado.
      const k = life[i] / maxLife[i];
      col[j] = 1.6 * k + 0.4;
      col[j + 1] = 1.25 * k * k + 0.12;
      col[j + 2] = 0.55 * k * k * k;
    }
    this.alive = alive;
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = alive > 0 || this.wasAlive;
    g.attributes.color.needsUpdate = alive > 0 || this.wasAlive;
    this.wasAlive = alive > 0;
  }

  dispose() {
    this.points.removeFromParent();
    this.points.geometry.dispose();
    this.points.material.dispose();
  }
}
