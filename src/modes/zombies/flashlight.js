import * as THREE from 'three';
import { HEIGHT_FOG } from './atmosphere.js';

const INTENSITY = 40;
const DISTANCE = 42;
const ANGLE = 0.52;
const PENUMBRA = 0.12;
const BEAM = 0.04;
const CLEAR = 0.78;
const FOLLOW = 14;
const FADE = 22;

export const BATTERY = {
  drainTime: 150,
  rechargeTime: 45,
  low: 0.2,
  lowLevel: 0.45,
  minOn: 0.08,
};

const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();

const DISK = 0.6;
function lensTexture() {
  if (typeof document === 'undefined') return null;
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const h = size / 2;
  const grad = g.createRadialGradient(h, h, 0, h, h, h);
  grad.addColorStop(0, 'rgb(255,255,255)');
  grad.addColorStop(0.12, 'rgb(250,250,250)');
  grad.addColorStop(0.26, 'rgb(200,200,200)');
  grad.addColorStop(DISK * 0.78, 'rgb(170,170,170)');
  grad.addColorStop(DISK * 0.9, 'rgb(215,215,215)');
  grad.addColorStop(DISK * 0.97, 'rgb(150,150,150)');
  grad.addColorStop(DISK + 0.04, 'rgb(52,52,52)');
  grad.addColorStop(0.8, 'rgb(30,30,30)');
  grad.addColorStop(0.96, 'rgb(6,6,6)');
  grad.addColorStop(1, 'rgb(0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  g.globalCompositeOperation = 'multiply';
  let s = 7;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < 18; i++) {
    const r = 8 + rnd() * 26;
    const x = h + (rnd() - 0.5) * size * DISK;
    const y = h + (rnd() - 0.5) * size * DISK;
    const sp = g.createRadialGradient(x, y, 0, x, y, r);
    sp.addColorStop(0, 'rgba(215,215,215,1)');
    sp.addColorStop(1, 'rgba(255,255,255,1)');
    g.fillStyle = sp;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  g.lineWidth = 3;
  for (const [r, a] of [[0.34, 0.85], [0.47, 0.88]]) {
    g.strokeStyle = `rgba(${Math.round(255 * a)},${Math.round(255 * a)},${Math.round(255 * a)},1)`;
    g.beginPath();
    g.arc(h, h, h * r, 0, Math.PI * 2);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class Flashlight {
  constructor(scene) {
    this.light = new THREE.SpotLight('#f3f1ec', 0, DISTANCE, ANGLE, PENUMBRA, 0.95);
    this.light.castShadow = false;
    this.light.shadow.mapSize.set(1024, 1024);
    this.light.shadow.camera.near = 0.3;
    this.light.shadow.camera.far = DISTANCE;
    this.light.shadow.bias = -0.0004;
    this.light.shadow.normalBias = 0.03;
    this.light.userData.dynamic = true;
    this.lens = lensTexture();
    this.light.map = this.lens;
    scene.add(this.light, this.light.target);
    this.on = true;
    this.level = 0;
    this.dir = new THREE.Vector3(0, 0, -1);
    this.started = false;
    this.shadows = null;
    this.battery = 1;
    this.onEmpty = null;
    HEIGHT_FOG.uBeamCone.value.set(Math.cos(ANGLE * DISK * 1.05), Math.cos(ANGLE * DISK * 0.8));
  }

  toggle() {
    if (!this.on && this.battery < BATTERY.minOn) return false;
    this.on = !this.on;
    return true;
  }

  updateBattery(dt) {
    if (this.on) {
      this.battery = Math.max(0, this.battery - dt / BATTERY.drainTime);
      if (this.battery === 0) {
        this.on = false;
        this.onEmpty?.();
      }
    } else this.battery = Math.min(1, this.battery + dt / BATTERY.rechargeTime);
  }

  get low() {
    return this.battery < BATTERY.low;
  }

  setShadows(on) {
    if (on === this.shadows) return;
    this.shadows = on;
    this.light.castShadow = on;
  }

  update(dt, camera, detail) {
    this.setShadows(detail === 'alta');
    camera.getWorldDirection(_fwd);
    if (!this.started) {
      this.dir.copy(_fwd);
      this.started = true;
    } else this.dir.lerp(_fwd, Math.min(1, dt * FOLLOW)).normalize();
    _right.setFromMatrixColumn(camera.matrixWorld, 0);
    _up.setFromMatrixColumn(camera.matrixWorld, 1);
    this.light.position.copy(camera.position).addScaledVector(_right, 0.18).addScaledVector(_up, -0.16);
    this.light.target.position.copy(this.light.position).addScaledVector(this.dir, 10);
    this.light.target.updateMatrixWorld();
    this.updateBattery(dt);
    const want = this.on ? 1 : 0;
    this.level += (want - this.level) * Math.min(1, dt * FADE);
    if (Math.abs(want - this.level) < 0.01) this.level = want;
    const low = Math.min(1, this.battery / BATTERY.low);
    const flicker = (Math.random() < (this.low ? 0.06 : 0.004) ? 0.55 : 1) * (BATTERY.lowLevel + (1 - BATTERY.lowLevel) * low);
    this.light.intensity = INTENSITY * this.level * flicker;
    this.light.shadow.autoUpdate = this.level > 0;
    HEIGHT_FOG.uBeam.value.set(this.dir.x, this.dir.y, this.dir.z, BEAM * this.level * flicker);
    HEIGHT_FOG.uBeamClear.value = CLEAR * this.level * flicker;
  }

  dispose() {
    this.light.removeFromParent();
    this.light.target.removeFromParent();
    this.light.shadow.map?.dispose();
    this.lens?.dispose();
    HEIGHT_FOG.uBeam.value.w = 0;
    HEIGHT_FOG.uBeamClear.value = 0;
  }
}
