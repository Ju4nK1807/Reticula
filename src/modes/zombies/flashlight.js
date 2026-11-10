import * as THREE from 'three';
import { HEIGHT_FOG } from './atmosphere.js';

/*
  Linterna del modo zombi: un foco de verdad que sale de la cámara (un poco a la derecha y abajo, como
  si la llevara el arma) y sigue la mirada con un leve retraso (se siente en la mano). Con calidad alta
  proyecta sombras (los zombis que se cruzan tapan la luz) y una máscara de lente con el anillo y el
  centro brillante de una linterna real. La niebla dentro del haz se ilumina (HEIGHT_FOG.uBeam).

  Prender y apagar solo cambia la intensidad: la luz siempre está en la escena, así que nada se
  recompila al usarla. Las sombras dependen del detalle (cambiarlas sí recompila, pero solo pasa al
  cambiar la calidad).
*/

const INTENSITY = 30; // cd
const DISTANCE = 42; // m
const ANGLE = 0.44; // rad (medio ángulo del cono)
const PENUMBRA = 0.5;
const BEAM = 0.075; // fuerza del haz en la niebla
const FOLLOW = 14; // 1/s: qué tan rápido sigue la mirada
const FADE = 22; // 1/s: encendido y apagado

const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();

// Máscara de la lente: centro intenso, anillo y un borde suave algo irregular (blanco = luz).
function lensTexture() {
  if (typeof document === 'undefined') return null;
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const h = size / 2;
  const grad = g.createRadialGradient(h, h, 0, h, h, h);
  grad.addColorStop(0, 'rgb(255,255,255)');
  grad.addColorStop(0.18, 'rgb(235,235,235)');
  grad.addColorStop(0.3, 'rgb(150,150,150)');
  grad.addColorStop(0.52, 'rgb(120,120,120)');
  grad.addColorStop(0.6, 'rgb(175,175,175)'); // anillo del reflector
  grad.addColorStop(0.68, 'rgb(90,90,90)');
  grad.addColorStop(0.92, 'rgb(25,25,25)');
  grad.addColorStop(1, 'rgb(0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  // Imperfecciones del vidrio: manchas tenues.
  g.globalCompositeOperation = 'multiply';
  let s = 7;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < 18; i++) {
    const r = 8 + rnd() * 30;
    const x = h + (rnd() - 0.5) * size * 0.7;
    const y = h + (rnd() - 0.5) * size * 0.7;
    const sp = g.createRadialGradient(x, y, 0, x, y, r);
    sp.addColorStop(0, 'rgba(200,200,200,1)');
    sp.addColorStop(1, 'rgba(255,255,255,1)');
    g.fillStyle = sp;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class Flashlight {
  constructor(scene) {
    this.light = new THREE.SpotLight('#fff1d8', 0, DISTANCE, ANGLE, PENUMBRA, 0.95);
    this.light.castShadow = false;
    this.light.shadow.mapSize.set(1024, 1024);
    this.light.shadow.camera.near = 0.3;
    this.light.shadow.camera.far = DISTANCE;
    this.light.shadow.bias = -0.0004;
    this.light.shadow.normalBias = 0.03;
    this.light.userData.dynamic = true;
    this.lens = lensTexture();
    scene.add(this.light, this.light.target);
    this.on = true;
    this.level = 0; // 0-1 (fundido rápido al prender o apagar)
    this.dir = new THREE.Vector3(0, 0, -1);
    this.started = false;
    this.shadows = null;
    const cosOuter = Math.cos(ANGLE);
    HEIGHT_FOG.uBeamCone.value.set(cosOuter, Math.cos(ANGLE * (1 - PENUMBRA * 0.8)));
  }

  toggle() {
    this.on = !this.on;
    return this.on;
  }

  // Sombras y máscara de lente solo con calidad alta.
  setShadows(on) {
    if (on === this.shadows) return;
    this.shadows = on;
    this.light.castShadow = on;
    this.light.map = on ? this.lens : null;
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
    const want = this.on ? 1 : 0;
    this.level += (want - this.level) * Math.min(1, dt * FADE);
    if (Math.abs(want - this.level) < 0.01) this.level = want;
    // Un parpadeo muy leve (pilas gastadas): casi no se nota, pero da nervios.
    const flicker = Math.random() < 0.004 ? 0.55 : 1;
    this.light.intensity = INTENSITY * this.level * flicker;
    // Sin luz, la sombra no se vuelve a dibujar.
    this.light.shadow.autoUpdate = this.level > 0;
    HEIGHT_FOG.uBeam.value.set(this.dir.x, this.dir.y, this.dir.z, BEAM * this.level * flicker);
  }

  dispose() {
    this.light.removeFromParent();
    this.light.target.removeFromParent();
    this.light.shadow.map?.dispose();
    this.lens?.dispose();
    HEIGHT_FOG.uBeam.value.w = 0;
  }
}
