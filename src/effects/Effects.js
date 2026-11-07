import * as THREE from 'three';

const TRACER_POOL = 48;
const TRACER_SPEED = 280; // m/s: lo bastante lento para ver la bala viajar
const TRACER_LENGTH = 2.4;
const DECALS = 120;
const PARTICLES = 240;

const UP = new THREE.Vector3(0, 1, 0);
const FWD = new THREE.Vector3(0, 0, 1);
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _c = new THREE.Color();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

// Efectos visuales del mundo: trazadoras (balas visibles), marcas de impacto y partículas.
// Decals y partículas usan InstancedMesh: una sola draw call cada uno.
export class Effects {
  constructor() {
    this.root = new THREE.Group();

    const tracerGeo = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true);
    const tracerMat = (color) =>
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
    this.tracerMaterials = { player: tracerMat('#ffe2a0'), enemy: tracerMat('#ff5a4a') };
    this.tracers = [];
    for (let i = 0; i < TRACER_POOL; i++) {
      const mesh = new THREE.Mesh(tracerGeo, this.tracerMaterials.player);
      mesh.visible = false;
      mesh.userData.warm = i === 0; // el precalentamiento compila su sombreador (Engine.warmup)
      mesh.frustumCulled = false;
      this.root.add(mesh);
      this.tracers.push({ mesh, from: new THREE.Vector3(), dir: new THREE.Vector3(), dist: 0, t: 0, active: false, width: 0.012 });
    }

    this.decals = new THREE.InstancedMesh(
      new THREE.CircleGeometry(0.045, 7),
      new THREE.MeshBasicMaterial({ color: '#15181d', polygonOffset: true, polygonOffsetFactor: -4 }),
      DECALS,
    );
    this.decals.frustumCulled = false;
    for (let i = 0; i < DECALS; i++) this.decals.setMatrixAt(i, ZERO);
    this.decalIndex = 0;
    this.root.add(this.decals);

    this.particles = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial(), PARTICLES);
    this.particles.frustumCulled = false;
    this.pData = [];
    for (let i = 0; i < PARTICLES; i++) {
      this.particles.setMatrixAt(i, ZERO);
      this.particles.setColorAt(i, _c.set('#ffffff'));
      this.pData.push({ pos: new THREE.Vector3(), vel: new THREE.Vector3(), life: 0, max: 1, size: 0.04 });
    }
    this.particleIndex = 0;
    this.root.add(this.particles);
  }

  attach(scene) {
    scene.add(this.root);
  }

  tracer(from, to, kind = 'player') {
    const dist = from.distanceTo(to);
    if (dist < 0.5) return; // demasiado corta para verse: no se ocupa ninguna trazadora
    // Libre, o si todas están en vuelo, la que más ha recorrido (la más próxima a terminar).
    let t = this.tracers.find((x) => !x.active);
    if (!t) t = this.tracers.reduce((a, b) => (b.t > a.t ? b : a));
    t.from.copy(from);
    t.dir.subVectors(to, from).divideScalar(dist);
    t.dist = dist;
    t.t = 0;
    t.active = true;
    t.width = kind === 'enemy' ? 0.02 : 0.012;
    t.mesh.material = this.tracerMaterials[kind];
    t.mesh.quaternion.setFromUnitVectors(UP, t.dir);
    t.mesh.visible = true;
  }

  decal(point, normal) {
    _q.setFromUnitVectors(FWD, normal);
    _p.copy(point).addScaledVector(normal, 0.006);
    const s = 0.8 + Math.random() * 0.5;
    _m.compose(_p, _q, _s.set(s, s, s));
    this.decals.setMatrixAt(this.decalIndex, _m);
    this.decalIndex = (this.decalIndex + 1) % DECALS;
    this.decals.instanceMatrix.needsUpdate = true;
  }

  burst(point, normal, color, count = 8, speed = 3) {
    _c.set(color);
    for (let i = 0; i < count; i++) {
      const idx = this.particleIndex;
      this.particleIndex = (this.particleIndex + 1) % PARTICLES;
      const p = this.pData[idx];
      p.pos.copy(point).addScaledVector(normal, 0.02);
      p.vel
        .set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5)
        .multiplyScalar(1.4)
        .add(normal)
        .normalize()
        .multiplyScalar(speed * (0.4 + Math.random() * 0.8));
      p.max = p.life = 0.25 + Math.random() * 0.25;
      p.size = 0.025 + Math.random() * 0.035;
      this.particles.setColorAt(idx, _c);
    }
    this.particles.instanceColor.needsUpdate = true;
  }

  update(dt) {
    for (const t of this.tracers) {
      if (!t.active) continue;
      t.t += dt;
      // La cola se calcula con lo recorrido SIN limitar: antes salía de la punta ya limitada al
      // impacto, así que se quedaba fija 2.4 m antes del final y la bala no terminaba nunca
      // (quedaba flotando en el aire hasta que se reciclaba la trazadora).
      const travel = t.t * TRACER_SPEED;
      const head = Math.min(travel, t.dist);
      const tail = Math.min(Math.max(0, travel - TRACER_LENGTH), t.dist);
      if (tail >= t.dist - 0.01) {
        t.active = false;
        t.mesh.visible = false;
        continue;
      }
      t.mesh.position.copy(t.from).addScaledVector(t.dir, (head + tail) / 2);
      t.mesh.scale.set(t.width, Math.max(0.01, head - tail), t.width);
    }

    let dirty = false;
    for (let i = 0; i < PARTICLES; i++) {
      const p = this.pData[i];
      if (p.life <= 0) continue;
      dirty = true;
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.setMatrixAt(i, ZERO);
        continue;
      }
      p.vel.y -= 9.8 * dt;
      p.pos.addScaledVector(p.vel, dt);
      const s = p.size * (p.life / p.max);
      _m.compose(p.pos, _q.identity(), _s.set(s, s, s));
      this.particles.setMatrixAt(i, _m);
    }
    if (dirty) this.particles.instanceMatrix.needsUpdate = true;
  }

  clear() {
    for (const t of this.tracers) {
      t.active = false;
      t.mesh.visible = false;
    }
    for (let i = 0; i < DECALS; i++) this.decals.setMatrixAt(i, ZERO);
    this.decals.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < PARTICLES; i++) {
      this.pData[i].life = 0;
      this.particles.setMatrixAt(i, ZERO);
    }
    this.particles.instanceMatrix.needsUpdate = true;
  }
}
