import * as THREE from 'three';

const LIFETIME = 12; // s antes de desaparecer
const BLINK_FROM = 3; // s finales en los que parpadea
const PICKUP_RADIUS = 1.1;
const SPIN_SPEED = 1.8;
const BOB_HEIGHT = 0.08;

// Geometrías y materiales compartidos por todos los botiquines (low-poly, sin texturas).
const GEO = {
  box: new THREE.BoxGeometry(0.5, 0.3, 0.42),
  barH: new THREE.BoxGeometry(0.3, 0.02, 0.09),
  barV: new THREE.BoxGeometry(0.09, 0.02, 0.3),
  glow: new THREE.RingGeometry(0.42, 0.55, 20),
};
const MAT = {
  box: new THREE.MeshLambertMaterial({ color: '#e8edf2', emissive: '#ffffff', emissiveIntensity: 0.25, flatShading: true }),
  cross: new THREE.MeshBasicMaterial({ color: '#00d68f' }),
  glow: new THREE.MeshBasicMaterial({ color: '#00ffa3', transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide }),
};

// Botiquín que suelta un enemigo al morir: gira, flota, parpadea antes de desaparecer y se
// recoge pasando por encima.
export class Medkit {
  constructor(parent, position, heal) {
    this.heal = heal;
    this.age = 0;
    this.group = new THREE.Group();
    this.group.position.set(position.x, 0, position.z);

    this.body = new THREE.Group();
    this.body.add(new THREE.Mesh(GEO.box, MAT.box));
    const h = new THREE.Mesh(GEO.barH, MAT.cross);
    const v = new THREE.Mesh(GEO.barV, MAT.cross);
    h.position.y = v.position.y = 0.16;
    this.body.add(h, v);
    this.body.position.y = 0.35;
    this.group.add(this.body);

    const glow = new THREE.Mesh(GEO.glow, MAT.glow);
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.03;
    this.group.add(glow);

    parent.add(this.group);
  }

  get expired() {
    return this.age >= LIFETIME;
  }

  // ¿El jugador (pies en `pos`) está encima?
  touches(pos) {
    const p = this.group.position;
    return Math.hypot(pos.x - p.x, pos.z - p.z) < PICKUP_RADIUS && pos.y < 1.5;
  }

  update(dt) {
    this.age += dt;
    this.body.rotation.y += SPIN_SPEED * dt;
    this.body.position.y = 0.35 + Math.sin(this.age * 3) * BOB_HEIGHT;
    const left = LIFETIME - this.age;
    this.group.visible = left > BLINK_FROM || Math.floor(left * 6) % 2 === 0;
  }

  dispose() {
    this.group.removeFromParent();
  }
}
