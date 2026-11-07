import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ArmoryMenu } from '../src/scenes/ArmoryMenu.js';
import { MenuCamera, smoothDamp } from '../src/effects/MenuCamera.js';
import { Sparks } from '../src/effects/Sparks.js';
import { createWorld } from '../src/scenes/registry.js';

describe('armería del menú', () => {
  it('se construye sin navegador, con planos de cámara y soldados', () => {
    const w = createWorld('armory');
    expect(w).toBeInstanceOf(ArmoryMenu);
    expect(w.menuShots.main).toBeTruthy();
    for (const id of ['continue', 'play', 'arsenal', 'crosshair', 'progress', 'settings']) expect(w.menuShots[id], id).toBeTruthy();
    expect(w.showcase.hero.slung).toBe('rifle');
    expect(w.colliders.length).toBeGreaterThan(5);
  });

  it('se anima sin errores: drones, láser, pantallas y chispas', () => {
    const w = new ArmoryMenu();
    const start = w.drones[0].group.position.clone();
    for (let i = 0; i < 240; i++) w.update(1 / 60);
    expect(w.drones[0].group.position.distanceTo(start)).toBeGreaterThan(0.001);
    expect(w.drones[0].group.position.distanceTo(start)).toBeLessThan(0.2); // flota en su sitio
    expect(w.sparks.alive).toBeGreaterThanOrEqual(0);
    // El abanico del láser termina sobre la mesa.
    const p = w.fan.geometry.attributes.position;
    expect(p.getY(1)).toBeLessThan(1.0);
    expect(p.getY(0)).toBeGreaterThan(1.5);
  });

  it('en calidad baja apaga solo las luces de ambientación', () => {
    const w = new ArmoryMenu();
    w.setDetail('baja');
    expect(w.extraLights.every((l) => !l.visible)).toBe(true);
    w.setDetail('alta');
    expect(w.extraLights.every((l) => l.visible)).toBe(true);
  });
});

describe('cámara del menú', () => {
  it('el resorte llega al objetivo sin pasarse', () => {
    let x = 0;
    let v = 0;
    let max = 0;
    for (let i = 0; i < 300; i++) {
      [x, v] = smoothDamp(x, 10, v, 0.85, 1 / 60);
      max = Math.max(max, x);
    }
    expect(x).toBeCloseTo(10, 2);
    expect(max).toBeLessThanOrEqual(10 + 1e-9);
  });

  it('va al plano de la opción enfocada (o al principal si no hay)', () => {
    const shots = { main: { pos: new THREE.Vector3(0, 1, 5), look: new THREE.Vector3(0, 1, 0) }, play: { pos: new THREE.Vector3(2, 1, 5), look: new THREE.Vector3(2, 1, 0) } };
    const cam = new THREE.PerspectiveCamera();
    const rig = new MenuCamera();
    rig.setShots(shots);
    rig.update(1 / 60, 0, cam);
    expect(cam.position.x).toBeCloseTo(0, 1);
    rig.focus('play');
    for (let i = 0; i < 240; i++) rig.update(1 / 60, i / 60, cam);
    expect(cam.position.x).toBeCloseTo(2, 1);
    rig.focus('no-existe');
    expect(rig.shot).toBe('main');
  });
});

describe('chispas', () => {
  it('caen, rebotan en el suelo y se apagan', () => {
    const sp = new Sparks({ count: 16 });
    sp.burst(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 1, 0), 10, { life: [0.5, 0.5] });
    sp.update(1 / 60);
    expect(sp.alive).toBe(10);
    let minY = Infinity;
    for (let i = 0; i < 25; i++) {
      sp.update(1 / 60);
      for (let k = 0; k < 10; k++) minY = Math.min(minY, sp.pos[k * 3 + 1]);
    }
    expect(minY).toBeGreaterThanOrEqual(0); // nunca atraviesan el suelo
    for (let i = 0; i < 30; i++) sp.update(1 / 60);
    expect(sp.alive).toBe(0);
  });
});
