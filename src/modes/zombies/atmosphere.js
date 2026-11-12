import * as THREE from 'three';

/*
  Atmósfera nocturna del Barrio en ruinas:

  - Niebla baja: además de la niebla por distancia de three.js, una capa de bruma pegada al suelo
    (densidad que cae con la altura, integrada exacta a lo largo de cada rayo). Se aplica a los
    materiales del mapa, a la utilería y a los zombis con applyHeightFog (un parche del sombreador).
  - LightPool: luces puntuales de verdad (farolas, fuego, máquinas) con un número FIJO de luces que
    se reparten entre las fuentes más cercanas a la cámara y que más aportan. Cambiar de fuente es un
    fundido (sin saltos); el número de luces solo cambia con el detalle (cambiarlo recompila).
  - Conos de luz bajo las farolas y charcos de luz en el suelo: geometría unida con mezcla aditiva
    (dos llamadas de dibujo para todo el mapa). Las farolas lejanas se siguen viendo encendidas.
  - Entorno nocturno: reflejos de cielo oscuro con resplandor de fuego (no el estudio genérico).
*/

// --- Niebla baja -----------------------------------------------------------------------------------
// x: densidad (1/m) a la altura base · y: caída con la altura (1/m) · z: altura base · w: intensidad
export const HEIGHT_FOG = {
  uHFog: { value: new THREE.Vector4(0.016, 0.5, 0, 1) },
  uHFogColor: { value: new THREE.Color('#1c2330') },
  // Haz de la linterna (sale de la cámara): la niebla dentro del cono se ilumina.
  // uBeam: dirección (xyz) · fuerza (w; 0 = apagada) · uBeamCone: cosenos del borde y del centro.
  uBeam: { value: new THREE.Vector4(0, 0, -1, 0) },
  uBeamCone: { value: new THREE.Vector2(0.9, 0.97) },
  uBeamColor: { value: new THREE.Color('#f3f1ec') },
  // Cuánto aclara la niebla dentro del círculo de la linterna (0-1): la luz la atraviesa y deja ver.
  uBeamClear: { value: 0 },
};

const FOG_PARS_VERT = /* glsl */ `#include <fog_pars_vertex>
#ifdef USE_FOG
varying vec3 vFogWorld;
#endif`;
const FOG_VERT = /* glsl */ `#include <fog_vertex>
#ifdef USE_FOG
  vec4 zfw = vec4( transformed, 1.0 );
  #ifdef USE_BATCHING
    zfw = batchingMatrix * zfw;
  #endif
  #ifdef USE_INSTANCING
    zfw = instanceMatrix * zfw;
  #endif
  vFogWorld = ( modelMatrix * zfw ).xyz;
#endif`;
const FOG_PARS_FRAG = /* glsl */ `#include <fog_pars_fragment>
#ifdef USE_FOG
varying vec3 vFogWorld;
uniform vec4 uHFog;
uniform vec3 uHFogColor;
uniform vec4 uBeam;
uniform vec2 uBeamCone;
uniform vec3 uBeamColor;
uniform float uBeamClear;
#endif`;
// Profundidad óptica de una densidad a·e^(−b·(y−h0)) entre la cámara y el punto (fórmula cerrada).
const FOG_FRAG = /* glsl */ `#ifdef USE_FOG
  #ifdef FOG_EXP2
    float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
  #else
    float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
  #endif
  vec3 hfR = vFogWorld - cameraPosition;
  float hfT = length( hfR );
  float hfY = hfR.y / max( hfT, 1e-4 );
  float hfB = uHFog.y;
  float hfK = abs( hfY ) > 1e-3 ? ( 1.0 - exp( - hfT * hfY * hfB ) ) / ( hfY * hfB ) : hfT;
  float hfFog = 1.0 - exp( - uHFog.x * exp( - ( cameraPosition.y - uHFog.z ) * hfB ) * hfK );
  // Linterna: dentro del círculo la niebla se aclara (la luz la atraviesa y se ve lo que alumbra, con
  // borde nítido) y además brilla un poco (la luz que dispersa, más cuanto más niebla cruza el rayo).
  float hfCone = 0.0;
  if ( uBeam.w > 0.0 ) {
    hfCone = smoothstep( uBeamCone.x, uBeamCone.y, dot( hfR / max( hfT, 1e-4 ), uBeam.xyz ) );
    float hfClear = 1.0 - uBeamClear * hfCone;
    hfFog *= hfClear;
    fogFactor *= hfClear;
  }
  gl_FragColor.rgb = mix( gl_FragColor.rgb, uHFogColor, hfFog * uHFog.w );
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
  if ( uBeam.w > 0.0 ) gl_FragColor.rgb += uBeamColor * ( uBeam.w * hfCone * ( 0.55 * fogFactor + hfFog ) / ( 1.0 + hfT * 0.06 ) );
#endif`;

