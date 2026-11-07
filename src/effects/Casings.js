import * as THREE from 'three';

/*
  Casquillos: cada disparo expulsa la vaina por la derecha del arma (la escopeta al accionar la corredera,
  el francotirador al abrir el cerrojo). Caen con gravedad, giran, rebotan en el suelo y en las cajas del
  mapa con su tintineo y quedan un rato en el piso.

  Dos InstancedMesh (latón y cartuchos rojos de escopeta): una llamada de dibujo para todos.
  Física de partícula con giro (no hace falta más para algo de 2 cm).
*/

// Calibre de cada arma: largo y radio (m), retraso de la expulsión (s) y tipo.
export const CASINGS = {
  pistol: { length: 0.019, radius: 0.0048, delay: 0, kind: 'brass' },
  smg: { length: 0.019, radius: 0.0048, delay: 0, kind: 'brass' },
  rifle: { length: 0.045, radius: 0.0048, delay: 0, kind: 'brass' },
  sniper: { length: 0.064, radius: 0.0062, delay: 0.62, kind: 'brass' },
  shotgun: { length: 0.07, radius: 0.0105, delay: 0.34, kind: 'shell' },
  magnum: null, // el revólver no expulsa vainas: quedan en el tambor
  burst: { length: 0.045, radius: 0.0048, delay: 0, kind: 'brass' },
  lmg: { length: 0.051, radius: 0.0052, delay: 0, kind: 'brass' },
  dmr: { length: 0.051, radius: 0.0052, delay: 0, kind: 'brass' },
};

const MAX = { brass: 64, shell: 16 };
const VISUAL = 1.6; // se dibujan algo más grandes que en la realidad: a 2 cm no se verían
const GRAVITY = 9.8;
const LIFE = 9; // s en el piso antes de desaparecer
const RESTITUTION = 0.38;
const SOUND_MIN = 0.9; // m/s: rebotes más suaves no suenan
const HEAR_DIST = 14; // m: más lejos no se oyen
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const _m = new THREE.Matrix4();
const _s = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _q = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);

/** Avanza un casquillo `dt` s contra el suelo (y = groundY) y cajas fijas. Devuelve la velocidad del rebote (0 si no rebotó). */
export function stepCasing(c, dt, colliders = [], groundY = 0) {
  c.vel.y -= GRAVITY * dt;
  c.pos.addScaledVector(c.vel, dt);
  c.angle += c.spin * dt;
  let impact = 0;
  const r = c.radius;
  if (c.pos.y < groundY + r) {
    c.pos.y = groundY + r;
    if (c.vel.y < 0) {
      impact = -c.vel.y;
      c.vel.y = -c.vel.y * RESTITUTION;
      c.vel.x *= 0.6;
      c.vel.z *= 0.6;
      c.spin = c.spin * 0.6 + (Math.random() - 0.5) * 12 * Math.min(1, impact);
      if (Math.abs(c.vel.y) < 0.25) {
        c.vel.y = 0;
        c.resting = true;
      }
    }
  }
  for (const b of colliders) {
    // Solo la cara de arriba de las cajas (sobre una mesa, una barrera…): de costado, rebota hacia atrás.
    if (c.pos.x < b.min.x || c.pos.x > b.max.x || c.pos.z < b.min.z || c.pos.z > b.max.z) continue;
    if (c.pos.y > b.max.y + r || c.pos.y < b.min.y) continue;
    if (c.vel.y <= 0 && c.pos.y >= b.max.y - 0.05) {
      c.pos.y = b.max.y + r;
      impact = Math.max(impact, -c.vel.y);
      c.vel.y = -c.vel.y * RESTITUTION;
      c.vel.x *= 0.6;
      c.vel.z *= 0.6;
      if (Math.abs(c.vel.y) < 0.25) {
        c.vel.y = 0;
        c.resting = true;
      }
    } else {
      // Contra un costado: sale por el lado más cercano y pierde la velocidad horizontal.
      const pens = [c.pos.x - b.min.x, b.max.x - c.pos.x, c.pos.z - b.min.z, b.max.z - c.pos.z];
      const k = pens.indexOf(Math.min(...pens));
      if (k === 0) c.pos.x = b.min.x - r;
      else if (k === 1) c.pos.x = b.max.x + r;
      else if (k === 2) c.pos.z = b.min.z - r;
      else c.pos.z = b.max.z + r;
      if (k < 2) c.vel.x *= -0.3;
      else c.vel.z *= -0.3;
      impact = Math.max(impact, 0.8);
    }
  }
  return impact;
}

