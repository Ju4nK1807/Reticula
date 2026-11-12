// Linterna del modo zombi: prender y apagar, batería que se gasta prendida y se recarga apagada.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { BATTERY, Flashlight } from '../src/modes/zombies/flashlight.js';
import { HEIGHT_FOG } from '../src/modes/zombies/atmosphere.js';

const camera = new THREE.PerspectiveCamera();
camera.updateMatrixWorld();
const run = (fl, s) => {
  for (let t = 0; t < s; t += 0.1) fl.update(0.1, camera, 'media');
};

describe('linterna', () => {
  it('prende y apaga; prendida ilumina y aclara la niebla en su cono, apagada no', () => {
    const fl = new Flashlight(new THREE.Scene());
    run(fl, 1);
    expect(fl.light.intensity).toBeGreaterThan(0);
    expect(HEIGHT_FOG.uBeamClear.value).toBeGreaterThan(0.5);
    expect(fl.toggle()).toBe(true);
    expect(fl.on).toBe(false);
    run(fl, 1);
    expect(fl.light.intensity).toBe(0);
    expect(HEIGHT_FOG.uBeamClear.value).toBe(0);
    fl.dispose();
  });

  it('la batería se gasta prendida, se apaga sola al vaciarse y se recarga apagada', () => {
    const fl = new Flashlight(new THREE.Scene());
    let empties = 0;
    fl.onEmpty = () => empties++;
    run(fl, BATTERY.drainTime / 2);
    expect(fl.battery).toBeCloseTo(0.5, 1);
    run(fl, BATTERY.drainTime / 2 + 0.2); // se vacía justo (y apenas empieza a recargar)
    expect(fl.battery).toBeLessThan(0.01);
    expect(fl.on).toBe(false);
    expect(empties).toBe(1);
    expect(fl.toggle()).toBe(false); // sin carga no prende
    run(fl, BATTERY.rechargeTime / 2);
    expect(fl.battery).toBeCloseTo(0.5, 1);
    expect(fl.toggle()).toBe(true);
    fl.dispose();
  });

  it('con poca batería la luz es más débil', () => {
    const fl = new Flashlight(new THREE.Scene());
    const avg = () => {
      let sum = 0;
      for (let i = 0; i < 200; i++) {
        fl.update(0.001, camera, 'media');
        sum += fl.light.intensity;
      }
      return sum / 200;
    };
    run(fl, 1);
    fl.battery = 1;
    const full = avg();
    fl.battery = BATTERY.low * 0.25;
    expect(avg()).toBeLessThan(full * 0.7);
    fl.dispose();
  });
});