/** Añade la niebla baja al sombreador (para encadenar con otros parches, p. ej. el de los zombis). */
export function patchHeightFog(shader) {
  Object.assign(shader.uniforms, HEIGHT_FOG);
  shader.vertexShader = shader.vertexShader.replace('#include <fog_pars_vertex>', FOG_PARS_VERT).replace('#include <fog_vertex>', FOG_VERT);
  shader.fragmentShader = shader.fragmentShader.replace('#include <fog_pars_fragment>', FOG_PARS_FRAG).replace('#include <fog_fragment>', FOG_FRAG);
}

const PATCHABLE = (m) => m && !m.userData?.heightFog && m.fog !== false && (m.isMeshStandardMaterial || m.isMeshBasicMaterial || m.isMeshLambertMaterial || m.isMeshPhongMaterial || m.isPointsMaterial);

/** Pone la niebla baja a un material (una vez; respeta un onBeforeCompile anterior). */
export function addHeightFog(material) {
  if (!PATCHABLE(material)) return material;
  const before = material.onBeforeCompile;
  const hadOwn = material.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile;
  const key = material.customProgramCacheKey.bind(material);
  material.onBeforeCompile = (shader, renderer) => {
    if (hadOwn) before.call(material, shader, renderer);
    patchHeightFog(shader);
  };
  material.customProgramCacheKey = () => `${key()}|hfog1`;
  material.userData.heightFog = true;
  material.needsUpdate = true;
  return material;
}

/** Niebla baja para todo lo que cuelga de `root` (mapa, utilería). */
export function applyHeightFog(root) {
  root.traverse((o) => {
    for (const m of [].concat(o.material ?? [])) addHeightFog(m);
  });
}

// --- Luces puntuales repartidas -------------------------------------------------------------------
// Cuántas luces reales según el detalle (el resto de las fuentes solo se ven por su brillo y su cono).
export const LIGHTS_FOR = { alta: 8, media: 5, baja: 2 };
const PICK_EVERY = 0.15; // s entre repartos
const FADE = 4; // 1/s: fundido al cambiar de fuente
const _fwd = new THREE.Vector3();
const _d = new THREE.Vector3();

/**
 * Fuente de luz: { pos, color, intensity (cd), distance (m), flicker: 0 | 'fire' | 'tube' | 'broken',
 * power: true si depende de la electricidad, on }
 */
export class LightPool {
  constructor(scene, sources = []) {
    this.scene = scene;
    this.sources = sources;
    this.lights = [];
    this.pickT = 0;
    this.time = 0;
    this.powered = false;
    this.group = new THREE.Group();
    this.group.userData.dynamic = true;
    scene.add(this.group);
  }

  add(src) {
    src.color = new THREE.Color(src.color);
    src.on ??= true;
    src.phase = Math.random() * 100;
    this.sources.push(src);
    return src;
  }

