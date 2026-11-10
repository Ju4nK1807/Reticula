import * as THREE from 'three';
import { patchHeightFog } from './atmosphere.js';

/*
  Material realista de los zombis: un solo material por zombi (una llamada de dibujo) sobre el atlas
  de texturas PBR del modelo (ropa a la izquierda, cuerpo a la derecha, ojos y boca en dos muestras).

  Sobre el MeshStandardMaterial de three.js, el sombreador añade:
  - Variación por zombi sin texturas extra: tono de piel (pálido, ceniza, verdoso, amoratado), color
    de la ropa y cantidad de sangre. La horda no parece hecha de clones.
  - Heridas donde entran las balas: hasta MAX_WOUNDS puntos en el espacio de reposo del modelo (se
    pegan al cuerpo aunque se mueva). Sangre oscura y húmeda (brilla) con borde irregular.
  - Borde frío (luz de luna) en la silueta: se lee contra la oscuridad sin aplanar el sombreado.
  - Ojos que brillan (con el bloom de la calidad alta se ven como brasas).
  - Payasos: traje de colores con lunares, rayas o rombos (sucio y ensangrentado), cara pintada de
    blanco descascarado, rombos negros en los ojos y una sonrisa roja. La nariz, el pelo, el sombrero y
    la gola son piezas aparte pegadas a los huesos (zombieSkin.js); la cara se ubica con setZombieFace.
  Las texturas se cargan una vez y se comparten: 2048×1024 en calidad alta, 1024×512 en media y baja.
*/

const BASE = `${import.meta.env?.BASE_URL ?? './'}models/characters/zombie/`;
export const MAX_WOUNDS = 6;
const SIZE_FOR = { alta: '1k', media: '512', baja: '512' };

let detail = 'alta';
const textures = new Map(); // `${size}/${map}` → Texture
const looks = new Set(); // materiales vivos (para cambiar la resolución en caliente)
const bitmapLoader =
  typeof document !== 'undefined' && typeof createImageBitmap === 'function'
    ? new THREE.ImageBitmapLoader().setOptions({ imageOrientation: 'flipY', premultiplyAlpha: 'none' })
    : null;

function texture(size, map) {
  const id = `${size}/${map}`;
  let tex = textures.get(id);
  if (tex) return tex;
  tex = new THREE.Texture();
  // Las UVs del modelo siguen la convención de OpenGL (v hacia arriba): la imagen va volteada.
  tex.flipY = false;
  tex.colorSpace = map === 'albedo' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.anisotropy = 4;
  if (bitmapLoader) {
    const t = tex;
    bitmapLoader
      .loadAsync(`${BASE}${id}.webp`)
      .then((bitmap) => {
        t.image = bitmap;
        t.needsUpdate = true;
      })
      .catch(() => {});
  }
  textures.set(id, tex);
  return tex;
}

function applyTextures(mat) {
  const size = SIZE_FOR[detail] ?? '1k';
  mat.map = texture(size, 'albedo');
  mat.normalMap = texture(size, 'normal');
  const orm = texture(size, 'orm');
  mat.aoMap = orm;
  mat.roughnessMap = orm;
  mat.metalnessMap = orm;
  mat.needsUpdate = true;
}

/** Detalle gráfico actual de los zombis (alta | media | baja). */
export const zombieDetail = () => detail;

/** Cambia la resolución de las texturas de todos los zombis (alta | media | baja). */
export function setZombieDetail(level) {
  const next = SIZE_FOR[level] ? level : 'alta';
  if (next === detail) return;
  const changed = SIZE_FOR[next] !== SIZE_FOR[detail];
  detail = next;
  if (!changed) return;
  for (const m of looks) applyTextures(m);
  for (const [id, t] of textures) {
    if (!id.startsWith(`${SIZE_FOR[detail]}/`)) {
      t.dispose();
      textures.delete(id);
    }
  }
}

// Paletas de variación: color medio de la piel y de la ropa (el detalle lo pone la textura).
const SKINS = ['#6f7062', '#646b5c', '#77695f', '#5d6566', '#6e5f63', '#6a6150', '#7a7468'];
const CLOTHES = ['#2c3340', '#3b3026', '#2b3326', '#3a3a3a', '#3d2626', '#262d38', '#4a3e2e', '#4d4d52'];
const EYES = { normal: '#ffb347', brute: '#ff4a2a', runner: '#ffd27a' };
// Trajes de payaso: color de fondo y del estampado (apagados: la tela está vieja y sucia).
const SUITS = [
  ['#7a1612', '#c9b48a'],
  ['#a07a12', '#6a1a6a'],
  ['#3e2366', '#b8a020'],
  ['#1f5a2a', '#b23a1e'],
  ['#1c3a7a', '#c9c2b0'],
  ['#b5ae9e', '#7a1612'],
  ['#8a3a0e', '#1c3a7a'],
  ['#5a1240', '#2f7a6a'],
];
// Dónde está la cara en el modelo en reposo (cm): la nariz (xyz) y el ancho de la cabeza (w); la base
// y la cima de la cabeza y la profundidad media (z). La calcula zombieSkin.js al cargar el modelo.
const FACE = {
  uFace: { value: new THREE.Vector4(0, 165, 12, 16) },
  uFace2: { value: new THREE.Vector4(148, 182, 2, 0) },
  uRimK: { value: 1 }, // fuerza del borde de luz de luna (el modo zombi lo baja: noche sin luna)
};

