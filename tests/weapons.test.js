import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Weapon } from '../src/combat/Weapon.js';
import { DEFAULT_WEAPON, EVALUATION_WEAPON, WEAPONS, WEAPON_ORDER, shotDamage, sustainedRps, weaponRatings } from '../src/combat/weapons.js';
import { DEFAULT_SETTINGS } from '../src/config/defaults.js';
import { normalizeCrosshair } from '../src/ui/Crosshair.js';
import { Phase } from '../src/modes/evaluation/Phase.js';

// Juego falso: la cámara mira a -Z; `castResult(dir)` decide qué toca cada perdigón.
function fakeGame({ castResult = () => null, moving = 0 } = {}) {
  const camera = new THREE.PerspectiveCamera();
  camera.updateMatrixWorld();
  const calls = { shots: [], tracers: 0, sounds: [], kicks: [] };
  const game = {
    settings: structuredClone(DEFAULT_SETTINGS),
    engine: { camera },
    player: { inaccuracy: moving },
    input: { mouseDown: false },
    mode: { hitMeshes: () => [] },
    ballistics: { cast: (origin, dir) => castResult(dir.clone()) },
    effects: { tracer: () => calls.tracers++, burst() {}, decal() {} },
    sfx: { shot: (s) => calls.sounds.push(s), dryFire() {}, reloadStart() {}, reloadEnd() {}, draw() {} },
    viewmodel: { setWeapon() {}, startDraw() {}, startReload() {}, cancelReload() {}, kick: (k) => calls.kicks.push(k) },
    hud: { flash() {} },
  };
  const weapon = new Weapon(game);
  weapon.enabled = true;
  weapon.onShot = (hit, spread) => calls.shots.push({ hit, spread });
  game.weapon = weapon;
  return { game, weapon, calls };
}

const fireReady = (w) => {
  w.drawLeft = 0;
  w.cooldown = 0;
};