  /** Número de luces (solo al cambiar el detalle: recompila los materiales). */
  setCount(n) {
    if (n === this.lights.length) return;
    for (const l of this.lights) l.light.removeFromParent();
    this.lights = [];
    for (let i = 0; i < n; i++) {
      const light = new THREE.PointLight('#ffffff', 0, 10, 2);
      light.castShadow = false;
      light.position.set(0, -50, 0);
      this.group.add(light);
      this.lights.push({ light, src: null, level: 0 });
    }
    this.pickT = 0;
  }

  setPower(on) {
    this.powered = on;
  }

  // Brillo actual de una fuente (parpadeos incluidos): 0 si está apagada.
  level(src, t) {
    if (!src.on || (src.power && !this.powered)) return 0;
    const p = src.phase;
    switch (src.flicker) {
      case 'fire':
        return 0.78 + 0.14 * Math.sin(t * 9.3 + p) + 0.08 * Math.sin(t * 23.7 + p * 2);
      case 'tube': {
        // Fluorescente viejo: casi siempre bien, de vez en cuando titila.
        const k = Math.sin(t * 0.7 + p) > 0.93 ? (Math.sin(t * 60 + p) > 0 ? 1 : 0.15) : 1;
        return k;
      }
      case 'broken':
        return Math.sin(t * 1.3 + p) + Math.sin(t * 7.1 + p * 3) * 0.6 > 0.9 ? 0.1 : 0.85;
      default:
        return 1;
    }
  }

  update(dt, camera) {
    this.time += dt;
    const t = this.time;
    if ((this.pickT -= dt) <= 0) {
      this.pickT = PICK_EVERY;
      this.pick(camera);
    }
    for (const l of this.lights) {
      const want = l.src && l.keep ? 1 : 0;
      l.level += Math.sign(want - l.level) * Math.min(Math.abs(want - l.level), dt * FADE);
      if (!l.keep && l.level <= 0) l.src = null;
      const s = l.src;
      if (!s) {
        l.light.intensity = 0;
        continue;
      }
      l.light.intensity = s.intensity * l.level * this.level(s, t);
    }
  }

  // Las fuentes que más aportan cerca de la cámara (las de delante cuentan más).
  pick(camera) {
    const n = this.lights.length;
    if (!n) return;
    camera.getWorldDirection(_fwd);
    const cam = camera.position;
    const scored = [];
    for (const s of this.sources) {
      if (!s.on || (s.power && !this.powered)) continue;
      _d.subVectors(s.pos, cam);
      const d2 = _d.lengthSq();
      const reach = s.distance + 6;
      if (d2 > reach * reach) continue;
      const ahead = _d.dot(_fwd) > -s.distance * 0.5 ? 1 : 0.35;
      scored.push([s, (s.intensity * ahead) / (d2 + 9)]);
    }
    scored.sort((a, b) => b[1] - a[1]);
    const chosen = new Set(scored.slice(0, n).map((x) => x[0]));
    for (const l of this.lights) l.keep = !!l.src && chosen.has(l.src);
    for (const l of this.lights) if (l.keep) chosen.delete(l.src);
    // Fuentes nuevas: a luces libres (apagadas del todo).
    for (const src of chosen) {
      const free = this.lights.find((l) => !l.src);
      if (!free) break;
      free.src = src;
      free.keep = true;
      free.level = 0;
      free.light.color.copy(src.color);
      free.light.distance = src.distance;
      free.light.position.copy(src.pos);
    }
  }

  dispose() {
    this.group.removeFromParent();
  }
}

// --- Conos y charcos de luz (aditivos) -------------------------------------------------------------
const coneVert = /* glsl */ `
attribute vec4 aLight; // rgb · fase de parpadeo
attribute float aPower; // 1: depende de la electricidad
varying vec3 vColor;
varying float vH;
varying vec3 vN;
varying vec3 vV;
varying float vPower;
varying float vPhase;
#include <fog_pars_vertex>
void main() {
  vColor = aLight.rgb;
  vPhase = aLight.a;
  vPower = aPower;
  vH = uv.y;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = normalize(-mvPosition.xyz);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const coneFrag = /* glsl */ `
