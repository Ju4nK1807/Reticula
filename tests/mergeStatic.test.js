import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { mergeStatic } from '../src/gfx/mergeStatic.js';

function box(scene, mat, x, z, opts = {}) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), mat);
  m.position.set(x, 1, z);
  Object.assign(m.userData, opts.userData ?? {});
  scene.add(m);
  return m;
}

function world() {
  const scene = new THREE.Scene();
  const concrete = new THREE.MeshStandardMaterial();
  const lamp = new THREE.MeshBasicMaterial();
  const solids = [box(scene, concrete, 2, 2), box(scene, concrete, 6, 4), box(scene, concrete, 9, 7)]; // misma zona de 30 m
  const far = box(scene, concrete, 100, 100); // otra zona
  const unique = box(scene, lamp, 4, 1); // material propio: no se une
  const dynamic = box(scene, concrete, 5, 8, { userData: { dynamic: true } });
  scene.add(new THREE.HemisphereLight());
  return { scene, solids: [...solids, far, unique], concrete, unique, dynamic };
}

describe('geometría estática unida', () => {
  it('une las mallas que comparten material por zona y deja intactas las únicas y las dinámicas', () => {
    const w = world();
    const r = mergeStatic(w);
    expect(r.merged).toBe(3);
    expect(r.created).toBe(1);
    const meshes = w.scene.children.filter((o) => o.isMesh);
    const merged = meshes.filter((m) => m.userData.merged);
    expect(merged).toHaveLength(1);
    expect(merged[0].material).toBe(w.concrete);
    expect(merged[0].userData.merged).toBe(3);
    // La de otra zona (sola en su zona), la de material propio y la dinámica siguen en la escena.
    expect(meshes).toContain(w.unique);
    expect(meshes).toContain(w.dynamic);
    expect(meshes.some((m) => m.position.x === 100)).toBe(true);
  });

  it('la malla unida ocupa exactamente lo mismo que las originales', () => {
    const w = world();
    const before = new THREE.Box3();
    for (const m of w.solids.slice(0, 3)) before.expandByObject(m);
    mergeStatic(w);
    const merged = w.scene.children.find((o) => o.userData.merged);
    merged.geometry.computeBoundingBox();
    expect(merged.geometry.boundingBox.min.toArray()).toEqual(before.min.toArray());
    expect(merged.geometry.boundingBox.max.toArray()).toEqual(before.max.toArray());
  });

  it('las originales salen de la escena pero las balas siguen chocando con ellas', () => {
    const w = world();
    mergeStatic(w);
    const original = w.solids[1];
    expect(original.parent).toBeNull();
    const rc = new THREE.Raycaster(new THREE.Vector3(6, 1, 20), new THREE.Vector3(0, 0, -1));
    const hit = rc.intersectObjects(w.solids, false)[0];
    expect(hit?.object).toBe(original);
    expect(hit.point.z).toBeCloseTo(4.5);
  });

  it('la geometría estática que queda no recalcula su matriz cada cuadro', () => {
    const w = world();
    mergeStatic(w);
    expect(w.unique.matrixAutoUpdate).toBe(false);
    expect(w.dynamic.matrixAutoUpdate).toBe(true);
  });
});
