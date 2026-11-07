import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/*
  Une la geometría estática de un mapa por material: decenas de cajas con el mismo material pasan a
  ser UNA malla (una llamada de dibujo, también en el pase de sombras).

  - Solo se unen los hijos directos de la escena que son mallas normales (no animadas, no
    instanciadas, sin userData.dynamic) y comparten material con al menos otra malla.
  - Se agrupan además por zonas de CELL metros: así lo que queda fuera de cámara (detrás, a los
    lados) se sigue descartando entero. Un mapa queda en unas pocas decenas de llamadas.
  - Las mallas originales salen de la escena pero se conservan tal cual (con su matriz) para los
    raycasts: world.solids las sigue usando para balas y línea de visión. Nada de la lógica cambia.
  - Las que se tocan después de crear el mapa (p. ej. las lámparas de las puertas del Bastión) tienen
    su propio material, así que nunca entran en un grupo.
*/

const CELL = 30; // m de cada zona de agrupación
const _c = new THREE.Vector3();

// Mismos atributos y mismo tipo de índice: requisito para unir geometrías.
function signature(geometry) {
  const attrs = Object.keys(geometry.attributes).sort().join(',');
  return `${attrs}|${geometry.index ? 'i' : 'n'}`;
}

/** Devuelve cuántas mallas se unieron y en cuántas quedaron. */
export function mergeStatic(world) {
  const scene = world.scene;
  scene.updateMatrixWorld(true);
  const groups = new Map();
  for (const o of scene.children) {
    if (!o.isMesh || o.isSkinnedMesh || o.isInstancedMesh || o.userData.dynamic) continue;
    if (Array.isArray(o.material) || !o.visible) continue;
    // Las piezas muy grandes (suelo, muros perimetrales) van en su propio grupo por material: dividirlas
    // por zona no sirve (cruzan varias) y se verían siempre igual.
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
    mesh.matrixAutoUpdate = false; // estática: su matriz no cambia nunca
    mesh.userData.merged = meshes.length;
    scene.add(mesh);
    // Las originales salen de la escena (no se dibujan) pero conservan su matriz para los raycasts.
    for (const m of meshes) {
      m.updateMatrixWorld(true);
      scene.remove(m);
    }
    merged += meshes.length;
    created++;
  }
  // El resto de la geometría del mapa tampoco se mueve: sin recalcular sus matrices cada cuadro.
  for (const o of scene.children) {
    if (o.isMesh && !o.isSkinnedMesh && !o.userData.dynamic) o.matrixAutoUpdate = false;
  }
  return { merged, created };
}