uniform float uPower;
uniform float uTime;
uniform float uStrength;
varying vec3 vColor;
varying float vH;
varying vec3 vN;
varying vec3 vV;
varying float vPower;
varying float vPhase;
#include <fog_pars_fragment>
void main() {
  float on = mix(1.0, uPower, vPower);
  // Lámparas rotas (fase > 50): titilan.
  if (vPhase > 50.0) on *= step(0.9, sin(uTime * 1.3 + vPhase) + sin(uTime * 7.1 + vPhase * 3.0) * 0.6) < 0.5 ? 0.85 : 0.1;
  float edge = pow(abs(dot(normalize(vN), normalize(vV))), 1.6);
  float a = edge * vH * vH * on * uStrength;
  vec3 c = vColor * a;
  #ifdef USE_FOG
    float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
    c *= 1.0 - fogFactor;
  #endif
  gl_FragColor = vec4(c, 1.0);
}`;
const poolFrag = /* glsl */ `
uniform float uPower;
uniform float uTime;
uniform float uStrength;
varying vec3 vColor;
varying float vH;
varying vec3 vN;
varying vec3 vV;
varying float vPower;
varying float vPhase;
varying vec2 vUv2;
#include <fog_pars_fragment>
void main() {
  float on = mix(1.0, uPower, vPower);
  if (vPhase > 50.0) on *= step(0.9, sin(uTime * 1.3 + vPhase) + sin(uTime * 7.1 + vPhase * 3.0) * 0.6) < 0.5 ? 0.85 : 0.1;
  float r = length(vUv2 - 0.5) * 2.0;
  float a = pow(max(0.0, 1.0 - r), 2.2) * on * uStrength;
  vec3 c = vColor * a;
  #ifdef USE_FOG
    float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
    c *= 1.0 - fogFactor;
  #endif
  gl_FragColor = vec4(c, 1.0);
}`;
const poolVert = coneVert.replace('varying float vPhase;', 'varying float vPhase;\nvarying vec2 vUv2;').replace('vH = uv.y;', 'vH = uv.y;\n  vUv2 = uv;');

function lightMaterial(vertexShader, fragmentShader, strength) {
  return new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uPower: { value: 0 }, uTime: { value: 0 }, uStrength: { value: strength } }]),
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    fog: true,
  });
}

/**
 * Conos (farolas) y charcos de luz unidos en dos mallas.
 * cones: [{ top: Vector3, height, radius, color, power, broken }] · pools: [{ pos, radius, color, power, broken }]
 */
export function lightShapes(cones, pools) {
  const group = new THREE.Group();
  group.userData.dynamic = true;
  const build = (items, make, mat) => {
    if (!items.length) return null;
    const geos = items.map((it) => {
      const g = make(it);
      const n = g.attributes.position.count;
      const c = new THREE.Color(it.color);
      const light = new Float32Array(n * 4);
      const power = new Float32Array(n);
      const phase = it.broken ? 60 + Math.random() * 40 : Math.random() * 40;
      for (let i = 0; i < n; i++) {
        light.set([c.r, c.g, c.b, phase], i * 4);
        power[i] = it.power ? 1 : 0;
      }
      g.setAttribute('aLight', new THREE.BufferAttribute(light, 4));
      g.setAttribute('aPower', new THREE.BufferAttribute(power, 1));
      return g;
    });
    const merged = mergeAll(geos);
    const mesh = new THREE.Mesh(merged, mat);
    mesh.frustumCulled = false;
    mesh.userData.noShadow = true;
    mesh.renderOrder = 2;
    group.add(mesh);
    return mesh;
  };
  const coneMesh = build(
    cones,
    (it) => {
      const g = new THREE.CylinderGeometry(0.12, it.radius, it.height, 20, 1, true);
      g.translate(it.top.x, it.top.y - it.height / 2, it.top.z);
      return g;
    },
    lightMaterial(coneVert, coneFrag, 0.16),
  );
  const poolMesh = build(
    pools,
    (it) => {
      const g = new THREE.PlaneGeometry(it.radius * 2, it.radius * 2);
      g.rotateX(-Math.PI / 2);
      g.translate(it.pos.x, (it.pos.y ?? 0) + 0.035, it.pos.z);
      return g;
    },
    lightMaterial(poolVert, poolFrag, 0.32),
  );
  const mats = [coneMesh?.material, poolMesh?.material].filter(Boolean);
  return {
    group,
    update(dt, powered) {
      for (const m of mats) {
        m.uniforms.uTime.value += dt;
        m.uniforms.uPower.value += ((powered ? 1 : 0) - m.uniforms.uPower.value) * Math.min(1, dt * 3);
      }
    },
  };
}

function mergeAll(geos) {
  // Unión simple (mismos atributos e índices): sin depender de BufferGeometryUtils.
  const attrs = Object.keys(geos[0].attributes);
  const out = new THREE.BufferGeometry();
  let total = 0;
  let totalIdx = 0;
  for (const g of geos) {
    total += g.attributes.position.count;
    totalIdx += g.index ? g.index.count : g.attributes.position.count;
  }
  for (const a of attrs) {
    const size = geos[0].attributes[a].itemSize;
    const arr = new Float32Array(total * size);
    let off = 0;
    for (const g of geos) {
      arr.set(g.attributes[a].array, off);
      off += g.attributes[a].array.length;
    }
    out.setAttribute(a, new THREE.BufferAttribute(arr, size));
  }
  const idx = new (total > 65535 ? Uint32Array : Uint16Array)(totalIdx);
  let base = 0;
  let k = 0;
  for (const g of geos) {
    const n = g.attributes.position.count;
    if (g.index) for (let i = 0; i < g.index.count; i++) idx[k++] = g.index.getX(i) + base;
    else for (let i = 0; i < n; i++) idx[k++] = i + base;
    base += n;
    g.dispose();
  }
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere();
  return out;
}

// --- Entorno nocturno -------------------------------------------------------------------------------
let nightEnv = null;

/** Mapa de entorno de noche (cielo oscuro, resplandor de fuego en el horizonte y farolas). */
export function nightEnvironment(renderer) {
  if (nightEnv) return nightEnv;
  const scene = new THREE.Scene();
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(50, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `varying vec3 vD; void main(){
        float h = vD.y;
        vec3 zen = vec3(0.012, 0.018, 0.035);
        vec3 hor = vec3(0.05, 0.045, 0.05);
        vec3 c = mix(hor, zen, smoothstep(0.0, 0.6, h));
        c += vec3(0.25, 0.09, 0.02) * exp(-abs(h) * 8.0) * (0.4 + 0.6 * max(0.0, dot(normalize(vec3(vD.x, 0.0, vD.z)), vec3(0.6, 0.0, -0.8))));
        c = mix(c, vec3(0.02, 0.018, 0.016), smoothstep(0.0, -0.3, h));
        gl_FragColor = vec4(c, 1.0);
      }`,
    }),
  );
  scene.add(sky);
  // Farolas y fuego como manchas brillantes: dan reflejos cálidos en charcos, metal y sangre.
  const lamp = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffb066').multiplyScalar(6) });
  const fire = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff6a2a').multiplyScalar(5) });
  const moon = new THREE.MeshBasicMaterial({ color: new THREE.Color('#bcd0ff').multiplyScalar(3) });
  for (const [mat, x, y, z, s] of [[lamp, 20, 9, 10, 2], [lamp, -18, 9, -14, 2], [lamp, 6, 9, -22, 1.6], [fire, -14, 1, 18, 2.4], [fire, 24, 1, -6, 2], [moon, -20, 30, 12, 3]]) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(s, 12, 8), mat);
    m.position.set(x, y, z);
    scene.add(m);
  }
  const pmrem = new THREE.PMREMGenerator(renderer);
  nightEnv = pmrem.fromScene(scene, 0.02).texture;
  pmrem.dispose();
  scene.traverse((o) => {
    o.geometry?.dispose();
    o.material?.dispose();
  });
  return nightEnv;
}

// --- Fuego y humo -------------------------------------------------------------------------------------
// Llamas de los barriles: cuadros que miran a la cámara con un fuego de ruido animado (aditivo) y una
// columna de humo encima (mezcla normal). Todas las llamas son instancias de una malla y todo el humo de
// otra: dos llamadas de dibujo para todos los fuegos del mapa.
const FIRE_VERT = /* glsl */ `
attribute vec4 aFire; // base (xyz) · semilla
attribute vec2 aSize; // ancho · alto
varying vec2 vUv;
varying float vSeed;
#include <fog_pars_vertex>
void main() {
  vUv = uv;
  vSeed = aFire.w;
  vec4 mvPosition = viewMatrix * vec4(aFire.xyz, 1.0);
  mvPosition.xy += vec2(position.x * aSize.x, position.y * aSize.y);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const NOISE = /* glsl */ `
float fHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float fNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(fHash(i), fHash(i + vec2(1.0, 0.0)), f.x), mix(fHash(i + vec2(0.0, 1.0)), fHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fFbm(vec2 p) { return fNoise(p) * 0.55 + fNoise(p * 2.1) * 0.3 + fNoise(p * 4.3) * 0.15; }`;
const FLAME_FRAG = /* glsl */ `
uniform float uTime;
varying vec2 vUv;
varying float vSeed;
#include <fog_pars_fragment>
${NOISE}
void main() {
  vec2 uv = vUv;
  float n = fFbm(vec2(uv.x * 3.2 + vSeed, uv.y * 2.4 - uTime * 2.6 + vSeed * 3.0));
  float width = (1.0 - uv.y) * 0.9 + 0.08;
  float body = 1.0 - smoothstep(0.0, width * 0.5, abs(uv.x - 0.5 + (n - 0.5) * 0.18 * uv.y));
  float flame = body * smoothstep(1.0, 0.15, uv.y + (n - 0.45) * 0.55) * smoothstep(0.0, 0.08, uv.y);
  vec3 c = mix(vec3(0.9, 0.16, 0.02), vec3(1.0, 0.78, 0.35), smoothstep(0.35, 0.95, flame)) * flame * 2.4;
  #ifdef USE_FOG
    c *= 1.0 - smoothstep(fogNear, fogFar, vFogDepth);
  #endif
  gl_FragColor = vec4(c, 1.0);
}`;
const SMOKE_FRAG = /* glsl */ `
uniform float uTime;
varying vec2 vUv;
varying float vSeed;
#include <fog_pars_fragment>
${NOISE}
void main() {
  vec2 uv = vUv;
  float n = fFbm(vec2(uv.x * 2.0 + vSeed, uv.y * 1.6 - uTime * 0.45 + vSeed));
  float col = 1.0 - smoothstep(0.08, 0.5, abs(uv.x - 0.5 + (n - 0.5) * 0.35 * uv.y) / (0.35 + uv.y * 0.5));
  float a = col * smoothstep(0.0, 0.15, uv.y) * (1.0 - smoothstep(0.45, 1.0, uv.y)) * smoothstep(0.3, 0.7, n) * 0.42;
  vec3 c = vec3(0.07, 0.07, 0.075);
  #ifdef USE_FOG
    c = mix(c, fogColor, smoothstep(fogNear, fogFar, vFogDepth));
  #endif
  gl_FragColor = vec4(c, a);
}`;

/** Llamas y humo para una lista de fuegos [{ pos: Vector3 (base), width, height, smoke }]. */
export function fireField(fires) {
  const group = new THREE.Group();
  group.userData.dynamic = true;
  const geo = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
  const make = (items, frag, opts, size) => {
    const g = new THREE.InstancedBufferGeometry().copy(geo);
    g.instanceCount = items.length;
    g.setAttribute('aFire', new THREE.InstancedBufferAttribute(new Float32Array(items.flatMap((f, i) => [f.pos.x, f.pos.y + (size === 'smoke' ? f.height * 0.55 : 0), f.pos.z, i * 1.7 + 0.3])), 4));
    g.setAttribute('aSize', new THREE.InstancedBufferAttribute(new Float32Array(items.flatMap((f) => (size === 'smoke' ? [f.width * 2.6, f.height * 4.5] : [f.width, f.height]))), 2));
    const mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: Math.random() * 10 } }]),
      vertexShader: FIRE_VERT,
      fragmentShader: frag,
      transparent: true,
      depthWrite: false,
      fog: true,
      ...opts,
    });
    const mesh = new THREE.Mesh(g, mat);
    mesh.frustumCulled = false;
    mesh.userData.noShadow = true;
    group.add(mesh);
    return mesh;
  };
  const meshes = fires.length ? [make(fires.filter((f) => f.smoke !== false), SMOKE_FRAG, {}, 'smoke'), make(fires, FLAME_FRAG, { blending: THREE.AdditiveBlending }, 'flame')] : [];
  meshes[0]?.geometry && (meshes[0].renderOrder = 1);
  return {
    group,
    update(dt) {
      for (const m of meshes) m.material.uniforms.uTime.value += dt;
    },
  };
}

