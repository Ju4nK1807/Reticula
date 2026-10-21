import * as THREE from 'three';

// Renderer, cámara y loop. La escena activa la aporta el mapa cargado.
// `overlay` ({ scene, camera, resize }) se dibuja encima sin depth del mundo: el arma en primera persona.
export class Engine {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.autoClear = false;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.05, 400);
    this.camera.rotation.order = 'YXZ';
    this.horizontalFov = 103;
    this.overlay = null;
    this.showOverlay = true;

    this.timer = new THREE.Timer();
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  // Los shooters definen el FOV en horizontal; Three.js lo usa en vertical.
  setHorizontalFov(deg) {
    this.horizontalFov = deg;
    this.applyFov();
  }

  applyFov() {
    const h = THREE.MathUtils.degToRad(this.horizontalFov);
    const v = 2 * Math.atan(Math.tan(h / 2) / this.camera.aspect);
    this.camera.fov = THREE.MathUtils.radToDeg(v);
    this.camera.updateProjectionMatrix();
  }

  setOverlay(overlay) {
    this.overlay = overlay;
    overlay?.resize(this.camera.aspect);
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.applyFov();
    this.overlay?.resize(this.camera.aspect);
  }

  start(onFrame) {
    this.renderer.setAnimationLoop((time) => {
      this.timer.update(time);
      const dt = Math.min(this.timer.getDelta(), 0.05);
      onFrame(dt);
      const r = this.renderer;
      r.clear();
      r.render(this.scene, this.camera);
      if (this.overlay && this.showOverlay) {
        r.clearDepth();
        r.render(this.overlay.scene, this.overlay.camera);
      }
    });
  }
}