describe('arsenal', () => {
  it('nueve armas con teclas 1-9 únicas y datos completos (las cinco de siempre conservan su número)', () => {
    expect(WEAPON_ORDER).toHaveLength(9);
    expect(WEAPON_ORDER.map((id) => WEAPONS[id].key)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9']);
    expect(WEAPON_ORDER.slice(0, 5)).toEqual(['pistol', 'smg', 'rifle', 'shotgun', 'sniper']);
    for (const id of WEAPON_ORDER) {
      const w = WEAPONS[id];
      expect(w.id).toBe(id);
      expect(w.magazine).toBeGreaterThan(0);
      expect(w.fireModes.length).toBeGreaterThan(0);
      expect(normalizeCrosshair(w.crosshair)).toEqual(w.crosshair); // su mira es válida
    }
  });

  it('el rifle conserva los valores con los que se calibró la evaluación', () => {
    expect(EVALUATION_WEAPON).toBe('rifle');
    expect(DEFAULT_WEAPON).toBe('rifle');
    expect(WEAPONS.rifle).toMatchObject({ rps: 9.75, magazine: 25, reloadTime: 2.2, damage: { head: 150, body: 40, legs: 34 } });
  });

  it('cada arma tiene su mira por defecto en la configuración', () => {
    for (const id of WEAPON_ORDER) expect(DEFAULT_SETTINGS.weaponCrosshairs[id]).toEqual(WEAPONS[id].crosshair);
    expect(DEFAULT_SETTINGS.weaponCrosshairs.shotgun.shape).toBe('circle');
  });

  it('las valoraciones van de 0 a 1 y reflejan los arquetipos', () => {
    const r = Object.fromEntries(WEAPON_ORDER.map((id) => [id, weaponRatings(WEAPONS[id])]));
    for (const v of Object.values(r)) for (const x of Object.values(v)) expect(x >= 0 && x <= 1).toBe(true);
    expect(r.smg.rate).toBe(1);
    expect(r.sniper.damage).toBeLessThan(r.shotgun.damage); // escopeta: 9 perdigones de cerca
    expect(r.smg.mobility).toBe(1);
    expect(shotDamage(WEAPONS.shotgun, 'body')).toBe(18 * 9);
  });
});

describe('Weapon', () => {
  it('cada arma conserva su munición al cambiar', () => {
    const { weapon } = fakeGame();
    weapon.setWeapon('rifle', { force: true });
    weapon.setMode(false);
    fireReady(weapon);
    weapon.trigger();
    expect(weapon.ammo).toBe(24);
    weapon.setWeapon('pistol');
    expect(weapon.ammo).toBe(12);
    weapon.setWeapon('rifle');
    expect(weapon.ammo).toBe(24);
    weapon.refill();
    expect(weapon.ammo).toBe(25);
  });

  it('no dispara mientras saca el arma ni mientras recarga', () => {
    const { weapon, calls } = fakeGame();
    weapon.setWeapon('sniper', { force: true });
    weapon.trigger();
    expect(calls.shots).toHaveLength(0);
    weapon.update(WEAPONS.sniper.drawTime + 0.01);
    weapon.trigger();
    expect(calls.shots).toHaveLength(1);
    weapon.reload();
    weapon.cooldown = 0;
    weapon.trigger();
    expect(calls.shots).toHaveLength(1);
  });

  it('el modo de disparo respeta lo que permite cada arma', () => {
    const { weapon } = fakeGame();
    weapon.setWeapon('smg', { force: true });
    expect(weapon.auto).toBe(true);
    expect(weapon.toggleMode()).toBe(false);
    weapon.setWeapon('shotgun');
    expect(weapon.canToggleMode).toBe(false);
    expect(weapon.setMode(true)).toBe(false); // la escopeta no tiene automático
    expect(weapon.toggleMode()).toBeNull();
  });

  it('escopeta: los perdigones al mismo bot se agrupan y multiplican el daño', () => {
    const bot = { alive: true };
    let n = 0;
    const { weapon, calls } = fakeGame({
      castResult: () => (n++ % 3 === 2 ? null : { bot, part: n === 1 ? 'head' : 'body', point: new THREE.Vector3(), normal: new THREE.Vector3(0, 1, 0) }),
    });
    weapon.setWeapon('shotgun', { force: true });
    fireReady(weapon);
    weapon.trigger();
    expect(calls.shots).toHaveLength(1); // un disparo = un aviso, aunque sean 9 perdigones
    const { hit } = calls.shots[0];
    expect(hit.bot).toBe(bot);
    expect(hit.pelletHits).toBe(6); // 9 perdigones, 1 de cada 3 falla
    expect(hit.part).toBe('head'); // se queda con la mejor zona alcanzada
    expect(calls.tracers).toBeLessThanOrEqual(5);
  });

  it('francotirador: muy impreciso sin apuntar, preciso con la mira', () => {
    const { weapon } = fakeGame();
    weapon.setWeapon('sniper', { force: true });
    expect(weapon.currentSpread()).toBe(WEAPONS.sniper.hipSpread);
    weapon.scoped = true;
    expect(weapon.currentSpread()).toBe(0);
  });

  it('dispersión: la pistola acumula en semiautomático; el rifle semi no (como siempre)', () => {
    const pistol = fakeGame().weapon;
    pistol.setWeapon('pistol', { force: true });
    fireReady(pistol);
    pistol.trigger();
    expect(pistol.bloom).toBeCloseTo(WEAPONS.pistol.bloomPerShot);
    const rifle = fakeGame().weapon;
    rifle.setWeapon('rifle', { force: true });
    rifle.setMode(false);
    fireReady(rifle);
    rifle.trigger();
    expect(rifle.bloom).toBe(0);
  });

  it('las automáticas arrancan en automático: mantener el clic dispara sin un clic por bala', () => {
    for (const id of ['smg', 'rifle', 'lmg']) {
      const { weapon, game, calls } = fakeGame();
      weapon.setWeapon(id, { force: true });
      expect(weapon.auto, id).toBe(true);
      weapon.drawLeft = 0;
      game.input.mouseDown = true;
      for (let i = 0; i < 60; i++) weapon.update(1 / 60); // 1 s con el clic mantenido
      expect(calls.shots.length, id).toBeGreaterThan(WEAPONS[id].rps * 0.8);
    }
    // Las de precisión siguen siendo de un clic por disparo.
    for (const id of ['pistol', 'magnum', 'shotgun', 'sniper', 'dmr']) {
      const { weapon } = fakeGame();
      weapon.setWeapon(id, { force: true });
      expect(weapon.auto, id).toBe(false);
    }
  });

  it('rifle de ráfaga: tres balas por clic y una pausa antes de la siguiente ráfaga', () => {
    const { weapon, calls } = fakeGame();
    weapon.setWeapon('burst', { force: true });
    expect(weapon.mode).toBe('burst');
    fireReady(weapon);
    weapon.trigger();
    for (let i = 0; i < 20; i++) weapon.update(1 / 120);
    expect(calls.shots).toHaveLength(3);
    weapon.trigger(); // durante la pausa no empieza otra
    expect(calls.shots).toHaveLength(3);
    weapon.update(WEAPONS.burst.burstDelay + 0.05);
    weapon.trigger();
    for (let i = 0; i < 20; i++) weapon.update(1 / 120);
    expect(calls.shots).toHaveLength(6);
    expect(weapon.ammo).toBe(WEAPONS.burst.magazine - 6);
  });

  it('munición infinita (entrenamiento): no gasta balas ni deja recargar', () => {
    const { weapon, calls } = fakeGame();
    weapon.setWeapon('pistol', { force: true });
    weapon.infinite = true;
    for (let i = 0; i < 40; i++) {
      fireReady(weapon);
      weapon.trigger();
    }
    expect(calls.shots).toHaveLength(40); // más que un cargador de 12
    expect(weapon.ammo).toBe(WEAPONS.pistol.magazine);
    weapon.reload();
    expect(weapon.reloading).toBe(false);
  });

  it('la cadencia sostenida de la ráfaga cuenta la pausa entre ráfagas', () => {
    expect(sustainedRps(WEAPONS.rifle)).toBe(WEAPONS.rifle.rps);
    expect(sustainedRps(WEAPONS.burst)).toBeLessThan(WEAPONS.burst.rps / 2);
  });

  it('moverse afecta a cada arma según su movilidad', () => {
    const smg = fakeGame({ moving: 4 }).weapon;
    smg.setWeapon('smg', { force: true });
    const rifle = fakeGame({ moving: 4 }).weapon;
    rifle.setWeapon('rifle', { force: true });
    expect(smg.currentSpread()).toBeLessThan(rifle.currentSpread());
  });
});

describe('daño en Phase', () => {
  it('usa el arma actual y multiplica por los perdigones', () => {
    const { game, weapon } = fakeGame();
    weapon.setWeapon('shotgun', { force: true });
    Object.assign(game, { hud: { flash() {}, hitmarker() {} }, sfx: { ...game.sfx, hit() {}, headshot() {}, kill() {} }, player: { ...game.player, position: new THREE.Vector3(), eye: new THREE.Vector3() } });
    const phase = new Phase({ game, root: new THREE.Group() });
    let taken = 0;
    const bot = { alive: true, damage: (d) => ((taken = d), { killed: false }) };
    phase.handleShot({ bot, part: 'body', pelletHits: 5 });
    expect(taken).toBe(18 * 5);
    weapon.setWeapon('rifle');
    phase.handleShot({ bot, part: 'head' });
    expect(taken).toBe(150);
  });
});
