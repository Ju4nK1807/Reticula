// Pruebas de Phase (base de las fases de todos los modos) con un juego falso mínimo.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Phase } from '../src/modes/evaluation/Phase.js';
import { SphereFlickPhase } from '../src/modes/evaluation/targetPhases.js';

function fakeMode() {
  const game = {
    player: { position: new THREE.Vector3(), eye: new THREE.Vector3(0, 1.62, 0), horizontalSpeed: 0, crouch: 0 },
    ballistics: { lineOfSight: () => true, cast: () => null },
    engine: { camera: new THREE.PerspectiveCamera() },
    world: {},
    hud: { flash() {}, hitmarker() {} },
    sfx: { hit() {}, headshot() {}, kill() {} },
    settings: { enemyColor: '#ff3b4f' },
  };
  return { game, root: new THREE.Group() };
}

const fakeBot = (extra = {}) => ({
  alive: true,
  removable: false,
  escaped: false,
  opts: { behavior: {} },
  hitMeshes: [{}],
  updates: 0,
  update() {
    this.updates++;
  },
  dispose() {
    this.disposed = true;
  },
  ...extra,
});

describe('Phase.update', () => {
  it('retira y libera los bots terminados, conserva el resto', () => {
    const phase = new Phase(fakeMode());
    const keep = fakeBot();
    const gone = fakeBot({ removable: true });
    phase.bots.push(keep, gone);
    phase.update(0.016);
    expect(phase.bots).toEqual([keep]);
    expect(gone.disposed).toBe(true);
    expect(keep.updates).toBe(1);
  });

  it('no pierde los bots creados al retirar otro (regresión)', () => {
    // Antes, los avisos se llamaban dentro de un filter(): el bot nuevo iba al arreglo viejo y se perdía.
    class Respawn extends Phase {
      onRemoved() {
        this.bots.push(fakeBot({ id: 'nuevo' }));
      }
    }
    const phase = new Respawn(fakeMode());
    phase.bots.push(fakeBot({ removable: true, escaped: true }));
    phase.update(0.016);
    expect(phase.bots.map((b) => b.id)).toEqual(['nuevo']);
  });

  it('los bots pueden disparar al jugador desde su update (regresión)', () => {
    // Los bots llaman a ctx.onBotFire como función suelta: tiene que estar enlazada a la fase.
    const mode = fakeMode();
    let tracer = 0;
    Object.assign(mode.game, {
      effects: { tracer: () => tracer++ },
      sfx: { ...mode.game.sfx, botShot() {}, hurt() {} },
      panFor: () => 0,
      angleTo: () => 0,
      hud: { ...mode.game.hud, damage() {}, setHealth() {} },
    });
    const phase = new Phase(mode);
    const shooter = fakeBot({
      gunTip: new THREE.Object3D(),
      update(dt, ctx) {
        ctx.onBotFire(this, true, 10);
      },
    });
    phase.bots.push(shooter);
    expect(() => phase.update(0.016)).not.toThrow();
    expect(tracer).toBe(1);
  });

  it('hitMeshes solo incluye bots vivos y reutiliza el arreglo', () => {
    const phase = new Phase(fakeMode());
    phase.bots.push(fakeBot(), fakeBot({ alive: false }));
    const a = phase.hitMeshes();
    expect(a).toHaveLength(1);
    expect(phase.hitMeshes()).toBe(a);
  });
});

describe('Flicking (dianas)', () => {
  it('tras escapar una diana aparece la siguiente y sigue activa', () => {
    const phase = new SphereFlickPhase(fakeMode());
    phase.begin();
    const first = phase.current;
    first.leave();
    for (let i = 0; i < 20; i++) phase.update(1 / 60);
    expect(phase.current).not.toBe(first);
    expect(phase.bots).toContain(phase.current);
    expect(phase.current.alive).toBe(true);
    expect(phase.current.mesh.scale.x).toBeGreaterThan(0.1); // creció: se está actualizando
  });
});
