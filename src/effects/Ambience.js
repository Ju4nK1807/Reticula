import * as THREE from 'three';

// Ambiente del menú: polvo en suspensión y chispas que suben por delante de la cámara.
// Un solo THREE.Points (una draw call); solo se ve en la pantalla de título.
const COUNT = 260;
const SPARK_SHARE = 0.28; // proporción de chispas (ámbar, más rápidas) frente al polvo (verde frío)
const BOX = { x: 13, yMin: 0.2, yMax: 6.5, zNear: 3, zFar: 30 };

function dotTexture() {
  const size = 32;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class Ambience {
  constructor() {
    this.positions = new Float32Array(COUNT * 3);
    this.colors = new Float32Array(COUNT * 3);
    this.speed = new Float32Array(COUNT);
    this.phase = new Float32Array(COUNT);
    this.origin = new THREE.Vector3();
    const spark = new THREE.Color('#ffb54d');
    const dust = new THREE.Color('#7de8c4');
    for (let i = 0; i < COUNT; i++) {
      const isSpark = i < COUNT * SPARK_SHARE;
      const c = isSpark ? spark : dust;
      const k = isSpark ? 1.2 : 0.55 + Math.random() * 0.4;
      this.colors.set([c.r * k, c.g * k, c.b * k], i * 3);
      this.speed[i] = isSpark ? 0.5 + Math.random() * 0.9 : 0.05 + Math.random() * 0.12;
      this.phase[i] = Math.random() * Math.PI * 2;
      this.respawn(i, true);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    this.points = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        size: 0.12,
        map: dotTexture(),
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true,
      }),
    );
    this.points.frustumCulled = false;
    this.points.visible = false;
    this.scene = null;
  }

  // Posición aleatoria dentro de la caja (relativa al punto de aparición del mundo).
  respawn(i, anyHeight = false) {
    const y = anyHeight ? BOX.yMin + Math.random() * (BOX.yMax - BOX.yMin) : BOX.yMin;
    this.positions[i * 3] = (Math.random() * 2 - 1) * BOX.x;
    this.positions[i * 3 + 1] = y;
    this.positions[i * 3 + 2] = -(BOX.zNear + Math.random() * (BOX.zFar - BOX.zNear));
  }

  attach(scene, spawn) {
    if (this.scene === scene) return;
    this.scene?.remove(this.points);
    this.scene = scene;
    scene.add(this.points);
    if (spawn) this.origin.copy(spawn);
    this.points.position.copy(this.origin);
  }

  update(dt, visible) {
    this.points.visible = visible;
    if (!visible) return;
    const p = this.positions;
    for (let i = 0; i < COUNT; i++) {
      this.phase[i] += dt * 0.8;
      p[i * 3] += Math.sin(this.phase[i]) * dt * 0.12;
      p[i * 3 + 1] += this.speed[i] * dt;
      if (p[i * 3 + 1] > BOX.yMax) this.respawn(i);
    }
    this.points.geometry.attributes.position.needsUpdate = true;
  }
}