/** Fuerza del borde de luz de luna de todos los zombis (1 = normal). */
export function setZombieRim(k) {
  FACE.uRimK.value = k;
}

/** Ubica la cara del modelo (para el maquillaje): nariz, ancho, base, cima y centro de la cabeza (cm). */
export function setZombieFace({ nose, width, bottom, top, centerZ }) {
  FACE.uFace.value.set(nose.x, nose.y, nose.z, width);
  FACE.uFace2.value.set(bottom, top, centerZ, 0);
}

const vertexPars = /* glsl */ `
varying vec3 vBind;
`;
const fragmentPars = /* glsl */ `
varying vec3 vBind;
uniform vec3 uSkin;
uniform vec3 uCloth;
uniform float uBlood;
uniform vec3 uEye;
uniform float uEyeGlow;
uniform vec3 uRim;
uniform vec4 uWounds[${MAX_WOUNDS}];
uniform vec4 uClown; // x: disfraz · y: estampado (0 lunares, 1 rayas, 2 rombos) · z: pintura de la cara
uniform vec3 uClownA;
uniform vec3 uClownB;
uniform vec4 uFace;
uniform vec4 uFace2;
uniform float uRimK;
float zHash(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float zNoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(zHash(i), zHash(i + vec3(1, 0, 0)), f.x), mix(zHash(i + vec3(0, 1, 0)), zHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(zHash(i + vec3(0, 0, 1)), zHash(i + vec3(1, 0, 1)), f.x), mix(zHash(i + vec3(0, 1, 1)), zHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
`;
// Después de leer el albedo: separa ropa, piel, ojos y boca por la zona del atlas y tiñe.
const colorChunk = /* glsl */ `
#include <map_fragment>
vec2 zUv = vMapUv;
float zSwatch = step(zUv.x, 0.5) * step(zUv.y, 0.32);
float zEyes = zSwatch * step(zUv.x, 0.24);
float zCloth = step(zUv.x, 0.5) * (1.0 - zSwatch);
vec3 zc = diffuseColor.rgb;
float zLum = dot(zc, vec3(0.2126, 0.7152, 0.0722));
// En lineal, casi toda la textura original es "rojiza" (marrón): la sangre son solo las manchas más
// rojas (el cuartil de arriba). El resto se pasa a gris y se tiñe con la piel o la ropa de este zombi,
// normalizado por la luminancia media de cada parte (la ropa original es mucho más oscura).
float zRed = clamp((zc.r - max(zc.g, zc.b)) / max(zc.r, 1e-3), 0.0, 1.0);
// Mugre en grande (ruido en el espacio del cuerpo): manchas que no siguen las costuras de las UVs.
float zGrime = zNoise(vBind * 0.09) * 0.6 + zNoise(vBind * 0.31) * 0.4;
float zBlood = smoothstep(0.9, 0.98, zRed) * uBlood * smoothstep(0.3, 0.65, zGrime + 0.15) * 0.8;
// Sangre donde la tendría un cadáver que comió: de la boca por el mentón y el pecho (chorreones
// verticales) y en las manos y antebrazos. Coordenadas del modelo en reposo: cm, +z al frente.
float zFront = smoothstep(1.0, 8.0, vBind.z) * (1.0 - smoothstep(8.0, 15.0, abs(vBind.x)));
float zChin = smoothstep(112.0, 130.0, vBind.y) * (1.0 - smoothstep(157.0, 162.0, vBind.y));
float zStreak = smoothstep(0.42, 0.78, zNoise(vec3(vBind.x * 0.5, vBind.y * 0.045, vBind.z * 0.2)));
float zHands = smoothstep(58.0, 74.0, abs(vBind.x)) * smoothstep(0.35, 0.7, zNoise(vBind * 0.22));
zBlood = max(zBlood, max(zFront * zChin * zStreak, zHands * 0.85) * uBlood);
// Salpicaduras grandes por todo el traje y chorreones que bajan (más sangre: es una masacre).
float zSplash = smoothstep(0.6, 0.68, zNoise(vBind * 0.16) * 0.75 + zNoise(vBind * 0.6) * 0.25);
float zDrip = smoothstep(0.55, 0.8, zNoise(vec3(vBind.x * 0.7, vBind.y * 0.03, vBind.z * 0.7))) * smoothstep(60.0, 140.0, vBind.y);
zBlood = max(zBlood, max(zSplash, zDrip * 0.8) * uBlood * 0.95);
float zRel = clamp(zLum / mix(0.0485, 0.0094, zCloth), 0.0, 1.9);
zRel = pow(zRel, 1.35); // más contraste: las grietas y pliegues se hunden
// Traje de payaso: estampado en el espacio del cuerpo (no sigue las costuras de las UVs).
float zPat;
if (uClown.y < 0.5) zPat = 1.0 - smoothstep(0.22, 0.27, length(fract(vBind / 11.0) - 0.5));
else if (uClown.y < 1.5) zPat = step(0.5, fract((vBind.x + vBind.z * 0.35) / 9.0));
else {
  vec2 zd = step(0.5, fract(vec2(vBind.x + vBind.y, vBind.x - vBind.y) / 15.0));
  zPat = abs(zd.x - zd.y);
}
vec3 zClothCol = mix(uCloth, mix(uClownA, uClownB, zPat), uClown.x);
vec3 zBase = mix(uSkin, zClothCol, zCloth) * zRel;
// Maquillaje: solo en la piel de la cara (delante y por encima del mentón).
float zHH = uFace2.y - uFace2.x;
float zFace = (1.0 - zCloth) * smoothstep(uFace2.x + 0.04 * zHH, uFace2.x + 0.16 * zHH, vBind.y) * smoothstep(uFace2.z - 1.0, uFace2.z + 4.0, vBind.z);
float zPeel = smoothstep(0.24, 0.4, zNoise(vBind * 0.42) * 0.7 + zNoise(vBind * 1.3) * 0.3);
vec3 zPaint = vec3(0.66, 0.64, 0.6) * (0.75 + 0.25 * min(zRel, 1.4));
float zMx = vBind.x - uFace.x;
// Rombos negros sobre los ojos, estirados hacia abajo como lágrimas.
vec2 zEyeP = vec2(abs(zMx) - 0.2 * uFace.w, vBind.y - (uFace.y + 0.14 * zHH));
float zEyeMk = 1.0 - smoothstep(0.85, 1.0, abs(zEyeP.x) / (0.16 * uFace.w) + abs(zEyeP.y) / (zEyeP.y < 0.0 ? 0.3 * zHH : 0.15 * zHH));
// Sonrisa roja que sube hacia las mejillas.
float zMy = vBind.y - (uFace.y - 0.19 * zHH) - 0.07 * zMx * zMx;
float zSmile = (1.0 - smoothstep(0.9, 1.5, abs(zMy))) * (1.0 - smoothstep(0.36 * uFace.w, 0.42 * uFace.w, abs(zMx)));
vec3 zFaceCol = mix(zPaint, vec3(0.012, 0.012, 0.02), zEyeMk);
zFaceCol = mix(zFaceCol, vec3(0.16, 0.008, 0.006), zSmile);
zBase = mix(zBase, zFaceCol, zFace * uClown.z * max(zPeel, max(zEyeMk, zSmile)));
// Mugre: manchas grandes y los pies y bajos del pantalón más sucios.
zBase *= (0.62 + 0.5 * zGrime) * mix(0.55, 1.0, smoothstep(8.0, 45.0, vBind.y));
vec3 zBloodCol = vec3(0.048, 0.0075, 0.0055) * (0.7 + zRel * 0.4); // sangre seca: granate oscuro
// Heridas de bala: centro casi negro, borde rojo oscuro e irregular.
float zWound = 0.0;
for (int i = 0; i < ${MAX_WOUNDS}; i++) {
  vec4 w = uWounds[i];
  if (w.w > 0.0) {
    float d = distance(vBind, w.xyz) / w.w + (zNoise(vBind * 0.8 + float(i) * 7.0) - 0.5) * 0.7;
    zWound = max(zWound, 1.0 - smoothstep(0.55, 1.0, d));
  }
}
zc = mix(zBase, zBloodCol, max(zBlood, zWound * 0.85));
zc = mix(zc, vec3(0.035, 0.004, 0.003), smoothstep(0.75, 1.0, zWound));
diffuseColor.rgb = mix(zc, diffuseColor.rgb, zSwatch);
`;
// Piel muerta y tela: mates. La sangre fresca de las heridas brilla.
const roughChunk = /* glsl */ `
#include <roughnessmap_fragment>
roughnessFactor = max(roughnessFactor, mix(0.6, 0.84, zCloth));
roughnessFactor = mix(roughnessFactor, 0.24, max(zWound, zBlood * 0.35));
`;
const emissiveChunk = /* glsl */ `
#include <emissivemap_fragment>
totalEmissiveRadiance += uEye * uEyeGlow * zEyes;
`;
// Borde de luz fría en la silueta (antes de escribir el color).
const rimChunk = /* glsl */ `
float zFres = pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 3.0);
outgoingLight += uRim * uRimK * zFres * (1.0 - zSwatch);
#include <opaque_fragment>
`;

