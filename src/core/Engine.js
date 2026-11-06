import * as THREE from 'three';
import { resolveQuality } from '../config/quality.js';

// Renderer, cámara y loop. La escena activa la aporta el mapa cargado.
// `overlay` ({ scene, camera, resize }) se dibuja encima sin depth del mundo: el arma en primera persona.
export class Engine {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.video = null; // configuración de calidad (setQuality)
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.autoClear = false;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.05, 400);
    this.camera.rotation.order = 'YXZ';
    this.horizontalFov = 103;
    this.zoom = 1; // aumento de la mira telescópica (1 = sin zoom)
    this.overlay = null;
    this.showOverlay = true;

    // Si el driver reinicia la GPU se pierde el contexto. preventDefault permite que Three.js
    // lo restaure solo; Game decide qué mostrar.
    this.onContextLost = null;
    this.onContextRestored = null;
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.onContextLost?.();
    });
    canvas.addEventListener('webglcontextrestored', () => this.onContextRestored?.());

    this.timer = new THREE.Timer();
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  // Los shooters definen el FOV en horizontal; Three.js lo usa en vertical.
  setHorizontalFov(deg) {
    this.horizontalFov = deg;
    this.applyFov();
  }

  // Zoom de mira telescópica: reduce el FOV efectivo (×2 = mitad de campo de visión en tangente).
  setZoom(z) {
    if (z === this.zoom) return;
    this.zoom = z;
    this.applyFov();
  }

  applyFov() {
    const h = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(this.horizontalFov) / 2) / this.zoom);
    const v = 2 * Math.atan(Math.tan(h / 2) / this.camera.aspect);
    this.camera.fov = THREE.MathUtils.radToDeg(v);
    this.camera.updateProjectionMatrix();
  }

  setOverlay(overlay) {
    this.overlay = overlay;
    overlay?.resize(this.camera.aspect);
  }

  // Calidad gráfica: ajusta la resolución interna de render (ver config/quality.js).
  setQuality(video) {
    this.video = video;
    this.resize();
  }

  resize() {
    if (this.video) this.renderer.setPixelRatio(resolveQuality(this.video, window.devicePixelRatio).pixelRatio);
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
