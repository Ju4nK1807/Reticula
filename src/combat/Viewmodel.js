import * as THREE from 'three';
import { WEAPON_MODELS, loadWeaponModel } from './weaponModels.js';
import { buildArms, buildKnifeArm, buildThrowArm } from './arms.js';
import { grenadeMesh } from './Grenades.js';

// Cuadros clave [k, x, y, z, rotX, rotY, rotZ] (en la cámara del arma) del corte con cuchillo: sale de
// abajo a la derecha, se arma, corta en diagonal hacia la izquierda y vuelve a bajar.
const KNIFE_KEYS = [
  [0, 0.42, -0.6, -0.3, -0.4, 0.6, 1.1],
  [0.2, 0.26, -0.1, -0.36, 0.1, 0.55, 0.95],
  [0.45, -0.2, -0.22, -0.52, -0.2, -0.55, -0.7],
  [1, 0.2, -0.65, -0.35, -0.6, -0.2, -0.4],
];
// Lanzamiento de granada: la mano izquierda sube con la granada, la suelta al frente (RELEASE) y baja.
const THROW_KEYS = [
  [0, -0.32, -0.55, -0.3, -0.6, 0.3, 0.3],
  [0.3, -0.17, -0.08, -0.3, 0.35, 0.25, 0.1],
  [0.5, 0.02, -0.04, -0.72, -0.5, -0.1, -0.1],
  [1, -0.12, -0.62, -0.5, -1, 0, 0],
];
const smooth = (t) => t * t * (3 - 2 * t);
// Interpola los cuadros clave en `k` (0-1) sobre un objeto.
function pose(obj, keys, k) {
  let i = 0;
  while (i < keys.length - 2 && k > keys[i + 1][0]) i++;
  const a = keys[i];
  const b = keys[i + 1];
  const t = smooth(Math.min(1, Math.max(0, (k - a[0]) / (b[0] - a[0]))));
  obj.position.set(a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, a[3] + (b[3] - a[3]) * t);
  obj.rotation.set(a[4] + (b[4] - a[4]) * t, a[5] + (b[5] - a[5]) * t, a[6] + (b[6] - a[6]) * t);
}

