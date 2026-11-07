import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Bar, BAR_RECT } from '../src/modes/zombies/Bar.js';
import { Zombie } from '../src/modes/zombies/Zombie.js';
import { DEFENSE, DIFFICULTIES, DIFFICULTY_ORDER, SHOP, cannotBuy, emptyRecord, pointsFor, updateRecord, waveConfig, zombieStats } from '../src/modes/zombies/zombieData.js';
import { insideBox, pushCircleOut, withObb } from '../src/physics/obb.js';
import { NavGrid } from '../src/modes/zombies/navGrid.js';

function fakeGame() {
  const sounds = [];
  return { sounds, world: { solids: [] }, effects: { burst() {} }, sfx: { glass: () => sounds.push('glass') }, panFor: () => 0 };
}

describe('dificultad del modo zombi', () => {
  it('cada nivel es más duro que el anterior (vida, velocidad, daño, cantidad y ritmo)', () => {
    const cfgs = DIFFICULTY_ORDER.map((d) => waveConfig(5, d));
    for (let i = 1; i < cfgs.length; i++) {
      const [a, b] = [cfgs[i - 1], cfgs[i]];
      expect(b.hpMul).toBeGreaterThan(a.hpMul);
      expect(b.speedMul).toBeGreaterThan(a.speedMul);
      expect(b.damageMul).toBeGreaterThan(a.damageMul);
      expect(b.count).toBeGreaterThan(a.count);
      expect(b.spawnGap[0]).toBeLessThan(a.spawnGap[0]);
    }
    expect(waveConfig(5, 'normal')).toMatchObject({ hpMul: waveConfig(5).hpMul, count: waveConfig(5).count });
  });

  it('locura trae corredores y brutos desde temprano; fácil, no', () => {
    expect(waveConfig(1, 'locura').runnerShare).toBeGreaterThan(0);
    expect(waveConfig(3, 'locura').brutes).toBe(1);
    expect(waveConfig(1, 'facil').runnerShare).toBe(0);
    expect(waveConfig(5, 'facil').brutes).toBe(0);
  });

  it('el daño de los zombis y los puntos siguen la dificultad', () => {
    const walker = (d) => zombieStats('walker', waveConfig(1, d)).damage;
    expect(walker('facil')).toBeLessThan(walker('normal'));
    expect(walker('locura')).toBe(walker('normal') * DIFFICULTIES.locura.damage);
    const kill = { part: 'head', killed: true, type: 'walker' };
    expect(pointsFor(kill, false, 1.6)).toBeGreaterThan(pointsFor(kill));
  });

  it('el récord se lleva por dificultad', () => {
    const r = emptyRecord();
    expect(updateRecord(r, { difficulty: 'locura', wave: 3, score: 900, kills: 20 })).toBe(true);
    expect(updateRecord(r, { difficulty: 'facil', wave: 9, score: 5000, kills: 90 })).toBe(true);
    expect(updateRecord(r, { difficulty: 'locura', wave: 2, score: 100, kills: 5 })).toBe(false);
    expect(r.byDifficulty.locura.bestWave).toBe(3);
    expect(r.byDifficulty.facil.bestWave).toBe(9);
    expect(r.bestWave).toBe(9);
    expect(r.totalRuns).toBe(3);
  });
});

describe('la barra (defensa)', () => {
  it('tiene botellas sólidas para las balas y se rompen por daño acumulado', () => {
    const g = fakeGame();
    const bar = new Bar(g, new THREE.Group());
    expect(bar.total).toBeGreaterThan(30);
    expect(g.world.solids.length).toBeLessThanOrEqual(6); // una malla instanciada por tipo de botella
    expect(bar.damage(DEFENSE.hpPerBottle - 1, new THREE.Vector3(0, 0, 3))).toBe(0);
    expect(bar.damage(1, new THREE.Vector3(0, 0, 3))).toBe(1);
    expect(bar.left).toBe(bar.total - 1);
    expect(g.sounds).toContain('glass');
    // Se rompe la más cercana al que golpea (del lado norte, z = 0).
    const broken = bar.bottles.find((b) => b.broken);
    expect(broken.pos.z).toBeGreaterThan(-1);
    // La instancia rota queda a escala cero (no se ve ni la tocan las balas).
    const m = new THREE.Matrix4();
    broken.mesh.getMatrixAt(broken.index, m);
    expect(new THREE.Vector3().setFromMatrixScale(m).length()).toBe(0);
    expect(bar.bottleOf(broken.mesh, broken.index)).toBe(broken);
  });

  it('reponer licor devuelve las botellas rotas; sin botellas, está destruida', () => {
    const bar = new Bar(fakeGame(), new THREE.Group());
    bar.damage(DEFENSE.hpPerBottle * bar.total, null);
    expect(bar.destroyed).toBe(true);
    expect(bar.restock(DEFENSE.restock)).toBe(DEFENSE.restock);
    expect(bar.left).toBe(DEFENSE.restock);
    const restock = SHOP.find((i) => i.id === 'restock');
    expect(cannotBuy(restock, { points: 9999, owned: new Set(), upgrades: new Set(), bottlesMissing: 0 })).toBe('Barra llena');
    expect(cannotBuy(restock, { points: 9999, owned: new Set(), upgrades: new Set(), bottlesMissing: 5 })).toBeNull();
  });

  it('distancia al borde y punto más cercano', () => {
    const bar = new Bar(fakeGame(), new THREE.Group());
    expect(bar.distance(0, 2.3)).toBeCloseTo(2, 5);
    expect(bar.distance(0, -3)).toBe(0);
    expect(bar.nearest(10, -3)).toEqual({ x: BAR_RECT.maxX, z: -3 });
  });
});

