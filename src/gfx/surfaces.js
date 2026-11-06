import * as THREE from 'three';
import CATALOG from './surfaces.json';
import STATS from './textureStats.json';

/*
  Superficies PBR de los mapas (texturas CC0 de Poly Haven, ver tools/textures.py).

  surface('concrete', '#4a5260') devuelve un MeshStandardMaterial con las texturas de la superficie
  y el color de la paleta del mapa: el albedo se escala para que su color MEDIO sea exactamente ese
  color (la dirección de arte de cada mapa no cambia; la textura solo añade detalle).

  Nivel de detalle (setSurfaceDetail), según la calidad gráfica:
  - alta:  texturas 1K con color, relieve (normal) y ARM (oclusión, rugosidad, metal).
  - media: texturas 512 (4 veces menos memoria) con las tres capas.
  - baja:  texturas 512 solo de color (el sombreado más barato).
  Las texturas se cargan al primer uso y se comparten entre todos los materiales.

  glow('#00ffa3') es para luces y neón: no le afecta la iluminación ni el tono, y con el bloom
  (calidad alta) brilla de verdad.
*/

const BASE = `${import.meta.env?.BASE_URL ?? './'}textures/`;
const DETAIL = { alta: { size: '1k', normal: true, arm: true }, media: { size: '512', normal: true, arm: true }, baja: { size: '512', normal: false, arm: false } };
const MAX_TINT = 6; // tope de amplificación del albedo (texturas muy oscuras en un canal)
const GLOW_HDR = 1.8; // intensidad del neón cuando hay bloom

let detail = 'alta';
let anisotropy = 1;
const loader = new THREE.TextureLoader();
// Las imágenes se decodifican fuera del hilo principal (createImageBitmap): cargar un mapa ya no
// congela el juego mientras el navegador descomprime 15-30 WebP. Ya vienen volteadas en vertical.
const bitmapLoader =
  typeof document !== 'undefined' && typeof createImageBitmap === 'function'
    ? new THREE.ImageBitmapLoader().setOptions({ imageOrientation: 'flipY', premultiplyAlpha: 'none' })
    : null;
const pending = new Set(); // cargas en curso

/** Se resuelve cuando terminaron de cargar todas las texturas pedidas hasta ahora. */
export function whenSurfacesReady() {
  return Promise.all([...pending]);
}
const textures = new Map(); // `${key}/${size}/${map}` → Texture
const materials = new Set(); // superficies creadas (para cambiar el detalle en caliente)
const glows = new Set();
let bloomOn = false;

export const SURFACE_KEYS = Object.keys(CATALOG).filter((k) => !k.startsWith('_'));

/** Metros que ocupa una repetición de la textura (para calcular UVs en metros). */
export function tileOf(material) {
  return material?.userData?.tile ?? null;
}

function texture(key, size, map) {
  const id = `${key}/${size}/${map}`;
  let tex = textures.get(id);
  if (!tex) {
    const url = `${BASE}${id}.webp`;
    if (typeof document === 'undefined') {
      tex = new THREE.Texture(); // sin navegador (pruebas en Node): textura vacía, el mapa se construye igual
    } else if (bitmapLoader) {
      tex = new THREE.Texture();
      tex.flipY = false; // el bitmap ya viene volteado
      const t = tex;
      const job = bitmapLoader
        .loadAsync(url)
        .then((bitmap) => {
          t.image = bitmap;
          t.needsUpdate = true;
        })
        .catch(() => {})
        .finally(() => pending.delete(job));
      pending.add(job);
    } else {
      tex = loader.load(url);
    }
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = map === 'albedo' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    tex.anisotropy = anisotropy;
    textures.set(id, tex);
  }
  return tex;
}

// Color que, multiplicado por el albedo medio de la textura, da el color de la paleta.
export function tintFor(key, color) {
  const target = new THREE.Color(color); // lineal
  const mean = STATS[key]?.mean ?? [0.5, 0.5, 0.5];
  return new THREE.Color(
    Math.min(MAX_TINT, target.r / Math.max(mean[0], 1e-3)),
    Math.min(MAX_TINT, target.g / Math.max(mean[1], 1e-3)),
    Math.min(MAX_TINT, target.b / Math.max(mean[2], 1e-3)),
  );
}

