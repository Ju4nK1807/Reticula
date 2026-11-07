import * as THREE from 'three';

/*
  Cielo procedural para los mapas al aire libre (un solo sombreador, sin texturas que descargar):
  degradado del horizonte al cénit, resplandor en el horizonte (ciudad, fuego o neón), estrellas que
  titilan y una luna con halo. El color del horizonte es el de la niebla del mapa: la geometría lejana
  se funde con el cielo sin costura.

  Es una esfera grande que sigue a la cámara, dibujada primero y sin escribir profundidad. No proyecta
  sombras ni entra en los raycasts.
*/

const vertexShader = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = p.xyww; // siempre en el fondo
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uZenith;
  uniform vec3 uHorizon;
  uniform vec3 uGlow;
  uniform float uGlowAmount;
  uniform vec3 uGlowDir;
  uniform vec3 uMoonDir;
  uniform float uMoon;
  uniform float uStars;
  uniform float uTime;
  varying vec3 vDir;

  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  void main() {
    vec3 d = normalize(vDir);
    float h = clamp(d.y, -1.0, 1.0);
    // Degradado: horizonte → cénit (curva suave), bajo el horizonte el color del horizonte.
    float t = pow(clamp(h, 0.0, 1.0), 0.55);
    vec3 col = mix(uHorizon, uZenith, t);
    // Resplandor en el horizonte, más fuerte hacia uGlowDir.
    float band = exp(-max(h, 0.0) * 9.0) * (h > -0.05 ? 1.0 : 0.0);
    float toward = 0.45 + 0.55 * max(dot(normalize(vec3(d.x, 0.0, d.z)), uGlowDir), 0.0);
    col += uGlow * band * uGlowAmount * toward;
    // Estrellas: celdas en la esfera; solo arriba del horizonte y más visibles en lo alto.
    if (uStars > 0.0 && h > 0.02) {
      vec3 cell = floor(d * 220.0);
      float r = hash(cell);
      float star = step(0.9965, r);
      vec3 center = (cell + 0.5) / 220.0;
      float dist = length(d - normalize(center)) * 220.0;
      float twinkle = 0.65 + 0.35 * sin(uTime * (1.5 + r * 3.0) + r * 40.0);
      col += vec3(0.85, 0.9, 1.0) * star * smoothstep(0.65, 0.0, dist) * twinkle * uStars * smoothstep(0.02, 0.35, h);
    }
    // Luna con halo.
    if (uMoon > 0.0) {
      float m = dot(d, uMoonDir);
      col += vec3(0.95, 0.97, 1.0) * smoothstep(0.99965, 0.9998, m) * uMoon;
      col += vec3(0.55, 0.65, 0.85) * pow(max(m, 0.0), 220.0) * 0.55 * uMoon;
      col += vec3(0.25, 0.32, 0.45) * pow(max(m, 0.0), 18.0) * 0.18 * uMoon;
    }
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/**
 * @param {{ zenith: string, horizon: string, glow?: string, glowAmount?: number, glowDir?: number,
 *   moonDir?: [number, number, number] | null, moon?: number, stars?: number }} opts
 *   glowDir: ángulo (rad, en planta) hacia donde el resplandor es más fuerte.
 */
export function createSky({ zenith, horizon, glow = '#000000', glowAmount = 0, glowDir = 0, moonDir = null, moon = 1, stars = 1 }) {
  const lin = (c) => new THREE.Color(c); // los colores de THREE.Color ya están en lineal
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uZenith: { value: lin(zenith) },
      uHorizon: { value: lin(horizon) },
      uGlow: { value: lin(glow) },
      uGlowAmount: { value: glowAmount },
      uGlowDir: { value: new THREE.Vector3(Math.sin(glowDir), 0, -Math.cos(glowDir)) },
      uMoonDir: { value: new THREE.Vector3(...(moonDir ?? [0, 1, 0])).normalize() },
      uMoon: { value: moonDir ? moon : 0 },
      uStars: { value: stars },
      uTime: { value: 0 },
    },
    vertexShader,
    fragmentShader,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(300, 32, 16), material);
  sky.name = 'Cielo';
  sky.frustumCulled = false;
  sky.renderOrder = -1000;
  sky.userData.dynamic = true; // no se une a la geometría fija
  sky.userData.noShadow = true;
  sky.castShadow = false;
  sky.receiveShadow = false;
  const start = typeof performance !== 'undefined' ? performance.now() : 0;
  // Sigue a la cámara (nunca se llega al borde) y hace titilar las estrellas.
  sky.onBeforeRender = (renderer, scene, camera) => {
    sky.position.copy(camera.position);
    sky.updateMatrixWorld();
    material.uniforms.uTime.value = ((typeof performance !== 'undefined' ? performance.now() : 0) - start) / 1000;
  };
  return sky;
}

// Paletas de cielo por ambiente (los mapas eligen una y pueden ajustar algo).
export const SKIES = {
  night: { zenith: '#04070f', horizon: '#141c2a', glow: '#2a3f66', glowAmount: 0.35, moonDir: [-0.45, 0.55, -0.7], stars: 1 },
  city: { zenith: '#070a18', horizon: '#2a2238', glow: '#ff8a4c', glowAmount: 0.55, glowDir: 0, moonDir: [0.5, 0.42, -0.75], stars: 0.55 },
  neon: { zenith: '#05060f', horizon: '#121a2a', glow: '#2dffc0', glowAmount: 0.3, glowDir: Math.PI, moonDir: null, stars: 0.8 },
  fire: { zenith: '#05070c', horizon: '#1a1414', glow: '#ff6a2a', glowAmount: 0.6, glowDir: 0.8, moonDir: [-0.35, 0.5, 0.8], stars: 0.7 },
};
