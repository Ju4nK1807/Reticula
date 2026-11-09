import * as THREE from 'three';

/*
  Sangre del modo zombi (todo en dos llamadas de dibujo):
  - Neblina: cada impacto suelta una nube roja oscura que se abre y se desvanece (puntos con textura
    suave, mezcla normal: la sangre no brilla).
  - Manchas en el suelo: salpicaduras detrás del zombi al recibir un tiro y charcos que se extienden
    bajo los muertos. Húmedas (brillan con las luces) y con giro y tamaño al azar; las más viejas se
    reciclan.
  Las texturas se dibujan en un canvas al crear el efecto (no hay que descargar nada).
*/

const MIST = 64;
const DECALS = 72;
const FLOOR_Y = 0.025;
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const FLAT = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

// Mancha: un charco central irregular con gotas alrededor (blanco sobre transparente).
function splatTexture(seed = 1) {
  if (typeof document === 'undefined') return new THREE.Texture();
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  let s = seed * 9301 + 49297;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  g.fillStyle = '#fff';
  const blob = (x, y, r) => {
    g.beginPath();
    const n = 14;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const rr = r * (0.75 + rnd() * 0.45);
      const px = x + Math.cos(a) * rr;
      const py = y + Math.sin(a) * rr;
      if (i === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    }
    g.closePath();
    g.fill();
  };
  blob(size / 2, size / 2, size * 0.2);
  for (let i = 0; i < 9; i++) blob(size / 2 + (rnd() - 0.5) * size * 0.32, size / 2 + (rnd() - 0.5) * size * 0.32, size * (0.05 + rnd() * 0.08));
  for (let i = 0; i < 26; i++) {
    const a = rnd() * Math.PI * 2;
    const d = size * (0.22 + rnd() * 0.24);
    blob(size / 2 + Math.cos(a) * d, size / 2 + Math.sin(a) * d, size * (0.008 + rnd() * 0.022));
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function softDot() {
  if (typeof document === 'undefined') return new THREE.Texture();
  const size = 64;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}

const mistVertex = /* glsl */ `
attribute float aSize;
attribute float aAlpha;
varying float vAlpha;
#include <fog_pars_vertex>
void main() {
  vAlpha = aAlpha;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * (600.0 / -mvPosition.z);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;
const mistFragment = /* glsl */ `
uniform sampler2D uMap;
uniform vec3 uColor;
varying float vAlpha;
#include <fog_pars_fragment>
void main() {
  float a = texture2D(uMap, gl_PointCoord).a * vAlpha;
  if (a < 0.01) discard;
  gl_FragColor = vec4(uColor, a);
  #include <fog_fragment>
}
`;

export class BloodFx {
  constructor() {
    this.root = new THREE.Group();
    this.root.userData.dynamic = true;
    // --- Neblina ---
    this.mist = [];
    const pos = new Float32Array(MIST * 3);
    const size = new Float32Array(MIST);
    const alpha = new Float32Array(MIST);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1));
    this.mistGeo = geo;
    const mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uMap: { value: softDot() }, uColor: { value: new THREE.Color('#3a0504') } }]),
      vertexShader: mistVertex,
      fragmentShader: mistFragment,
      transparent: true,
      depthWrite: false,
      fog: true,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.userData.warm = true;
    this.root.add(this.points);
    for (let i = 0; i < MIST; i++) this.mist.push({ pos: new THREE.Vector3(), vel: new THREE.Vector3(), life: 0, max: 1, size: 0.3 });
    this.mistIndex = 0;
    // --- Manchas en el suelo ---
    const decalMat = new THREE.MeshStandardMaterial({
      color: '#2a0303',
      alphaMap: splatTexture(3),
      transparent: true,
      depthWrite: false,
      roughness: 0.18,
      metalness: 0,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.decals = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), decalMat, DECALS);
    this.decals.frustumCulled = false;
    this.decals.receiveShadow = true;
    this.decals.userData.noShadow = true;
    this.decalData = [];
    for (let i = 0; i < DECALS; i++) {
      this.decals.setMatrixAt(i, ZERO);
      this.decalData.push({ pos: new THREE.Vector3(), rot: 0, size: 0, grow: 0, t: 1 });
    }
    this.decalIndex = 0;
    this.growing = 0;
    this.root.add(this.decals);
    this.scene = null;
  }

  attach(scene) {
    if (this.scene === scene) return;
    this.scene?.remove(this.root);
    this.scene = scene;
    scene.add(this.root);
  }

  /** Impacto de bala: neblina en el punto y, a veces, salpicadura en el suelo detrás. */
  hit(point, dir, strength = 1) {
    const n = Math.round(3 * strength);
    for (let i = 0; i < n; i++) {
      const m = this.mist[this.mistIndex];
      this.mistIndex = (this.mistIndex + 1) % MIST;
      m.pos.copy(point);
      m.vel.set(Math.random() - 0.5, Math.random() * 0.6, Math.random() - 0.5).multiplyScalar(0.9).addScaledVector(dir, 1.1 + Math.random());
      m.max = m.life = 0.35 + Math.random() * 0.25;
      m.size = (0.18 + Math.random() * 0.14) * strength;
    }
    if (Math.random() < 0.55) {
      _p.copy(point).addScaledVector(dir, 0.6 + Math.random() * 1.4);
      this.splat(_p, 0.35 + Math.random() * 0.45 * strength, 0);
    }
  }

  /** Charco bajo un cuerpo: crece durante unos segundos. */
  pool(pos, scale = 1) {
    this.splat(pos, (1 + Math.random() * 0.5) * scale, 2.5);
  }

  splat(pos, size, grow) {
    const d = this.decalData[this.decalIndex];
    d.pos.set(pos.x, FLOOR_Y + this.decalIndex * 0.0004, pos.z);
    d.rot = Math.random() * Math.PI * 2;
    d.size = size;
    d.grow = grow;
    d.t = grow > 0 ? 0 : 1;
    this.write(this.decalIndex, grow > 0 ? 0.25 : 1);
    this.decalIndex = (this.decalIndex + 1) % DECALS;
  }

  write(i, k) {
    const d = this.decalData[i];
    _q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, d.rot).multiply(FLAT);
    const s = d.size * k;
    _m.compose(d.pos, _q, _s.set(s, s, s));
    this.decals.setMatrixAt(i, _m);
    this.decals.instanceMatrix.needsUpdate = true;
  }

  update(dt) {
    const pos = this.mistGeo.attributes.position;
    const size = this.mistGeo.attributes.aSize;
    const alpha = this.mistGeo.attributes.aAlpha;
    let live = false;
    for (let i = 0; i < MIST; i++) {
      const m = this.mist[i];
      if (m.life <= 0) {
        if (alpha.getX(i) !== 0) {
          alpha.setX(i, 0);
          live = true;
        }
        continue;
      }
      live = true;
      m.life -= dt;
      m.vel.multiplyScalar(Math.max(0, 1 - dt * 4));
      m.vel.y -= 0.8 * dt;
      m.pos.addScaledVector(m.vel, dt);
      const k = 1 - Math.max(0, m.life) / m.max;
      pos.setXYZ(i, m.pos.x, m.pos.y, m.pos.z);
      size.setX(i, m.size * (0.6 + k * 1.4));
      alpha.setX(i, (1 - k) * 0.75);
    }
    if (live) {
      pos.needsUpdate = true;
      size.needsUpdate = true;
      alpha.needsUpdate = true;
    }
    // Charcos que crecen.
    for (let i = 0; i < DECALS; i++) {
      const d = this.decalData[i];
      if (d.t >= 1) continue;
      d.t = Math.min(1, d.t + dt / d.grow);
      this.write(i, 0.25 + 0.75 * Math.sqrt(d.t));
    }
  }

  clear() {
    for (const m of this.mist) m.life = 0;
    for (let i = 0; i < DECALS; i++) {
      this.decalData[i].t = 1;
      this.decals.setMatrixAt(i, ZERO);
    }
    this.decals.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.root.removeFromParent();
    this.mistGeo.dispose();
    this.points.material.uniforms.uMap.value.dispose();
    this.points.material.dispose();
    this.decals.geometry.dispose();
    this.decals.material.alphaMap?.dispose();
    this.decals.material.dispose();
  }
}
