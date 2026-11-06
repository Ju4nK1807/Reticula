import * as THREE from 'three';
import { WEAPON_MODELS, loadWeaponModel } from './weaponModels.js';

const BASE = new THREE.Vector3(0.2, -0.2, -0.45);

// Materiales compartidos por todos los modelos (low-poly, sin texturas).
const lambert = (color) => new THREE.MeshLambertMaterial({ color, flatShading: true });
const MAT = {
  dark: lambert('#262c35'),
  mid: lambert('#3b4452'),
  black: lambert('#15181d'),
  sleeve: lambert('#1d232b'),
  wood: lambert('#6b4a2e'),
  steel: lambert('#6b7280'),
  glass: new THREE.MeshBasicMaterial({ color: '#0b1a2a' }),
  accent: new THREE.MeshBasicMaterial({ color: '#00ffa3' }),
};

// Modelos de respaldo de cada arma: [ancho, alto, largo, material, x, y, z, rotX] y la boca del
// cañón (destello). Hechos con cajas; se ven mientras carga el modelo 3D (weaponModels.js) o si falla.
const MODELS = {
  pistol: {
    muzzle: -0.36,
    offset: [0.0, 0.0, -0.08],
    parts: [
      [0.05, 0.06, 0.26, 'dark', 0, 0.02, -0.12],
      [0.045, 0.035, 0.24, 'mid', 0, 0.06, -0.12],
      [0.045, 0.14, 0.06, 'black', 0, -0.07, -0.02, 0.2],
      [0.012, 0.012, 0.1, 'accent', 0.026, 0.05, -0.14],
      [0.1, 0.09, 0.26, 'sleeve', 0.02, -0.12, 0.14, -0.2],
    ],
  },
  smg: {
    muzzle: -0.46,
    offset: [0, 0, 0.03],
    parts: [
      [0.07, 0.09, 0.32, 'dark', 0, 0, -0.06],
      [0.03, 0.03, 0.12, 'black', 0, 0.012, -0.28],
      [0.045, 0.2, 0.05, 'black', 0, -0.14, -0.08, 0.1],
      [0.045, 0.11, 0.05, 'black', 0, -0.085, 0.07, -0.35],
      [0.03, 0.04, 0.22, 'mid', 0, 0.0, 0.2],
      [0.012, 0.012, 0.16, 'accent', 0.037, 0.02, -0.06],
      [0.11, 0.1, 0.3, 'sleeve', 0.03, -0.12, 0.3, -0.2],
    ],
  },
  rifle: {
    muzzle: -0.64,
    offset: [0, 0, 0],
    parts: [
      [0.07, 0.09, 0.42, 'dark', 0, 0, 0],
      [0.06, 0.065, 0.22, 'mid', 0, -0.005, -0.3],
      [0.028, 0.028, 0.2, 'black', 0, 0.012, -0.5],
      [0.05, 0.15, 0.07, 'black', 0, -0.11, -0.06, 0.25],
      [0.045, 0.11, 0.05, 'black', 0, -0.085, 0.11, -0.35],
      [0.05, 0.08, 0.2, 'mid', 0, -0.01, 0.28],
      [0.03, 0.045, 0.07, 'black', 0, 0.068, -0.03],
      [0.072, 0.012, 0.22, 'accent', 0, 0.032, -0.05],
      [0.11, 0.1, 0.32, 'sleeve', 0.03, -0.12, 0.3, -0.2],
    ],
  },
  shotgun: {
    muzzle: -0.72,
    offset: [0, 0.01, 0],
    parts: [
      [0.07, 0.08, 0.36, 'dark', 0, 0, 0.02],
      [0.04, 0.04, 0.5, 'steel', 0, 0.02, -0.38],
      [0.05, 0.05, 0.18, 'wood', 0, -0.04, -0.3],
      [0.045, 0.11, 0.05, 'black', 0, -0.085, 0.12, -0.35],
      [0.06, 0.1, 0.24, 'wood', 0, -0.03, 0.3, 0.1],
      [0.012, 0.012, 0.14, 'accent', 0.037, 0.02, 0.0],
      [0.11, 0.1, 0.32, 'sleeve', 0.03, -0.12, 0.32, -0.2],
    ],
  },
  sniper: {
    muzzle: -0.92,
    offset: [0, 0, 0.02],
    parts: [
      [0.07, 0.08, 0.44, 'dark', 0, 0, 0.02],
      [0.03, 0.03, 0.56, 'black', 0, 0.01, -0.46],
      [0.05, 0.05, 0.26, 'black', 0, 0.09, -0.04], // tubo de la mira
      [0.06, 0.06, 0.03, 'glass', 0, 0.09, -0.18],
      [0.02, 0.05, 0.02, 'black', 0, 0.055, -0.1],
      [0.02, 0.05, 0.02, 'black', 0, 0.055, 0.04],
      [0.045, 0.11, 0.05, 'black', 0, -0.085, 0.12, -0.35],
      [0.06, 0.11, 0.26, 'mid', 0, -0.02, 0.32, 0.08],
      [0.02, 0.02, 0.06, 'steel', 0.05, 0.03, 0.08], // cerrojo
      [0.012, 0.012, 0.18, 'accent', 0.037, 0.02, 0.06],
      [0.11, 0.1, 0.32, 'sleeve', 0.03, -0.12, 0.34, -0.2],
    ],
  },
};

const geoCache = new Map();
const boxGeo = (w, h, d) => {
  const key = `${w}|${h}|${d}`;
  if (!geoCache.has(key)) geoCache.set(key, new THREE.BoxGeometry(w, h, d));
  return geoCache.get(key);
};