// --- Bancos de niebla -----------------------------------------------------------------------------
// Jirones de bruma que flotan a ras del suelo alrededor del jugador y se mueven despacio con el viento:
// cuadros grandes que miran a la cámara con un ruido suave y transparencia baja (una malla instanciada,
// una llamada de dibujo). Se apagan al acercarse a la cámara (no se ve el borde del cuadro) y se
// funden con la niebla de distancia. Los que quedan lejos reaparecen del otro lado.
const BANK_VERT = /* glsl */ `
attribute vec4 aBank; // posición (xyz) · semilla
attribute float aSize;
uniform float uFade; // m: más cerca de la cámara se desvanecen
varying vec2 vUv;
varying float vSeed;
varying float vNear;
varying vec3 vRay;
#include <fog_pars_vertex>
void main() {
  vUv = uv;
  vSeed = aBank.w;
  vec4 mvPosition = viewMatrix * vec4(aBank.xyz, 1.0);
  vNear = smoothstep(uFade * 0.35, uFade, -mvPosition.z);
  // Del ojo a este vértice en el mundo (para saber si cae dentro del haz de la linterna).
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vRay = aBank.xyz + right * position.x * aSize + up * position.y * aSize * 0.45 - cameraPosition;
  mvPosition.xy += position.xy * vec2(aSize, aSize * 0.45);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const BANK_FRAG = /* glsl */ `