function patch(shader, u) {
  Object.assign(shader.uniforms, u);
  patchHeightFog(shader); // la misma bruma baja que el mapa
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>\n${vertexPars}`)
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBind = position;');
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>\n${fragmentPars}`)
    .replace('#include <map_fragment>', colorChunk)
    .replace('#include <roughnessmap_fragment>', roughChunk)
    .replace('#include <emissivemap_fragment>', emissiveChunk)
    .replace('#include <opaque_fragment>', rimChunk);
}

/**
 * Material de un zombi (uno por zombi: sus uniformes son su apariencia y sus heridas).
 * @returns {THREE.MeshStandardMaterial & { look: ZombieLook }}
 */
export function createZombieMaterial() {
  const mat = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 1 });
  mat.emissive = new THREE.Color('#ff3b2f');
  mat.emissiveIntensity = 0;
  mat.aoMapIntensity = 0.9;
  mat.normalScale.set(0.75, 0.75); // el relieve original es muy marcado: con luz rasante parecía arena
  const u = {
    uSkin: { value: new THREE.Color(SKINS[0]) },
    uCloth: { value: new THREE.Color(CLOTHES[0]) },
    uBlood: { value: 0.8 },
    uEye: { value: new THREE.Color(EYES.normal) },
    uEyeGlow: { value: 1.7 },
    uRim: { value: new THREE.Color('#3a5070').multiplyScalar(0.8) },
    uWounds: { value: Array.from({ length: MAX_WOUNDS }, () => new THREE.Vector4(0, 0, 0, 0)) },
    uClown: { value: new THREE.Vector4(1, 0, 1, 0) },
    uClownA: { value: new THREE.Color(SUITS[0][0]) },
    uClownB: { value: new THREE.Color(SUITS[0][1]) },
    uFace: FACE.uFace,
    uFace2: FACE.uFace2,
    uRimK: FACE.uRimK,
  };
  mat.onBeforeCompile = (shader) => patch(shader, u);
  mat.customProgramCacheKey = () => 'zombie-look-2|hfog1';
  mat.look = new ZombieLook(u);
  applyTextures(mat);
  looks.add(mat);
  mat.addEventListener('dispose', () => looks.delete(mat));
  return mat;
}

