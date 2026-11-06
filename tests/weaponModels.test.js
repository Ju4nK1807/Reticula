import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { WEAPON_MODELS, fitWeaponModel } from '../src/combat/weaponModels.js';
import { WEAPON_ORDER } from '../src/combat/weapons.js';

const DIR = path.resolve(__dirname, '../public/models/weapons');

// Arma de prueba: cuerpo de 30 cm y un cañón fino que sobresale 20 cm hacia -Z a 4 cm de altura.
function fakeGun() {
  const root = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.1, 0.3), new THREE.MeshStandardMaterial({ name: 'M_PCL_Flat_Black' }));
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.01, 0.2), new THREE.MeshStandardMaterial({ name: 'M_PCL_Flat_Brown.Chestnut' }));
  barrel.position.set(0, 0.04, -0.25);
  root.add(body, barrel);
  return root;
}

describe('modelos 3D de las armas', () => {
  it('hay un modelo para cada arma del arsenal, con su archivo y su crédito', () => {
    const credits = JSON.parse(fs.readFileSync(path.join(DIR, 'credits.json'), 'utf8'));
    for (const id of WEAPON_ORDER) {
      expect(WEAPON_MODELS[id], id).toBeTruthy();
      expect(fs.existsSync(path.join(DIR, WEAPON_MODELS[id].file)), id).toBe(true);
      expect(credits[id]?.license, id).toMatch(/^CC0|^CC-BY/);
    }
  });

  it('coloca el modelo: culata en `back`, lomo en `top` y centrado en x', () => {
    const cfg = { scale: 1, back: 0.3, top: 0.1, x: 0 };
    const root = fakeGun();
    fitWeaponModel(root, cfg);
    const box = new THREE.Box3().setFromObject(root);
    expect(box.max.z).toBeCloseTo(cfg.back, 5);
    expect(box.max.y).toBeCloseTo(cfg.top, 5);
    expect((box.min.x + box.max.x) / 2).toBeCloseTo(0, 5);
  });

  it('la boca del cañón queda en la punta y a la altura del cañón (no del cuerpo)', () => {
    const root = fakeGun();
    const muzzle = fitWeaponModel(root, { scale: 1, back: 0.3, top: 0.1 });
    const box = new THREE.Box3().setFromObject(root);
    expect(muzzle.z).toBeCloseTo(box.min.z - 0.01, 3);
    // Cañón a 4 cm sobre el centro del cuerpo (que mide 10 cm y tiene el lomo en 0.1): y ≈ 0.09.
    expect(muzzle.y).toBeCloseTo(0.09, 2);
    expect(Math.abs(muzzle.x)).toBeLessThan(0.01);
  });

  it('cambia la paleta plana por materiales PBR (metal y madera) y respeta la escala', () => {
    const root = fakeGun();
    fitWeaponModel(root, { scale: 2, back: 0.3, top: 0.1 });
    const [body, barrel] = root.children;
    expect(body.material.isMeshStandardMaterial).toBe(true);
    expect(body.material.metalness).toBeGreaterThan(0);
    expect(barrel.material.metalness).toBe(0); // madera
    const size = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());
    expect(size.z).toBeCloseTo((0.3 / 2 + 0.25 + 0.1) * 2, 3); // de la culata a la punta, ×2
  });
});