uniform float uTime;
uniform vec3 uColor;
uniform float uOpacity;
uniform vec4 uBeam;
uniform vec2 uBeamCone;
uniform vec3 uBeamColor;
uniform float uBeamClear;
varying vec2 vUv;
varying float vSeed;
varying float vNear;
varying vec3 vRay;
#include <fog_pars_fragment>
${NOISE}
void main() {
  vec2 p = vUv - 0.5;
  float r = length(p * vec2(1.0, 1.6)) * 2.0;
  float n = fFbm(vUv * 2.6 + vec2(uTime * 0.03 + vSeed, vSeed * 1.7 - uTime * 0.012));
  float a = smoothstep(1.0, 0.15, r) * smoothstep(0.25, 0.75, n) * uOpacity * vNear;
  if (a < 0.004) discard;
  vec3 c = uColor;
  // Dentro del círculo de la linterna la bruma brilla un poco pero se ve a través (la luz la atraviesa).
  float dist = length(vRay);
  float cone = smoothstep(uBeamCone.x - 0.03, uBeamCone.y, dot(vRay / max(dist, 1e-3), uBeam.xyz));
  float lit = uBeam.w * cone / (1.0 + dist * 0.09);
  c += uBeamColor * lit * 1.4;
  a *= 1.0 - uBeamClear * cone * 0.7;
  #ifdef USE_FOG
    float f = smoothstep(fogNear, fogFar, vFogDepth);
    c = mix(c, fogColor, f);
    a *= 1.0 - f * 0.6;
  #endif
  gl_FragColor = vec4(c, a);
}`;

/**
 * Bancos de niebla alrededor de la cámara. opts: { count, radius (m), color, opacity }.
 * update(dt, camera) los mueve con el viento y recicla los que quedan lejos.
 */
export function fogBanks({ count = 42, radius = 34, color = '#5a6678', opacity = 0.22 } = {}) {
  const geo = new THREE.InstancedBufferGeometry().copy(new THREE.PlaneGeometry(1, 1));
  geo.instanceCount = count;
  const data = new Float32Array(count * 4);
  const size = new Float32Array(count);
  const attr = new THREE.InstancedBufferAttribute(data, 4);
  attr.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aBank', attr);
  geo.setAttribute('aSize', new THREE.InstancedBufferAttribute(size, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 }, uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity }, uFade: { value: 6 } }]),
    vertexShader: BANK_VERT,
    fragmentShader: BANK_FRAG,
    transparent: true,
    depthWrite: false,
    fog: true,
  });
  // El haz de la linterna es el mismo que el de la niebla baja (uniformes compartidos).
  for (const k of ['uBeam', 'uBeamCone', 'uBeamColor', 'uBeamClear']) mat.uniforms[k] = HEIGHT_FOG[k];
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.userData.noShadow = true;
  mesh.userData.dynamic = true;
  mesh.renderOrder = 3;
  const wind = new THREE.Vector2(0.45, 0.18);
  const place = (i, cx, cz, anywhere) => {
    // Anillo alrededor de la cámara (al reciclar, en el borde del lado de donde viene el viento).
    const a = Math.random() * Math.PI * 2;
    const d = anywhere ? 4 + Math.random() * radius : radius * (0.75 + Math.random() * 0.25);
    data[i * 4] = cx + Math.cos(a) * d;
    data[i * 4 + 1] = 0.5 + Math.random() * 1.6;
    data[i * 4 + 2] = cz + Math.sin(a) * d;
    data[i * 4 + 3] = Math.random() * 50;
    size[i] = 7 + Math.random() * 9;
  };
  for (let i = 0; i < count; i++) place(i, 0, 0, true);
  let started = false;
  return {
    mesh,
    setOpacity(v) {
      mat.uniforms.uOpacity.value = v;
    },
    setColor(c) {
      mat.uniforms.uColor.value.set(c);
    },
    update(dt, camera) {
      if (!camera) return;
      const cx = camera.position.x;
      const cz = camera.position.z;
      if (!started) {
        started = true;
        for (let i = 0; i < count; i++) place(i, cx, cz, true);
        geo.attributes.aSize.needsUpdate = true;
      }
      mat.uniforms.uTime.value += dt;
      for (let i = 0; i < count; i++) {
        data[i * 4] += wind.x * dt;
        data[i * 4 + 2] += wind.y * dt;
        const dx = data[i * 4] - cx;
        const dz = data[i * 4 + 2] - cz;
        if (dx * dx + dz * dz > radius * radius * 1.3) {
          place(i, cx, cz, false);
          geo.attributes.aSize.needsUpdate = true;
        }
      }
      attr.needsUpdate = true;
    },
  };
}
