import * as THREE from 'three';

const GEOMETRY = new THREE.IcosahedronGeometry(1, 2);
const DEATH_TIME = 0.14;
const LEAVE_TIME = 0.15;

// Diana objetivo. Expone la misma interfaz que Bot (hitMeshes, alive, removable, escaped, damage,
// update, dispose) para que las fases traten igual a dianas y enemigos.
// `hp` cuenta impactos: 1 = muere al primer acierto; Infinity = nunca muere (tracking).
export class SphereTarget {
  constructor(parent, { position, radius = 0.5, color = '#ff3d5a', hp = 1, lifetime = null, spawnTime = 0.07 }) {
    this.opts = { behavior: {}, lifetime };
    this.radius = radius;
    this.spawnTime = spawnTime;
    this.hp = hp;
    this.state = 'alive'; // alive | dying | leaving | gone
    this.escaped = false;
    this.age = 0;
    this.t = 0;
    this.flashT = 0;
    this.highlight = false;

    this.material = new THREE.MeshLambertMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.35,
      flatShading: true,
      transparent: true,
    });
    this.mesh = new THREE.Mesh(GEOMETRY, this.material);
    this.mesh.position.copy(position);
    this.mesh.scale.setScalar(spawnTime > 0 ? 0.01 : radius);
    this.mesh.userData = { bot: this, part: 'body' };
    this.hitMeshes = [this.mesh];
    parent.add(this.mesh);
    this.mesh.updateMatrixWorld();
  }

  get position() {
    return this.mesh.position;
  }

  get alive() {
    return this.state === 'alive';
  }

  get removable() {
    return this.state === 'gone';
  }

  headPosition(out = new THREE.Vector3()) {
    return out.copy(this.mesh.position);
  }

  chestPosition(out = new THREE.Vector3()) {
    return out.copy(this.mesh.position);
  }

  setHighlight(on) {
    this.highlight = on;
  }

  damage(amount) {
    if (!this.alive) return { killed: false };
    this.hp -= amount;
    this.flashT = 0.06;
    if (this.hp <= 0) {
      this.state = 'dying';
      this.t = 0;
      return { killed: true };
    }
    return { killed: false };
  }

  leave() {
    if (!this.alive) return;
    this.state = 'leaving';
    this.t = 0;
  }

  update(dt) {
    this.age += dt;
    this.flashT -= dt;
    if (this.alive) {
      if (this.opts.lifetime && this.age > this.opts.lifetime) this.leave();
      const k = this.spawnTime > 0 ? Math.min(1, this.age / this.spawnTime) : 1;
      this.mesh.scale.setScalar(this.radius * Math.max(0.01, k));
      this.material.emissiveIntensity = this.flashT > 0 ? 1.6 : this.highlight ? 1.1 : 0.35;
    } else if (this.state === 'dying') {
      this.t += dt;
      const k = this.t / DEATH_TIME;
      if (k >= 1) this.state = 'gone';
      this.mesh.scale.setScalar(this.radius * (1 + k * 0.8));
      this.material.opacity = Math.max(0, 1 - k);
      this.material.emissiveIntensity = 1.6;
    } else if (this.state === 'leaving') {
      this.t += dt;
      const k = this.t / LEAVE_TIME;
      if (k >= 1) {
        this.state = 'gone';
        this.escaped = true;
      }
      this.mesh.scale.setScalar(this.radius * Math.max(0.01, 1 - k));
    }
    this.mesh.updateMatrixWorld();
  }

  dispose() {
    this.mesh.removeFromParent();
    this.material.dispose();
  }
}
