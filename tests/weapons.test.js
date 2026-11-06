import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Weapon } from '../src/combat/Weapon.js';
import { DEFAULT_WEAPON, EVALUATION_WEAPON, WEAPONS, WEAPON_ORDER, shotDamage, weaponRatings } from '../src/combat/weapons.js';
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
  it('cinco armas con teclas 1-5 únicas y datos completos', () => {
    expect(WEAPON_ORDER).toHaveLength(5);
    expect(WEAPON_ORDER.map((id) => WEAPONS[id].key)).toEqual(['1', '2', '3', '4', '5']);
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