const BASE = new THREE.Vector3(0.2, -0.2, -0.45);
// Apuntar con las miras: el arma va al centro con el lomo justo bajo la mira. Para los modelos 3D se
// calcula con su colocación (WEAPON_MODELS); este es el de las armas de cajas.
const ADS_FALLBACK = new THREE.Vector3(0, -0.085, -0.36);
const AIM_SPEED = 14; // 1/s: entra y sale de apuntar en ~0.15 s

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
    // Brazos y manos sujetando el arma (se rearman con cada arma: cada una tiene su agarre).
    this.arms = new THREE.Group();
    this.gun.add(this.arms);
    this.showArms = true;
    // Cuchillo (golpe cuerpo a cuerpo) y brazo de lanzar granadas: aparecen solo durante su gesto.
    this.knife = buildKnifeArm();
    this.knife.visible = false;
    this.scene.add(this.knife);
    this.throwArm = buildThrowArm();
    this.throwArm.visible = false;
    this.scene.add(this.throwArm);
    this.throwT = 0;
    this.throwDuration = 0;
    this.sprint = 0; // 0-1: transición a la pose de correr

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
    this.aim = 0; // 0 = cadera, 1 = apuntando con las miras
    this.aimTarget = 0;
    this.adsPose = ADS_FALLBACK.clone();
    this.loaded = new Map(); // id → modelo 3D listo
    this.offset = new THREE.Vector3();
    this.recoil = 0;
    this.kickStrength = 0.55;
    this.reloadT = 0;
    this.reloadDuration = 0;
    this.drawT = 0;
    this.drawDuration = 0;
    this.meleeT = 0;
    this.meleeDuration = 0;
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
    this.arms.clear();
    this.arms.add(buildArms(WEAPON_MODELS[id] ?? WEAPON_MODELS.rifle));
    this.offset.fromArray(model.offset);
    this.adsPose.copy(ADS_FALLBACK);
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
    // Pose de apuntar: modelo centrado y con su lomo (miras) 7 mm bajo el centro de la pantalla.
    const cfg = WEAPON_MODELS[this.weaponId];
    if (cfg) this.adsPose.set(-(cfg.x ?? 0), -cfg.top - 0.007, -0.3);
  }

  // Copias de lo que solo aparece a veces (cuchillo, brazo con cada granada): Game las dibuja una vez
  // al cargar para compilar sus sombreadores; el primer cuchillazo no da un tirón.
  warmupObjects() {
    const out = [this.knife.clone(), this.throwArm.clone()];
    for (const t of ['frag', 'fire', 'stun', 'decoy']) out.push(grenadeMesh(t));
    for (const o of out) o.visible = true;
    return out;
  }

  // Descarga en segundo plano todos los modelos (son pequeños): cambiar de arma no espera.
  preload() {
    return Promise.all(
      Object.keys(WEAPON_MODELS).map((id) => loadWeaponModel(id).then((m) => m && this.loaded.set(id, m))),
    );
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

  // Golpe cuerpo a cuerpo: sale el cuchillo y corta; el arma baja mientras tanto.
  melee(duration) {
    this.meleeT = 0;
    this.meleeDuration = duration;
  }

  // Lanzar granada: la mano izquierda aparece con la granada del tipo elegido y la suelta.
  throwGrenade(type, duration = 0.5) {
    const slot = this.throwArm.userData.slot;
    slot.clear();
    const g = grenadeMesh(type);
    g.scale.setScalar(0.75);
    g.traverse((o) => (o.frustumCulled = false));
    slot.add(g);
    this.throwT = 0;
    this.throwDuration = duration;
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

    // Cuchillo: corta según los cuadros clave; el arma se aparta hacia abajo (`duck`).
    let duck = 0;
    this.knife.visible = false;
    if (this.meleeDuration > 0) {
      this.meleeT += dt;
      const k = this.meleeT / this.meleeDuration;
      if (k >= 1) this.meleeDuration = 0;
      else {
        this.knife.visible = true;
        pose(this.knife, KNIFE_KEYS, k);
        duck = Math.sin(Math.PI * Math.min(1, k * 1.15));
      }
    }
    // Granada: la mano sube, la suelta al frente y baja; el arma se inclina hacia la derecha.
    this.throwArm.visible = false;
    if (this.throwDuration > 0) {
      this.throwT += dt;
      const k = this.throwT / this.throwDuration;
      if (k >= 1) this.throwDuration = 0;
      else {
        this.throwArm.visible = true;
        pose(this.throwArm, THROW_KEYS, k);
        this.throwArm.userData.slot.visible = k < 0.34; // a partir de aquí la granada ya vuela
        duck = Math.max(duck, 0.6 * Math.sin(Math.PI * Math.min(1, k * 1.2)));
      }
    }
    // Sprint: el arma baja y se inclina hacia dentro (no se apunta mientras se corre).
    this.sprint += ((player.sprinting ? 1 : 0) - this.sprint) * Math.min(1, dt * 9);
    const run = this.sprint * this.sprint * (3 - 2 * this.sprint);
    duck = Math.max(duck, run * 0.35);
    this.arms.visible = this.showArms;
    this.knife.children[1].visible = this.showArms; // la mano del cuchillo
    const strike = 0;
    // Apuntar: interpolación suave entre la cadera y la pose de miras; menos balanceo y retroceso.
    this.aim += (this.aimTarget - this.aim) * Math.min(1, dt * AIM_SPEED);
    const a = this.aim * this.aim * (3 - 2 * this.aim);
    const calm = 1 - 0.8 * a;
    const hx = BASE.x + this.offset.x;
    const hy = BASE.y + this.offset.y;
    const hz = BASE.z + this.offset.z;
    const kick = this.recoil * (0.035 + this.kickStrength * 0.04) * (1 - 0.5 * a);
    this.gun.position.set(
      hx + (this.adsPose.x - hx) * a + (Math.sin(this.bobT) * 0.012 * speed + this.sway.x) * calm + duck * 0.06,
      hy + (this.adsPose.y - hy) * a + (-Math.abs(Math.cos(this.bobT)) * 0.01 * speed + this.sway.y) * calm - player.crouch * 0.01 - reload * 0.14 - draw * 0.25 - duck * 0.26,
      hz + (this.adsPose.z - hz) * a + kick - strike * 0.16,
    );
    this.gun.rotation.set(
      this.recoil * (0.06 + this.kickStrength * 0.1) * (1 - 0.5 * a) - reload * 0.5 - draw * 0.6 - duck * 0.45,
      this.sway.x * 1.5 * calm - duck * 0.25 + run * 0.75,
      reload * 0.7 - duck * 0.35 + run * 0.3,
    );
    // Al correr el balanceo es más amplio (zancadas).
    if (run > 0.01) {
      this.gun.position.x += Math.sin(this.bobT) * 0.018 * run;
      this.gun.position.y -= Math.abs(Math.cos(this.bobT)) * 0.02 * run;
    }
  }
}
