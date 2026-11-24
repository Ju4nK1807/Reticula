import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ZombieMap } from '../src/modes/zombies/ZombieMap.js';
import { HOSPITAL } from '../src/modes/zombies/sections.js';
import { pushCircleOut } from '../src/physics/obb.js';

const world = new ZombieMap();
const R = 0.32;

function blockedAt(x, z, boxes) {
  return boxes.some((b) => b.max.y > 0.05 && b.min.y < 1.7 && pushCircleOut(b, x, z, R));
}

describe('hospital', () => {
  it('toda pared alta que se ve tiene colisión', () => {
    const boxes = [...world.colliders, ...world.playerBlockers];
    const loose = [];
    world.scene.updateMatrixWorld(true);
    world.scene.traverse((o) => {
      if (!o.isMesh || o.isInstancedMesh || o.geometry.type !== 'BoxGeometry') return;
      const bb = new THREE.Box3().setFromObject(o);
      if (bb.max.x < HOSPITAL.minX || bb.min.x > HOSPITAL.maxX || bb.max.z < HOSPITAL.minZ || bb.min.z > HOSPITAL.maxZ) return;
      const sx = bb.max.x - bb.min.x;
      const sz = bb.max.z - bb.min.z;
      if (bb.min.y > 0.6 || bb.max.y < 1 || Math.max(sx, sz) < 0.5) return;
      for (let t = 0.1; t <= 0.9; t += 0.2) {
        const x = sx > sz ? bb.min.x + t * sx : (bb.min.x + bb.max.x) / 2;
        const z = sx > sz ? (bb.min.z + bb.max.z) / 2 : bb.min.z + t * sz;
        if (!blockedAt(x, z, boxes)) {
          loose.push(`(${x.toFixed(1)}, ${z.toFixed(1)}) y ${bb.min.y.toFixed(2)}-${bb.max.y.toFixed(2)}`);
          break;
        }
      }
    });
    expect(loose).toEqual([]);
  });

  it('las puertas de las salas quedan libres (el zócalo ya no las cruza)', () => {
    const boxes = [...world.colliders, ...world.playerBlockers];
    for (const x of [-48.5, -35.5, -21.5]) for (const z of [-54, -50]) expect(blockedAt(x, z, boxes), `${x}, ${z}`).toBe(false);
  });
});

describe('ventanas del circo', () => {
  const windows = world.barricades.filter((b) => b.blocker);

  it('las cuatro tienen su bloqueo del jugador', () => {
    expect(windows).toHaveLength(4);
  });

  it('con tablones no se pasa; sin ninguno, el hueco se cruza; al repararla se cierra otra vez', () => {
    world.resetBarricades();
    const b = windows[0];
    const at = b.mouth;
    expect(blockedAt(at.x, at.z, world.playerBlockers)).toBe(true);
    while (b.boards > 1) world.removeBoard(b);
    expect(blockedAt(at.x, at.z, world.playerBlockers)).toBe(true);
    world.removeBoard(b);
    expect(b.boards).toBe(0);
    expect(blockedAt(at.x, at.z, world.playerBlockers)).toBe(false);
    expect(blockedAt(at.x, at.z, world.colliders)).toBe(false);
    world.addBoard(b);
    expect(blockedAt(at.x, at.z, world.playerBlockers)).toBe(true);
    while (b.boards > 0) world.removeBoard(b);
    world.resetBarricades();
    expect(blockedAt(at.x, at.z, world.playerBlockers)).toBe(true);
  });
});
