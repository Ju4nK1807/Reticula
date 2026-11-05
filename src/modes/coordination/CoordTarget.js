import * as THREE from 'three';

const DEATH_TIME = 0.14;
const LEAVE_TIME = 0.15;
const WRONG_TIME = 0.3; // s que dura el aviso de "objetivo equivocado"
const LABEL_SIZE = 1.25; // tamaño del número respecto al radio

// Formas: en el ejercicio de color cada color va con su propia forma, para que se pueda jugar
// también con daltonismo (se distingue por la silueta).
export const SHAPES = {
  sphere: new THREE.IcosahedronGeometry(1, 1),
  cube: new THREE.BoxGeometry(1.45, 1.45, 1.45),
  pyramid: new THREE.TetrahedronGeometry(1.35),
  diamond: new THREE.OctahedronGeometry(1.3),
};

// Texturas de números dibujadas en canvas (sin archivos externos), una por número y reutilizadas.
const labelTextures = new Map();

function labelTexture(text) {
  if (labelTextures.has(text)) return labelTextures.get(text);
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.font = `800 ${text.length > 1 ? 70 : 88}px "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 12;
  ctx.strokeStyle = 'rgba(5, 8, 12, 0.92)';
  ctx.strokeText(text, size / 2, size / 2 + 4);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, size / 2, size / 2 + 4);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  labelTextures.set(text, tex);
  return tex;
}

const _wrong = new THREE.Color('#ff2a3d');

/*
  Objetivo de los ejercicios de coordinación. Misma interfaz que SphereTarget y Bot (hitMeshes,
  alive, removable, escaped, damage, update, dispose…), así que Phase lo maneja igual, y además:
  - shape y color configurables (el color y la forma son la "identidad" en el ejercicio de color),
  - label: número dibujado encima (ejercicio de secuencia),
  - flashWrong(): sacudida y destello rojo al disparar al objetivo equivocado,
  - data: información libre del ejercicio (número de orden, si es el color correcto…).
*/
export class CoordTarget {
  constructor(parent, { position, radius = 0.5, color = '#36d6ff', shape = 'sphere', label = null, hp = 1, lifetime = null, spawnTime = 0.08, spin = 0, data = {} }) {
    this.opts = { behavior: {}, lifetime };
    this.radius = radius;
    this.spawnTime = spawnTime;
    this.hp = hp;
    this.spin = spin;
    this.data = data;
    this.state = 'alive'; // alive | dying | leaving | gone
    this.escaped = false;
    this.age = 0;
    this.t = 0;
    this.flashT = 0;
    this.wrongT = 0;
    this.highlight = false;
    this.baseColor = new THREE.Color(color);
    this.home = position.clone();

    this.material = new THREE.MeshLambertMaterial({
      color: this.baseColor,
      emissive: this.baseColor,
      emissiveIntensity: 0.35,
      flatShading: true,
      transparent: true,
    });
    this.mesh = new THREE.Mesh(SHAPES[shape] ?? SHAPES.sphere, this.material);
    this.mesh.position.copy(position);
    this.mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
    this.mesh.scale.setScalar(spawnTime > 0 ? 0.01 : radius);
    this.mesh.userData = { bot: this, part: 'body' };
    this.hitMeshes = [this.mesh];

    // El número va en un grupo aparte (no hereda el giro de la forma) y siempre se dibuja encima.
    this.labelSprite = null;
    if (label !== null) {
      this.labelSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture(String(label)), depthTest: false, transparent: true }));
      this.labelSprite.renderOrder = 10;
      this.labelSprite.position.copy(position);
      parent.add(this.labelSprite);
    }

    parent.add(this.mesh);
    this.applyScale(spawnTime > 0 ? 0.01 : 1);
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

  // Aviso visual de "este no era": destello rojo y sacudida, sin destruirlo.
  flashWrong() {
    this.wrongT = WRONG_TIME;
  }

  leave() {
    if (!this.alive) return;
    this.state = 'leaving';
    this.t = 0;
  }

  // Destruir sin que cuente como escapado (p. ej. al reiniciar una serie).
  remove() {
    this.state = 'gone';
  }

  applyScale(k) {
    this.mesh.scale.setScalar(this.radius * Math.max(0.01, k));
    if (this.labelSprite) this.labelSprite.scale.setScalar(this.radius * LABEL_SIZE * Math.max(0.01, k));
  }

  update(dt) {
    this.age += dt;
    this.flashT -= dt;
    this.wrongT = Math.max(0, this.wrongT - dt);
    if (this.spin) {
      this.mesh.rotation.y += this.spin * dt;
      this.mesh.rotation.x += this.spin * 0.4 * dt;
    }

    if (this.alive) {
      if (this.opts.lifetime && this.age > this.opts.lifetime) this.leave();
      const k = this.spawnTime > 0 ? Math.min(1, this.age / this.spawnTime) : 1;
      this.applyScale(k);
      if (this.wrongT > 0) {
        const shake = Math.sin(this.wrongT * 60) * 0.06 * (this.wrongT / WRONG_TIME);
        this.mesh.position.set(this.home.x + shake, this.home.y, this.home.z);
        this.material.color.copy(this.baseColor).lerp(_wrong, 0.7);
        this.material.emissive.copy(_wrong);
        this.material.emissiveIntensity = 1.2;
      } else {
        this.material.color.copy(this.baseColor);
        this.material.emissive.copy(this.baseColor);
        this.material.emissiveIntensity = this.flashT > 0 ? 1.6 : this.highlight ? 1.1 : 0.35;
      }
    } else if (this.state === 'dying') {
      this.t += dt;
      const k = this.t / DEATH_TIME;
      if (k >= 1) this.state = 'gone';
      this.applyScale(1 + k * 0.8);
      this.material.opacity = Math.max(0, 1 - k);
      if (this.labelSprite) this.labelSprite.material.opacity = Math.max(0, 1 - k);
      this.material.emissiveIntensity = 1.6;
    } else if (this.state === 'leaving') {
      this.t += dt;
      const k = this.t / LEAVE_TIME;
      if (k >= 1) {
        this.state = 'gone';
        this.escaped = true;
      }
      this.applyScale(1 - k);
    }
    if (this.labelSprite) this.labelSprite.position.copy(this.mesh.position);
    this.mesh.updateMatrixWorld();
  }

  // Mueve el objetivo (ejercicios con objetivos en movimiento).
  moveTo(position) {
    this.home.copy(position);
    if (this.wrongT <= 0) this.mesh.position.copy(position);
  }

  dispose() {
    this.mesh.removeFromParent();
    this.material.dispose();
    if (this.labelSprite) {
      this.labelSprite.removeFromParent();
      this.labelSprite.material.dispose(); // la textura se comparte y se conserva
    }
  }
}