/** Apariencia de un zombi (uniformes de su material). */
export class ZombieLook {
  constructor(u) {
    this.u = u;
    this.next = 0;
  }

  /** Aspecto al azar según el tipo (normal | brute | runner). */
  randomize(kind = 'normal', rng = Math.random) {
    const pick = (list) => list[Math.floor(rng() * list.length) % list.length];
    this.u.uSkin.value.set(pick(SKINS));
    this.u.uCloth.value.set(pick(CLOTHES));
    if (kind === 'brute') {
      this.u.uSkin.value.multiplyScalar(0.72);
      this.u.uCloth.value.multiplyScalar(0.7);
    }
    this.u.uBlood.value = 0.8 + rng() * 0.4;
    // Disfraz de payaso: colores y estampado al azar; algunos con la pintura casi toda caída.
    const [a, b] = pick(SUITS);
    this.u.uClownA.value.set(a);
    this.u.uClownB.value.set(b);
    this.u.uClown.value.set(1, Math.floor(rng() * 3), rng() < 0.2 ? 0.55 : 1, 0);
    if (kind === 'brute') {
      this.u.uClownA.value.multiplyScalar(0.7);
      this.u.uClownB.value.multiplyScalar(0.7);
    }
    this.u.uEye.value.set(EYES[kind] ?? EYES.normal);
    this.u.uEyeGlow.value = kind === 'brute' ? 2.4 : 1.5 + rng() * 0.5;
    this.clearWounds();
  }

  clearWounds() {
    for (const w of this.u.uWounds.value) w.set(0, 0, 0, 0);
    this.next = 0;
  }

  /** Herida en el punto `bind` (espacio de reposo del modelo, cm) de radio `r` cm. */
  addWound(bind, r) {
    const w = this.u.uWounds.value[this.next];
    w.set(bind.x, bind.y, bind.z, r);
    this.next = (this.next + 1) % MAX_WOUNDS;
    this.u.uBlood.value = Math.min(1.5, this.u.uBlood.value + 0.06);
  }
}
