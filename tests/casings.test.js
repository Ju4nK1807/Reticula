import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CASINGS, Casings, stepCasing } from '../src/effects/Casings.js';

const casing = (y = 1.4) => ({ pos: new THREE.Vector3(0, y, 0), vel: new THREE.Vector3(2, 1.5, 0), angle: 0, spin: 20, radius: 0.005, resting: false });

describe('casquillos', () => {
  it('caen, rebotan cada vez más bajo y quedan en el piso', () => {
    const c = casing();
    const impacts = [];
    for (let t = 0; t < 3; t += 1 / 120) {
      const k = stepCasing(c, 1 / 120);
      if (k) impacts.push(k);
    }
    expect(impacts.length).toBeGreaterThanOrEqual(2);
    expect(impacts[1]).toBeLessThan(impacts[0]);
    expect(c.resting).toBe(true);
    expect(c.pos.y).toBeCloseTo(0.005, 4);
  });

  it('se quedan sobre una mesa y no atraviesan sus costados', () => {
    const table = new THREE.Box3(new THREE.Vector3(-1, 0, -1), new THREE.Vector3(1, 0.9, 1));
    const c = casing(1.5);
    c.vel.set(0.3, 1, 0.2); // cae sobre la mesa (con 2 m/s pasaría de largo el borde)
    for (let t = 0; t < 2; t += 1 / 120) stepCasing(c, 1 / 120, [table]);
    expect(c.pos.y).toBeGreaterThanOrEqual(0.9);
    const side = { pos: new THREE.Vector3(-1.5, 0.4, 0), vel: new THREE.Vector3(6, 0, 0), angle: 0, spin: 0, radius: 0.005, resting: false };
    let maxX = -Infinity;
    for (let t = 0; t < 0.5; t += 1 / 120) {
      stepCasing(side, 1 / 120, [table]);
      maxX = Math.max(maxX, side.pos.x);
    }
    expect(maxX).toBeLessThan(-0.99);
  });

  it('cada arma expulsa su vaina; la escopeta y el francotirador, con retraso', () => {
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 1.6, 0);
    camera.updateMatrixWorld();
    const sounds = [];
    const game = { engine: { camera }, world: { colliders: [] }, player: { velocity: new THREE.Vector3() }, sfx: { casing: (pan, kind) => sounds.push(kind) }, panFor: () => 0 };
    const cs = new Casings(game);
    cs.eject('rifle');
    expect(cs.pool.brass.filter((c) => c.active)).toHaveLength(1);
    cs.eject('shotgun');
    expect(cs.pool.shell.filter((c) => c.active)).toHaveLength(0); // todavía no: corredera
    for (let t = 0; t < CASINGS.shotgun.delay + 0.05; t += 1 / 60) cs.update(1 / 60);
    expect(cs.pool.shell.filter((c) => c.active)).toHaveLength(1);
    for (let t = 0; t < 2; t += 1 / 60) cs.update(1 / 60);
    expect(sounds).toContain('brass');
    // A la derecha de la cámara (mira hacia -z).
    expect(cs.pool.brass[0].pos.x).toBeGreaterThan(0.2);
    cs.clear();
    expect(cs.pool.brass.some((c) => c.active)).toBe(false);
  });
});
