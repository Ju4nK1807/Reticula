import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { aimBone, loadSoldier } from '../src/bots/botSkin.js';

// Cadena de dos huesos: muslo (hip) → rodilla (knee), con el muslo colgando hacia abajo.
function chain() {
  const root = new THREE.Group();
  const hip = new THREE.Bone();
  hip.position.set(0, 1, 0);
  const knee = new THREE.Bone();
  knee.position.set(0, -0.45, 0);
  hip.add(knee);
  root.add(hip);
  root.updateMatrixWorld(true);
  return { root, hip, knee };
}

describe('apariencia del soldado (IK y carga)', () => {
  it('aimBone gira el hueso para que su hijo apunte al objetivo, sin cambiar el largo', () => {
    const { hip, knee } = chain();
    const from = knee.getWorldPosition(new THREE.Vector3());
    const target = new THREE.Vector3(0, 1, 1); // al frente, a la altura de la cadera
    aimBone(hip, from, target);
    const k = knee.getWorldPosition(new THREE.Vector3());
    const dir = k.clone().sub(new THREE.Vector3(0, 1, 0)).normalize();
    expect(dir.z).toBeCloseTo(1, 5);
    expect(dir.y).toBeCloseTo(0, 5);
    expect(k.distanceTo(new THREE.Vector3(0, 1, 0))).toBeCloseTo(0.45, 5);
  });

  it('aimBone funciona con el padre girado (la rotación local lo compensa)', () => {
    const { root, hip, knee } = chain();
    root.rotation.y = Math.PI / 2;
    root.updateMatrixWorld(true);
    aimBone(hip, knee.getWorldPosition(new THREE.Vector3()), new THREE.Vector3(1, 1, 0));
    const k = knee.getWorldPosition(new THREE.Vector3());
    expect(k.x).toBeCloseTo(0.45, 4);
    expect(k.y).toBeCloseTo(1, 4);
  });

  it('sin navegador el soldado no se carga y el bot conserva su modelo de cajas', async () => {
    expect(await loadSoldier('#ff3b4f')).toBeNull();
  });
});