describe('zombis en la defensa', () => {
  const setup = (playerPos) => {
    const bar = new Bar(fakeGame(), new THREE.Group());
    const hits = { bar: 0, player: 0 };
    const run = { root: new THREE.Group(), nav: null, onZombieAttack: () => hits.player++, onZombieAttackBar: () => hits.bar++, onGroan() {}, onZombieDeath() {} };
    const zombies = [];
    const ctx = { playerPos, zombies, colliders: [], objective: { bar, nav: null } };
    const z = new Zombie(run, zombieStats('walker', waveConfig(1)), new THREE.Vector3(9, 0, -3));
    zombies.push(z);
    const step = (s) => {
      for (let i = 0; i < s * 60; i++) z.update(1 / 60, ctx);
    };
    return { z, hits, step };
  };

  it('va por la barra aunque el jugador esté lejos, y la golpea', () => {
    const { z, hits, step } = setup(new THREE.Vector3(0, 0, 25));
    step(6);
    expect(z.position.x).toBeLessThan(BAR_RECT.maxX + 1.6);
    expect(z.state).toBe('attack');
    expect(z.attackOn).toBe('bar');
    step(3);
    expect(hits.bar).toBeGreaterThan(0);
    expect(hits.player).toBe(0);
  });

  it('si el jugador se acerca, deja la barra y va por él; si le disparan, también', () => {
    const player = new THREE.Vector3(0, 0, 25);
    const { z, step } = setup(player);
    step(6);
    player.set(z.position.x + 1.5, 0, z.position.z + 1.5);
    step(2.5);
    expect(z.attackOn).toBe('player');
    const s2 = setup(new THREE.Vector3(14, 0, -3));
    s2.z.damage(5, 'body');
    s2.step(0.5);
    expect(s2.z.position.x).toBeGreaterThan(9); // fue hacia el jugador (x mayor), no hacia la barra
  });
});

describe('colisión con cajas giradas', () => {
  it('un círculo choca con la forma real, no con la caja envolvente', () => {
    const ry = Math.PI / 4;
    const box = new THREE.Box3(new THREE.Vector3(-1.4, 0, -1.4), new THREE.Vector3(1.4, 1, 1.4));
    withObb(box, 0, 0, 1.6, 0.3, ry);
    expect(pushCircleOut(box, 1.2, 1.2, 0.3)).toBeNull(); // esquina vacía de la caja envolvente
    expect(insideBox(box, 1.2, 1.2, 0)).toBe(false);
    const out = pushCircleOut(box, 0.1, 0.1, 0.3);
    expect(out).not.toBeNull();
    const lz = Math.sin(ry) * out[0] + Math.cos(ry) * out[1];
    expect(Math.abs(lz)).toBeCloseTo(0.6, 3); // justo fuera: medio fondo + radio
  });

  it('la navegación con varios destinos lleva a cada uno al más cercano', () => {
    const nav = new NavGrid({ minX: -10, maxX: 10, minZ: -10, maxZ: 10, cell: 1, radius: 0.3 });
    expect(nav.buildToMany([{ x: -8, z: 0 }, { x: 8, z: 0 }])).toBe(true);
    const out = { x: 0, z: 0 };
    nav.direction(6, 0, out);
    expect(out.x).toBeGreaterThan(0.5);
    nav.direction(-6, 0, out);
    expect(out.x).toBeLessThan(-0.5);
  });
});