// Arma en primera persona. Se dibuja en una escena aparte (Engine.overlay) para que no atraviese paredes.
export class Viewmodel {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(58, 1, 0.01, 10);
    this.scene.add(new THREE.HemisphereLight('#e0ebff', '#2a2a2a', 2.4));
    const key = new THREE.DirectionalLight('#ffffff', 1.4);
    key.position.set(-1, 2, 1);
    this.scene.add(key);

    this.gun = new THREE.Group();
    this.model = new THREE.Group();
    this.gun.add(this.model);

    const flashMat = new THREE.MeshBasicMaterial({
      color: '#ffd27a',
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.flash = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.05), flashMat);
      plane.rotation.z = (i * Math.PI) / 3;
      this.flash.add(plane);
    }
    this.flash.visible = false;
    this.gun.add(this.flash);
    this.gun.position.copy(BASE);
    this.scene.add(this.gun);

    this.weaponId = null;
    this.loaded = new Map(); // id → modelo 3D listo
    this.offset = new THREE.Vector3();
    this.recoil = 0;
    this.kickStrength = 0.55;
    this.reloadT = 0;
    this.reloadDuration = 0;
    this.drawT = 0;
    this.drawDuration = 0;
    this.flashT = 0;
    this.bobT = 0;
    this.sway = new THREE.Vector2();
    this.setWeapon('rifle');
  }

  setWeapon(id) {
    const model = MODELS[id] ?? MODELS.rifle;
    if (this.weaponId === id) return;
    this.weaponId = id;
    this.model.clear();
    this.offset.fromArray(model.offset);
    const ready = this.loaded.get(id);
    if (ready) {
      this.showLoaded(ready);
      return;
    }
    for (const [w, h, d, mat, x, y, z, rx = 0] of model.parts) {
      const m = new THREE.Mesh(boxGeo(w, h, d), MAT[mat]);
      m.position.set(x, y, z);
      m.rotation.x = rx;
      this.model.add(m);
    }
    this.flash.position.set(0, 0.012, model.muzzle);
    // Modelo 3D: reemplaza a las cajas en cuanto llega (si el jugador sigue con esa arma).
    loadWeaponModel(id).then((m) => {
      if (!m) return;
      this.loaded.set(id, m);
      if (this.weaponId === id) {
        this.model.clear();
        this.showLoaded(m);
      }
    });
  }

  showLoaded({ object, muzzle }) {
    this.offset.set(0, 0, 0); // el modelo ya viene colocado
    this.model.add(object);
    this.flash.position.copy(muzzle);
  }

  // Descarga en segundo plano todos los modelos (son pequeños): cambiar de arma no espera.
  preload() {
    for (const id of Object.keys(WEAPON_MODELS)) {
      loadWeaponModel(id).then((m) => m && this.loaded.set(id, m));
    }
  }

  resize(aspect) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  // strength 0-1: fuerza del retroceso del arma.
  kick(strength = 0.55) {
    this.kickStrength = strength;
    this.recoil = Math.min(1, this.recoil + 0.35 + strength * 0.45);
    this.flashT = 0.03 + strength * 0.03;
    this.flash.scale.setScalar(0.6 + strength * 0.5);
    this.flash.rotation.z = Math.random() * Math.PI;
  }

  startReload(duration) {
    this.reloadT = 0;
    this.reloadDuration = duration;
  }

  cancelReload() {
    this.reloadDuration = 0;
  }

  // Sacar el arma: entra desde abajo.
  startDraw(duration) {
    this.drawT = 0;
    this.drawDuration = duration;
  }

  update(dt, player) {
    this.recoil = Math.max(0, this.recoil - dt * (7 - this.kickStrength * 3));
    // Recarga: el arma baja y gira (cambio de cargador) y vuelve a su sitio.
    let reload = 0;
    if (this.reloadDuration > 0) {
      this.reloadT += dt;
      const k = this.reloadT / this.reloadDuration;
      if (k >= 1) this.reloadDuration = 0;
      else reload = Math.sin(Math.PI * Math.min(1, k * 1.1));
    }
    let draw = 0;
    if (this.drawDuration > 0) {
      this.drawT += dt;
      const k = Math.min(1, this.drawT / this.drawDuration);
      draw = 1 - (1 - (1 - k) ** 3); // sube rápido y frena al llegar
      if (k >= 1) this.drawDuration = 0;
    }
    this.flashT -= dt;
    this.flash.visible = this.flashT > 0;

    const speed = player.onGround ? Math.min(1, player.horizontalSpeed / player.maxSpeed) : 0;
    if (speed > 0.05) this.bobT += dt * (5 + 7 * speed);
    const { dx, dy } = player.mouseDelta;
    this.sway.x += (THREE.MathUtils.clamp(-dx * 0.0003, -0.03, 0.03) - this.sway.x) * Math.min(1, dt * 10);
    this.sway.y += (THREE.MathUtils.clamp(dy * 0.0003, -0.03, 0.03) - this.sway.y) * Math.min(1, dt * 10);

    const kick = this.recoil * (0.035 + this.kickStrength * 0.04);
    this.gun.position.set(
      BASE.x + this.offset.x + Math.sin(this.bobT) * 0.012 * speed + this.sway.x,
      BASE.y + this.offset.y - Math.abs(Math.cos(this.bobT)) * 0.01 * speed + this.sway.y - player.crouch * 0.01 - reload * 0.14 - draw * 0.25,
      BASE.z + this.offset.z + kick,
    );
    this.gun.rotation.set(this.recoil * (0.06 + this.kickStrength * 0.1) - reload * 0.5 - draw * 0.6, this.sway.x * 1.5, reload * 0.7);
  }
}
