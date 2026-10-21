import * as THREE from 'three';

const BASE = new THREE.Vector3(0.2, -0.2, -0.45);

// Arma en primera persona. Se dibuja en una escena aparte (Engine.overlay) para que no atraviese paredes.
export class Viewmodel {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(58, 1, 0.01, 10);
    this.scene.add(new THREE.HemisphereLight('#e0ebff', '#2a2a2a', 2.4));
    const key = new THREE.DirectionalLight('#ffffff', 1.4);
    key.position.set(-1, 2, 1);
    this.scene.add(key);

    const lambert = (color) => new THREE.MeshLambertMaterial({ color, flatShading: true });
    const dark = lambert('#262c35');
    const mid = lambert('#3b4452');
    const black = lambert('#15181d');
    const accent = new THREE.MeshBasicMaterial({ color: '#00ffa3' });

    this.gun = new THREE.Group();
    const part = (w, h, d, mat, x, y, z, rx = 0) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      m.rotation.x = rx;
      this.gun.add(m);
      return m;
    };
    part(0.07, 0.09, 0.42, dark, 0, 0, 0);
    part(0.06, 0.065, 0.22, mid, 0, -0.005, -0.3);
    part(0.028, 0.028, 0.2, black, 0, 0.012, -0.5);
    part(0.05, 0.15, 0.07, black, 0, -0.11, -0.06, 0.25);
    part(0.045, 0.11, 0.05, black, 0, -0.085, 0.11, -0.35);
    part(0.05, 0.08, 0.2, mid, 0, -0.01, 0.28);
    part(0.03, 0.045, 0.07, black, 0, 0.068, -0.03);
    part(0.072, 0.012, 0.22, accent, 0, 0.032, -0.05);
    part(0.11, 0.1, 0.32, lambert('#1d232b'), 0.03, -0.12, 0.3, -0.2); // manga

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
    this.flash.position.set(0, 0.012, -0.64);
    this.flash.visible = false;
    this.gun.add(this.flash);

    this.gun.position.copy(BASE);
    this.scene.add(this.gun);

    this.recoil = 0;
    this.reloadT = 0;
    this.reloadDuration = 0;
    this.flashT = 0;
    this.bobT = 0;
    this.sway = new THREE.Vector2();
  }

  resize(aspect) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  kick() {
    this.recoil = Math.min(1, this.recoil + 0.55);
    this.flashT = 0.045;
    this.flash.rotation.z = Math.random() * Math.PI;
  }

  startReload(duration) {
    this.reloadT = 0;
    this.reloadDuration = duration;
  }

  cancelReload() {
    this.reloadDuration = 0;
  }

  update(dt, player) {
    this.recoil = Math.max(0, this.recoil - dt * 7);
    // Recarga: el arma baja y gira (cambio de cargador) y vuelve a su sitio.
    let reload = 0;
    if (this.reloadDuration > 0) {
      this.reloadT += dt;
      const k = this.reloadT / this.reloadDuration;
      if (k >= 1) this.reloadDuration = 0;
      else reload = Math.sin(Math.PI * Math.min(1, k * 1.1));
    }
    this.flashT -= dt;
    this.flash.visible = this.flashT > 0;

    const speed = player.onGround ? Math.min(1, player.horizontalSpeed / player.maxSpeed) : 0;
    if (speed > 0.05) this.bobT += dt * (5 + 7 * speed);
    const { dx, dy } = player.mouseDelta;
    this.sway.x += (THREE.MathUtils.clamp(-dx * 0.0003, -0.03, 0.03) - this.sway.x) * Math.min(1, dt * 10);
    this.sway.y += (THREE.MathUtils.clamp(dy * 0.0003, -0.03, 0.03) - this.sway.y) * Math.min(1, dt * 10);

    this.gun.position.set(
      BASE.x + Math.sin(this.bobT) * 0.012 * speed + this.sway.x,
      BASE.y - Math.abs(Math.cos(this.bobT)) * 0.01 * speed + this.sway.y - player.crouch * 0.01 - reload * 0.14,
      BASE.z + this.recoil * 0.05,
    );
    this.gun.rotation.set(this.recoil * 0.1 - reload * 0.5, this.sway.x * 1.5, reload * 0.7);
  }
}
