// Trazadoras (balas visibles): deben recorrer su camino y desaparecer siempre.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Effects } from '../src/effects/Effects.js';

const v = (x, y, z) => new THREE.Vector3(x, y, z);
const active = (fx) => fx.tracers.filter((t) => t.active).length;
const run = (fx, seconds, dt = 1 / 60) => {
  for (let i = 0; i < Math.ceil(seconds / dt); i++) fx.update(dt);
};

describe('trazadoras', () => {
  it.each([1, 2.4, 3, 10, 60, 200])('una bala de %f m desaparece al llegar (no se queda en el aire)', (dist) => {
    const fx = new Effects();
    fx.tracer(v(0, 1.6, 0), v(0, 1.6, -dist));
    expect(active(fx)).toBe(1);
    // A 280 m/s tarda dist/280 s en llegar y la cola 2.4 m más: con 1 s sobra en todos los casos.
    run(fx, 1 + dist / 280);
    expect(active(fx)).toBe(0);
    expect(fx.tracers.every((t) => !t.mesh.visible)).toBe(true);
  });

  it('con ráfagas largas no queda ninguna bala flotando', () => {
    const fx = new Effects();
    for (let i = 0; i < 300; i++) {
      fx.tracer(v(0, 1.6, 0), v(Math.sin(i) * 5, 1, -8 - (i % 20)), i % 3 ? 'player' : 'enemy');
      fx.update(1 / 60);
    }
    run(fx, 1.5);
    expect(active(fx)).toBe(0);
  });

  it('un disparo demasiado corto no ocupa ni congela una trazadora en vuelo', () => {
    const fx = new Effects();
    for (let i = 0; i < fx.tracers.length; i++) fx.tracer(v(0, 0, 0), v(0, 0, -50));
    fx.update(0.01);
    fx.tracer(v(0, 0, 0), v(0, 0, -0.2)); // < 0.5 m
    run(fx, 1);
    expect(active(fx)).toBe(0);
  });

  it('con todas en vuelo se recicla la que más ha recorrido', () => {
    const fx = new Effects();
    fx.tracer(v(0, 0, 0), v(0, 0, -100));
    fx.update(0.1);
    const oldest = fx.tracers[0];
    for (let i = 1; i < fx.tracers.length; i++) fx.tracer(v(0, 0, 0), v(0, 0, -100));
    fx.tracer(v(0, 0, 0), v(5, 0, -100));
    expect(oldest.t).toBe(0); // la más antigua se reutilizó para la nueva
  });
});
