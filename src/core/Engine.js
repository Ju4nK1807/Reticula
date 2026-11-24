import * as THREE from 'three';
import { resolveQuality } from '../config/quality.js';
import { setGlowBloom, setSurfaceDetail } from '../gfx/surfaces.js';
import { shadowSizeFor } from '../gfx/lighting.js';

export class Engine {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.video = null;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.autoClear = false;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.renderer.shadowMap.enabled = false;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.detail = null;
    this.frozen = false;
    this.gpuName = detectGpu(this.renderer);
    this.composer = null;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.05, 400);
    this.camera.rotation.order = 'YXZ';
    this.horizontalFov = 103;
    this.zoom = 1;
    this.fovOverride = null;
    this.overlay = null;
    this.showOverlay = true;

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

  setHorizontalFov(deg) {
    this.horizontalFov = deg;
    this.applyFov();
  }

  setZoom(z) {
    if (z === this.zoom) return;
    this.zoom = z;
    this.applyFov();
  }

  applyFov() {
    if (this.fovOverride) {
      this.camera.fov = this.fovOverride;
      this.camera.updateProjectionMatrix();
      return;
    }
    const h = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(this.horizontalFov) / 2) / this.zoom);
    const v = 2 * Math.atan(Math.tan(h / 2) / this.camera.aspect);
    this.camera.fov = THREE.MathUtils.radToDeg(v);
    this.camera.updateProjectionMatrix();
  }

  setOverlay(overlay) {
    this.overlay = overlay;
    overlay?.resize(this.camera.aspect);
  }

  setQuality(video) {
    this.video = video;
    const { detail } = resolveQuality(video, window.devicePixelRatio);
    if (detail !== this.detail) {
      this.detail = detail;
      setSurfaceDetail(detail, this.renderer.capabilities.getMaxAnisotropy());
      const bloom = detail === 'alta';
      if (bloom && !this.composer) this.createComposer();
      else if (!bloom) {
        setGlowBloom(false);
        if (this.composer) this.disposeComposer();
      }
    }
    this.renderer.shadowMap.enabled = shadowSizeFor(detail) > 0;
    this.resize();
  }

  createComposer() {
    if (this.composerLoading) return;
    this.composerLoading = import('../gfx/postfx.js')
      .then(({ createComposer }) => {
        this.composerLoading = null;
        if (this.detail !== 'alta' || this.composer) return;
        const { composer, renderPass } = createComposer(this.renderer, this.scene, this.camera);
        this.composer = composer;
        this.renderPass = renderPass;
        setGlowBloom(true);
        this.resize();
      })
      .catch(() => {
        this.composerLoading = null;
      });
  }

  warmup(scene, camera, extras = [], { direct = false, clear = true } = {}) {
    const r = this.renderer;
    const shown = [];
    scene.traverse((o) => {
      if (o.userData.warm && !o.visible) {
        o.visible = true;
        shown.push(o);
      }
    });
    for (const e of extras) scene.add(e);
    try {
      r.compile(scene, camera);
      scene.traverse((o) => {
        for (const m of [].concat(o.material ?? [])) {
          for (const t of [m.map, m.normalMap, m.aoMap, m.roughnessMap, m.metalnessMap]) if (t?.image) r.initTexture(t);
        }
      });
      if (this.composer && !direct) {
        this.renderPass.scene = scene;
        this.renderPass.camera = camera;
        this.composer.render(0);
      } else {
        r.setRenderTarget(null);
        if (clear) r.clear();
        r.render(scene, camera);
      }
    } finally {
      for (const o of shown) o.visible = false;
      for (const e of extras) scene.remove(e);
    }
  }

  disposeComposer() {
    for (const pass of this.composer.passes) pass.dispose?.();
    this.composer.dispose();
    this.composer = null;
  }

  resize() {
    if (this.video) this.renderer.setPixelRatio(resolveQuality(this.video, window.devicePixelRatio).pixelRatio);
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    if (this.composer) {
      this.composer.setPixelRatio(this.renderer.getPixelRatio());
      this.composer.setSize(w, h);
    }
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
      if (this.frozen) return;
      if (this.composer) {
        this.renderPass.scene = this.scene;
        this.renderPass.camera = this.camera;
        this.composer.render(dt);
      } else {
        r.clear();
        r.render(this.scene, this.camera);
      }
      if (this.overlay && this.showOverlay) {
        r.setRenderTarget(null);
        r.clearDepth();
        r.render(this.overlay.scene, this.overlay.camera);
      }
    });
  }
}

function detectGpu(renderer) {
  try {
    const gl = renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
  } catch {
    return '';
  }
}
