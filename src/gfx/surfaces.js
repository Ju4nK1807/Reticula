import * as THREE from 'three';
import CATALOG from './surfaces.json';
import STATS from './textureStats.json';

const BASE = `${import.meta.env?.BASE_URL ?? './'}textures/`;
const DETAIL = { alta: { size: '1k', normal: true, arm: true }, media: { size: '512', normal: true, arm: true }, baja: { size: '512', normal: false, arm: false } };
const MAX_TINT = 6;
const GLOW_HDR = 1.8;

let detail = 'alta';
let anisotropy = 1;
const loader = new THREE.TextureLoader();
const bitmapLoader =
  typeof document !== 'undefined' && typeof createImageBitmap === 'function'
    ? new THREE.ImageBitmapLoader().setOptions({ imageOrientation: 'flipY', premultiplyAlpha: 'none' })
    : null;
const pending = new Set();

export function whenSurfacesReady() {
  return Promise.all([...pending]);
}
const textures = new Map();
const materials = new Set();
const glows = new Set();
let bloomOn = false;

export const SURFACE_KEYS = Object.keys(CATALOG).filter((k) => !k.startsWith('_'));

export function tileOf(material) {
  return material?.userData?.tile ?? null;
}

function texture(key, size, map) {
  const id = `${key}/${size}/${map}`;
  let tex = textures.get(id);
  if (!tex) {
    const url = `${BASE}${id}.webp`;
    if (typeof document === 'undefined') {
      tex = new THREE.Texture();
    } else if (bitmapLoader) {
      tex = new THREE.Texture();
      tex.flipY = false;
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

export function tintFor(key, color, max = MAX_TINT) {
  const target = new THREE.Color(color);
  const mean = STATS[key]?.mean ?? [0.5, 0.5, 0.5];
  return new THREE.Color(
    Math.min(max, target.r / Math.max(mean[0], 1e-3)),
    Math.min(max, target.g / Math.max(mean[1], 1e-3)),
    Math.min(max, target.b / Math.max(mean[2], 1e-3)),
  );
}

function applyDetail(mat) {
  const key = mat.userData.surface;
  const d = DETAIL[detail];
  mat.map = texture(key, d.size, 'albedo');
  mat.normalMap = d.normal ? texture(key, d.size, 'normal') : null;
  const arm = d.arm ? texture(key, d.size, 'arm') : null;
  const u = mat.userData;
  mat.aoMap = arm;
  mat.roughnessMap = arm;
  mat.metalnessMap = u.metalMap === false ? null : arm;
  mat.roughness = arm ? (u.rough ?? 1) : (u.baseRough ?? 0.88);
  mat.metalness = arm || u.metalMap === false ? u.metal : 0;
  mat.needsUpdate = true;
}

export function surface(key, color, { flat = false, metal = 0.35, normalScale = 1, metalMap = true, rough, baseRough, maxTint = MAX_TINT } = {}) {
  if (!CATALOG[key]) throw new Error(`Superficie desconocida: ${key}`);
  const mat = new THREE.MeshStandardMaterial({ color: tintFor(key, color, maxTint), flatShading: flat });
  mat.normalScale.set(normalScale, normalScale);
  mat.aoMapIntensity = 0.8;
  mat.userData = { surface: key, tile: CATALOG[key].tile, metal, metalMap, rough, baseRough };
  applyDetail(mat);
  materials.add(mat);
  mat.addEventListener('dispose', () => materials.delete(mat));
  return mat;
}

export function glow(color, { fog = true } = {}) {
  const mat = new THREE.MeshBasicMaterial({ color, toneMapped: false, fog });
  mat.userData.glow = new THREE.Color(color);
  if (bloomOn) mat.color.copy(mat.userData.glow).multiplyScalar(GLOW_HDR);
  glows.add(mat);
  mat.addEventListener('dispose', () => glows.delete(mat));
  return mat;
}

export function setSurfaceDetail(level, maxAnisotropy = 1) {
  const next = DETAIL[level] ? level : 'alta';
  anisotropy = next === 'alta' ? Math.min(8, maxAnisotropy) : Math.min(2, maxAnisotropy);
  if (next === detail && textures.size) {
    for (const t of textures.values()) t.anisotropy = anisotropy;
    return;
  }
  detail = next;
  for (const mat of materials) applyDetail(mat);
  const used = new Set();
  for (const mat of materials) for (const t of [mat.map, mat.normalMap, mat.aoMap]) if (t) used.add(t);
  for (const [id, t] of textures) {
    if (!used.has(t)) {
      t.dispose();
      textures.delete(id);
    }
  }
}

export function glowScale() {
  return bloomOn ? GLOW_HDR : 1;
}

export function setGlowBloom(on) {
  bloomOn = on;
  for (const mat of glows) {
    mat.color.copy(mat.userData.glow);
    if (on) mat.color.multiplyScalar(GLOW_HDR);
  }
}

export function boxWorldUV(geometry, w, h, d, tile) {
  const uv = geometry.attributes.uv;
  const faces = [
    [d, h], [d, h],
    [w, d], [w, d],
    [w, h], [w, h],
  ];
  for (let f = 0; f < 6; f++) {
    const [su, sv] = faces[f];
    for (let i = f * 4; i < f * 4 + 4; i++) uv.setXY(i, (uv.getX(i) * su) / tile, (uv.getY(i) * sv) / tile);
  }
  uv.needsUpdate = true;
  return geometry;
}

export function planeWorldUV(geometry, w, d, tile) {
  const uv = geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / tile, (uv.getY(i) * d) / tile);
  uv.needsUpdate = true;
  return geometry;
}

export function paint(color, { roughness = 0.38, metalness = 0.25 } = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}