export class Casings {
  constructor(game) {
    this.game = game;
    this.root = new THREE.Group();
    const unit = new THREE.CylinderGeometry(1, 1, 1, 8);
    unit.rotateZ(Math.PI / 2); // a lo largo de x
    this.meshes = {
      // Latón con un brillo propio leve: en mapas oscuros un metal puro solo refleja el entorno y se ve negro.
      brass: new THREE.InstancedMesh(unit, new THREE.MeshStandardMaterial({ color: '#d4a24a', roughness: 0.32, metalness: 0.55, emissive: '#7a5414', emissiveIntensity: 0.45 }), MAX.brass),
      shell: new THREE.InstancedMesh(unit, new THREE.MeshStandardMaterial({ color: '#c62a1f', roughness: 0.5, metalness: 0.1, emissive: '#4a0d08', emissiveIntensity: 0.4 }), MAX.shell),
    };
    this.pool = { brass: [], shell: [] };
    this.next = { brass: 0, shell: 0 };
    for (const kind of ['brass', 'shell']) {
      const mesh = this.meshes[kind];
      mesh.frustumCulled = false;
      mesh.castShadow = false;
      mesh.userData.dynamic = true;
      for (let i = 0; i < MAX[kind]; i++) {
        mesh.setMatrixAt(i, ZERO);
        this.pool[kind].push({ active: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), axis: new THREE.Vector3(0, 1, 0), angle: 0, spin: 0, life: 0, radius: 0.005, length: 0.02, resting: false, bounces: 0, sounded: 0 });
      }
      this.root.add(mesh);
    }
    this.queue = []; // expulsiones con retraso { t, weapon }
    this.dirty = { brass: false, shell: false };
  }

  attach(scene) {
    this.root.removeFromParent();
    scene.add(this.root);
  }

  /** Expulsa la vaina del arma (con el retraso de su mecanismo). */
  eject(weaponId) {
    const cfg = CASINGS[weaponId];
    if (!cfg) return;
    if (cfg.delay > 0) this.queue.push({ t: cfg.delay, weaponId });
    else this.spawn(cfg);
  }

  spawn(cfg) {
    const g = this.game;
    const cam = g.engine.camera;
    _right.set(1, 0, 0).applyQuaternion(cam.quaternion);
    _up.set(0, 1, 0).applyQuaternion(cam.quaternion);
    _fwd.set(0, 0, -1).applyQuaternion(cam.quaternion);
    const kind = cfg.kind;
    const i = this.next[kind];
    this.next[kind] = (i + 1) % MAX[kind];
    const c = this.pool[kind][i];
    c.active = true;
    c.resting = false;
    c.life = LIFE;
    c.bounces = 0;
    c.sounded = 0;
    c.radius = cfg.radius * VISUAL; // se apoya en el piso con su tamaño dibujado
    c.length = cfg.length * VISUAL;
    // Ventana de expulsión: a la derecha del arma, algo por delante de la cámara.
    c.pos.copy(cam.position).addScaledVector(_right, 0.12).addScaledVector(_up, -0.07).addScaledVector(_fwd, 0.36);
    c.vel
      .copy(_right)
      .multiplyScalar(1.7 + Math.random() * 0.9)
      .addScaledVector(_up, 1.3 + Math.random() * 0.8)
      .addScaledVector(_fwd, -0.25 + Math.random() * 0.4);
    if (g.player?.velocity) c.vel.add(g.player.velocity);
    c.axis.set(Math.random() - 0.5, 1, Math.random() - 0.5).normalize();
    c.angle = Math.random() * Math.PI;
    c.spin = (Math.random() < 0.5 ? -1 : 1) * (14 + Math.random() * 16);
  }

  update(dt) {
    for (let i = this.queue.length - 1; i >= 0; i--) {
      const q = this.queue[i];
      q.t -= dt;
      if (q.t <= 0) {
        this.queue.splice(i, 1);
        this.spawn(CASINGS[q.weaponId]);
      }
    }
    const colliders = this.game.world?.colliders ?? [];
    const groundY = this.game.world?.groundY ?? 0;
    const cam = this.game.engine.camera;
    for (const kind of ['brass', 'shell']) {
      const mesh = this.meshes[kind];
      const pool = this.pool[kind];
      let dirty = false;
      for (let i = 0; i < pool.length; i++) {
        const c = pool[i];
        if (!c.active) continue;
        dirty = true;
        c.life -= dt;
        if (c.life <= 0) {
          c.active = false;
          mesh.setMatrixAt(i, ZERO);
          continue;
        }
        if (!c.resting) {
          // Dos subpasos: a 3 m/s no atraviesa el borde de una mesa entre cuadros.
          const h = dt / 2;
          for (let s = 0; s < 2; s++) {
            const impact = stepCasing(c, h, colliders, groundY);
            if (impact > SOUND_MIN && c.sounded < 3) {
              c.sounded++;
              const dist = c.pos.distanceTo(cam.position);
              if (dist < HEAR_DIST) this.game.sfx.casing(this.game.panFor(c.pos), kind, Math.min(1, impact / 3) * (1 - dist / HEAR_DIST));
            }
          }
        }
        // Tumbado en el piso cuando reposa (girado sobre sí); dando vueltas en el aire.
        _q.setFromAxisAngle(c.resting ? UP : c.axis, c.angle);
        const fade = Math.min(1, c.life / 0.5);
        _m.compose(c.pos, _q, _s.set(c.length * fade, c.radius * fade, c.radius * fade));
        mesh.setMatrixAt(i, _m);
      }
      if (dirty || this.dirty[kind]) mesh.instanceMatrix.needsUpdate = true;
      this.dirty[kind] = dirty;
    }
  }

  clear() {
    this.queue.length = 0;
    for (const kind of ['brass', 'shell']) {
      for (let i = 0; i < MAX[kind]; i++) {
        this.pool[kind][i].active = false;
        this.meshes[kind].setMatrixAt(i, ZERO);
      }
      this.meshes[kind].instanceMatrix.needsUpdate = true;
    }
  }
}
