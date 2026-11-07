import * as THREE from 'three';
import { resolveQuality } from '../config/quality.js';
import { setGlowBloom, setSurfaceDetail } from '../gfx/surfaces.js';

// Renderer, cámara y loop. La escena activa la aporta el mapa cargado.
// `overlay` ({ scene, camera, resize }) se dibuja encima sin depth del mundo: el arma en primera persona.
export class Engine {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.video = null; // configuración de calidad (setQuality)
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.autoClear = false;
    // Tono neutro (Khronos PBR Neutral): comprime solo las luces altas y respeta los colores
    // (las dianas y los enemigos se ven del color que deben).
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.renderer.shadowMap.enabled = false;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.detail = null; // alta | media | baja (texturas, sombras y efectos)
    this.frozen = false; // true = no dibujar (hay un menú opaco encima): ahorra GPU y batería
    this.gpuName = detectGpu(this.renderer);
    this.composer = null; // postproceso (bloom), solo en calidad alta

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.05, 400);
    this.camera.rotation.order = 'YXZ';
    this.horizontalFov = 103;
    this.zoom = 1; // aumento de la mira telescópica (1 = sin zoom)
    this.fovOverride = null; // FOV vertical fijo (grados) para la cámara del menú; null = el del jugador
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

  // Calidad gráfica: resolución interna, texturas, sombras y efectos (ver config/quality.js).
  setQuality(video) {
    this.video = video;
    const { detail } = resolveQuality(video, window.devicePixelRatio);
    if (detail !== this.detail) {
      this.detail = detail;
      setSurfaceDetail(detail, this.renderer.capabilities.getMaxAnisotropy());
      this.renderer.shadowMap.enabled = detail !== 'baja';
      const bloom = detail === 'alta';
      if (bloom && !this.composer) this.createComposer();
      else if (!bloom) {
        setGlowBloom(false);
        if (this.composer) this.disposeComposer();
      }
    }
    this.resize();
  }

  // El postproceso se descarga solo si hace falta (calidad alta). Mientras llega se dibuja sin él.
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
        this.composerLoading = null; // sin postproceso: el juego sigue igual, sin bloom
      });
  }

  /*
    Precalentamiento: compila los sombreadores de una escena, sube sus texturas a la GPU y la dibuja
    una vez de verdad (a la pantalla o al postproceso, con su pase de sombras). En Windows, ANGLE
    (Direct3D 11) termina de compilar cada sombreador y su estado de canalización recién en el primer
    dibujo al destino real: si eso pasara en partida congelaría cientos de ms. Se llama al cargar un
    mapa (suele haber un menú encima) o con objetos de muestra diminutos que no se llegan a ver.
    - `extras`: objetos que se agregan solo durante el precalentamiento (p. ej. un soldado de muestra).
    - Los objetos invisibles marcados con userData.warm (reservas de efectos) se muestran un instante.
  */
  // `direct`: dibuja con el renderer aunque haya postproceso (la escena del arma va encima, directa).
  // `clear`: false para no borrar lo que ya hay en pantalla (escena superpuesta).
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
      r.compile(scene, camera); // todo lo visible, esté o no en el encuadre
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
      if (this.frozen) return; // el lienzo conserva el último cuadro
      if (this.composer) {
        this.renderPass.scene = this.scene; // el mapa activo puede cambiar
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

// Nombre de la GPU (p. ej. "ANGLE (Intel, Intel(R) UHD Graphics … Direct3D11)"). Algunos navegadores
// lo ocultan: entonces se usa el genérico y la calidad automática parte de un nivel medio.
function detectGpu(renderer) {
  try {
    const gl = renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
  } catch {
    return '';
  }
}
