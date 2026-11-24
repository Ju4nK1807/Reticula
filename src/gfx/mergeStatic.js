import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const CELL = 30;
const _c = new THREE.Vector3();

function signature(geometry) {
  const attrs = Object.keys(geometry.attributes).sort().join(',');
  return `${attrs}|${geometry.index ? 'i' : 'n'}`;
}

export function mergeStatic(world) {
  const scene = world.scene;
  scene.updateMatrixWorld(true);
  const groups = new Map();
  for (const o of scene.children) {
    if (!o.isMesh || o.isSkinnedMesh || o.isInstancedMesh || o.userData.dynamic) continue;
    if (Array.isArray(o.material) || !o.visible) continue;
    if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
    const big = o.geometry.boundingSphere.radius * o.matrixWorld.getMaxScaleOnAxis() > CELL;
    o.getWorldPosition(_c);
    const cell = big ? 'grande' : `${Math.floor(_c.x / CELL)},${Math.floor(_c.z / CELL)}`;
    const key = `${o.material.uuid}|${signature(o.geometry)}|${o.castShadow ? 1 : 0}${o.receiveShadow ? 1 : 0}|${cell}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(o);
  }

  let merged = 0;
  let created = 0;
  for (const meshes of groups.values()) {
    if (meshes.length < 2) continue;
    const geos = meshes.map((m) => m.geometry.clone().applyMatrix4(m.matrixWorld));
    const geometry = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    if (!geometry) continue;
    geometry.computeBoundingSphere();
    geometry.computeBoundingBox();
    const first = meshes[0];
    const mesh = new THREE.Mesh(geometry, first.material);
    mesh.name = `merged:${first.material.name || first.material.type}`;
    mesh.castShadow = first.castShadow;
    mesh.receiveShadow = first.receiveShadow;
    mesh.matrixAutoUpdate = false;
    mesh.userData.merged = meshes.length;
    scene.add(mesh);
    for (const m of meshes) {
      m.updateMatrixWorld(true);
      scene.remove(m);
    }
    merged += meshes.length;
    created++;
  }
  for (const o of scene.children) {
    if (o.isMesh && !o.isSkinnedMesh && !o.userData.dynamic) o.matrixAutoUpdate = false;
  }
  return { merged, created };
}
