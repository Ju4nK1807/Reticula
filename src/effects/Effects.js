import * as THREE from 'three';

const TRACER_POOL = 48;
const TRACER_SPEED = 190; // m/s: lo bastante lento para ver la bala viajar
const TRACER_LENGTH = 4.2;
// Grosor (m) a 6 m de la cámara; más lejos crece con la distancia (si no, a 20 m la bala mide menos
// de un píxel y "desaparece"), hasta TRACER_MAX_WIDTH.
const TRACER_WIDTH = { player: 0.02, enemy: 0.03 };
const TRACER_NEAR = 6;
const TRACER_MAX_WIDTH = 0.11;
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
    // Color por encima de 1 y sin mapeo de tonos: brilla (y con calidad alta, el bloom lo realza).
    const tracerMat = (color, boost) =>
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(boost), transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false });
    this.tracerMaterials = { player: tracerMat('#ffd27a', 2.4), enemy: tracerMat('#ff4a3a', 2.2) };
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
    t.width = TRACER_WIDTH[kind] ?? TRACER_WIDTH.player;
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

  // camera: para engrosar las trazadoras lejanas (sin cámara, grosor fijo).
  update(dt, camera = null) {
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
      const far = camera ? t.mesh.position.distanceTo(camera.position) / TRACER_NEAR : 1;
      const w = Math.min(TRACER_MAX_WIDTH, t.width * Math.max(1, far));
      t.mesh.scale.set(w, Math.max(0.01, head - tail), w);
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
