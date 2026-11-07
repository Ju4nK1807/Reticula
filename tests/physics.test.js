import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { RigidBody, boxInertia, boxPoints, cylinderInertia, cylinderPoints, separate, stepBody } from '../src/physics/RigidBody.js';

const DT = 1 / 60;
const box = (w = 0.6, h = 0.6, d = 0.6, mass = 10) =>
  new RigidBody({ mass, inertia: boxInertia(mass, w, h, d), points: boxPoints(w, h, d), radius: Math.hypot(w, h, d) / 2, restitution: 0.3, friction: 0.6 });
const cylinder = (r = 0.3, h = 0.9, mass = 20) =>
  new RigidBody({ mass, inertia: cylinderInertia(mass, r, h), points: cylinderPoints(r, h), radius: Math.hypot(r, h / 2), restitution: 0.25, friction: 0.7 });
const run = (body, seconds, colliders = []) => {
  let maxY = -Infinity;
  for (let t = 0; t < seconds; t += DT) {
    stepBody(body, DT, colliders);
    maxY = Math.max(maxY, body.position.y);
  }
  return maxY;
};
// Eje local del cuerpo que quedó más vertical (|dot| con el mundo).
const upAlignment = (body) => Math.max(...[new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)].map((a) => Math.abs(a.applyQuaternion(body.quaternion).y)));

describe('física de la utilería', () => {
  it('una caja que cae queda apoyada en el suelo, quieta y dormida', () => {
    const b = box();
    b.position.set(0, 1.5, 0);
    b.wake();
    run(b, 4);
    expect(b.position.y).toBeCloseTo(0.3, 1);
    expect(b.awake).toBe(false);
    expect(b.velocity.length()).toBe(0);
  });

  it('cae inclinada y termina apoyada sobre una cara', () => {
    const b = box(0.6, 0.4, 0.5);
    b.position.set(0, 1.2, 0);
    b.quaternion.setFromEuler(new THREE.Euler(0.5, 0.3, 0.7));
    b.wake();
    run(b, 6);
    expect(upAlignment(b)).toBeGreaterThan(0.98);
    // Su altura es la mitad de alguno de sus lados (apoyada de plano).
    const halves = [0.3, 0.2, 0.25];
    expect(Math.min(...halves.map((hh) => Math.abs(b.position.y - hh)))).toBeLessThan(0.02);
  });

  it('nunca rebota más alto de donde cayó (no gana energía)', () => {
    const b = box();
    b.position.set(0, 2, 0);
    b.wake();
    let maxAfter = 0;
    let hit = false;
    for (let t = 0; t < 5; t += DT) {
      stepBody(b, DT);
      if (b.contacts) hit = true;
      if (hit) maxAfter = Math.max(maxAfter, b.position.y);
    }
    expect(maxAfter).toBeLessThan(2);
  });

  it('se apoya sobre una caja fija y no atraviesa una pared', () => {
    const table = new THREE.Box3(new THREE.Vector3(-1, 0, -1), new THREE.Vector3(1, 0.9, 1));
    const b = box(0.3, 0.3, 0.3, 4);
    b.position.set(0, 1.6, 0);
    b.wake();
    run(b, 3, [table]);
    expect(b.position.y).toBeCloseTo(0.9 + 0.15, 1);

    const wall = new THREE.Box3(new THREE.Vector3(2, 0, -3), new THREE.Vector3(2.3, 3, 3));
    const c = box(0.4, 0.4, 0.4, 5);
    c.position.set(0.5, 0.2, 0);
    c.velocity.set(8, 0, 0);
    c.wake();
    let maxX = -Infinity;
    for (let t = 0; t < 2; t += DT) {
      stepBody(c, DT, [wall]);
      maxX = Math.max(maxX, c.position.x);
    }
    expect(maxX + 0.2).toBeLessThan(2 + 0.05);
  });

  it('un impulso descentrado lo hace girar; uno en el centro, no', () => {
    const a = box();
    a.position.set(0, 3, 0);
    a.applyImpulse(new THREE.Vector3(5, 0, 0), new THREE.Vector3(0, 3, 0));
    expect(a.angular.length()).toBeCloseTo(0, 6);
    const b = box();
    b.position.set(0, 3, 0);
    b.applyImpulse(new THREE.Vector3(5, 0, 0), new THREE.Vector3(0, 3.25, 0));
    expect(b.angular.length()).toBeGreaterThan(0.5);
    expect(b.velocity.x).toBeCloseTo(0.5, 5);
  });

  it('un barril tumbado rueda al empujarlo y termina frenando', () => {
    const b = cylinder();
    // Tumbado: el eje del cilindro (y local) en horizontal, a lo largo de z.
    b.quaternion.setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));
    b.position.set(0, 0.3, 0);
    b.velocity.set(2.5, 0, 0);
    b.wake();
    let maxSpin = 0;
    for (let t = 0; t < 1; t += DT) {
      stepBody(b, DT);
      maxSpin = Math.max(maxSpin, Math.abs(b.angular.z));
    }
    expect(maxSpin).toBeGreaterThan(3); // rueda (no solo se desliza)
    expect(b.position.x).toBeGreaterThan(0.5);
    run(b, 12);
    expect(b.velocity.length()).toBeLessThan(0.1);
  });

  it('dos cuerpos que se tocan se separan', () => {
    const a = box(0.4, 0.4, 0.4, 5);
    const b = box(0.4, 0.4, 0.4, 5);
    a.position.set(0, 0.2, 0);
    b.position.set(0.1, 0.2, 0);
    expect(separate(a, b)).toBe(true);
    expect(b.position.x - a.position.x).toBeGreaterThan(0.1);
    expect(a.awake && b.awake).toBe(true);
  });
});
