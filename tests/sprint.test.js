import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { PlayerController } from '../src/core/PlayerController.js';
import { DEFAULT_KEYS } from '../src/config/keybinds.js';

// Jugador en un campo abierto; `held` = acciones pulsadas.
function setup() {
  const camera = new THREE.PerspectiveCamera();
  camera.rotation.order = 'YXZ';
  const held = new Set();
  const input = {
    keys: new Set(),
    mouseDown: false,
    axis: { x: 0, y: 0 },
    isAction: (id) => held.has(id),
    isDown: (code) => [...held].some((id) => DEFAULT_KEYS[id] === code),
    consumeMouse: () => ({ dx: 0, dy: 0 }),
  };
  const world = { colliders: [], playerBlockers: [], playerZone: { minX: -500, maxX: 500, minZ: -500, maxZ: 500 } };
  const player = new PlayerController(camera, input);
  player.setWorld(world);
  player.reset(new THREE.Vector3());
  const run = (s) => {
    for (let i = 0; i < s * 60; i++) player.update(1 / 60, true);
  };
  return { player, input, held, run };
}

describe('sprint', () => {
  it('mantener Shift (correr) avanzando va más rápido que correr normal; caminar, más lento', () => {
    const a = setup();
    a.held.add('forward');
    a.run(1);
    const normal = a.player.horizontalSpeed;
    a.held.add('sprint');
    a.run(1);
    expect(a.player.sprinting).toBe(true);
    expect(a.player.horizontalSpeed).toBeGreaterThan(normal * 1.3);
    a.held.delete('sprint');
    a.held.add('walk');
    a.run(1);
    expect(a.player.horizontalSpeed).toBeLessThan(normal * 0.6);
  });

  it('no se corre hacia atrás, agachado, apuntando ni disparando', () => {
    const b = setup();
    b.held.add('back').add('sprint');
    b.run(0.5);
    expect(b.player.sprinting).toBe(false);
    b.held.delete('back');
    b.held.add('forward');
    b.run(0.3);
    expect(b.player.sprinting).toBe(true);
    b.input.mouseDown = true; // disparar corta el sprint
    b.run(0.1);
    expect(b.player.sprinting).toBe(false);
    b.input.mouseDown = false;
    b.player.speedScale = 0.75; // apuntando
    b.run(0.1);
    expect(b.player.sprinting).toBe(false);
    b.player.speedScale = 1;
    b.held.add('crouch');
    b.run(0.1);
    expect(b.player.sprinting).toBe(false);
  });

  it('correr disparando desvía mucho más que correr normal', () => {
    const c = setup();
    c.held.add('forward');
    c.run(1);
    const normal = c.player.inaccuracy;
    c.held.add('sprint');
    c.run(1);
    expect(c.player.inaccuracy).toBeGreaterThan(normal);
  });
});