function applyDetail(mat) {
  const key = mat.userData.surface;
  const d = DETAIL[detail];
  mat.map = texture(key, d.size, 'albedo');
  mat.normalMap = d.normal ? texture(key, d.size, 'normal') : null;
  const arm = d.arm ? texture(key, d.size, 'arm') : null;
  mat.aoMap = arm;
  mat.roughnessMap = arm;
  mat.metalnessMap = arm;
  // Sin ARM: rugoso y no metálico (aspecto mate uniforme).
  mat.roughness = arm ? 1 : 0.88;
  mat.metalness = arm ? mat.userData.metal : 0;
  mat.needsUpdate = true;
}

/**
 * Material de superficie.
 * @param {string} key  clave de src/gfx/surfaces.json
 * @param {THREE.ColorRepresentation} color  color medio deseado (el de la paleta del mapa)
 * @param {{ flat?: boolean, metal?: number, normalScale?: number }} [opts]
 */
export function surface(key, color, { flat = false, metal = 0.35, normalScale = 1 } = {}) {
  if (!CATALOG[key]) throw new Error(`Superficie desconocida: ${key}`);
  const mat = new THREE.MeshStandardMaterial({ color: tintFor(key, color), flatShading: flat });
  mat.normalScale.set(normalScale, normalScale);
  mat.aoMapIntensity = 0.8;
  mat.userData = { surface: key, tile: CATALOG[key].tile, metal };
  applyDetail(mat);
  materials.add(mat);
  mat.addEventListener('dispose', () => materials.delete(mat));
  return mat;
}

/** Luz o neón: color plano, sin tono ni niebla; con bloom se vuelve HDR y brilla. */
export function glow(color, { fog = true } = {}) {
  const mat = new THREE.MeshBasicMaterial({ color, toneMapped: false, fog });
  mat.userData.glow = new THREE.Color(color);
  if (bloomOn) mat.color.copy(mat.userData.glow).multiplyScalar(GLOW_HDR);
  glows.add(mat);
  mat.addEventListener('dispose', () => glows.delete(mat));
  return mat;
}

/** Cambia el detalle de todas las superficies (alta | media | baja). */
export function setSurfaceDetail(level, maxAnisotropy = 1) {
  const next = DETAIL[level] ? level : 'alta';
  anisotropy = next === 'alta' ? Math.min(8, maxAnisotropy) : Math.min(2, maxAnisotropy);
  if (next === detail && textures.size) {
    for (const t of textures.values()) t.anisotropy = anisotropy;
    return;
  }
  detail = next;
  for (const mat of materials) applyDetail(mat);
  // Libera de la GPU las texturas que ya no usa ningún material.
  const used = new Set();
  for (const mat of materials) for (const t of [mat.map, mat.normalMap, mat.aoMap]) if (t) used.add(t);
  for (const [id, t] of textures) {
    if (!used.has(t)) {
      t.dispose();
      textures.delete(id);
    }
  }
}

/** Activa el brillo HDR de los materiales glow (solo cuando hay bloom). */
export function setGlowBloom(on) {
  bloomOn = on;
  for (const mat of glows) {
    mat.color.copy(mat.userData.glow);
    if (on) mat.color.multiplyScalar(GLOW_HDR);
  }
}

/**
 * UVs en metros para una caja (BoxGeometry de 1 segmento): cada cara repite la textura según su
 * tamaño real, así un muro de 40 m no la estira. Orden de caras de Three: +x, -x, +y, -y, +z, -z.
 */
export function boxWorldUV(geometry, w, h, d, tile) {
  const uv = geometry.attributes.uv;
  const faces = [
    [d, h], [d, h], // ±x: ancho = profundidad, alto = altura
    [w, d], [w, d], // ±y
    [w, h], [w, h], // ±z
  ];
  for (let f = 0; f < 6; f++) {
    const [su, sv] = faces[f];
    for (let i = f * 4; i < f * 4 + 4; i++) uv.setXY(i, (uv.getX(i) * su) / tile, (uv.getY(i) * sv) / tile);
  }
  uv.needsUpdate = true;
  return geometry;
}

/** UVs en metros para un plano. */
export function planeWorldUV(geometry, w, d, tile) {
  const uv = geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / tile, (uv.getY(i) * d) / tile);
  uv.needsUpdate = true;
  return geometry;
}

/** Pintura lisa sin textura (autos, montacargas): semibrillante, refleja el entorno. */
export function paint(color, { roughness = 0.38, metalness = 0.25 } = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}
