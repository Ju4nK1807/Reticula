// Auditoría de los mapas de campaña: comprueba con geometría real (raycasts de Three.js) que cada punto
// donde aparece un enemigo sea jugable. Si un mapa cambia y deja un escondite inútil o un enemigo
// imposible de ver, esta prueba falla y dice cuál.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Ballistics } from '../src/combat/Ballistics.js';
import { BOT_DIMENSIONS } from '../src/bots/botModel.js';
import { WarehouseMap } from '../src/modes/campaign/maps/WarehouseMap.js';
import { CityMap } from '../src/modes/campaign/maps/CityMap.js';

const MAPS = { warehouse: WarehouseMap, city: CityMap };
const EYE = 1.62;
const BOT_RADIUS = 0.4;

// Puntos de la zona del jugador desde donde se mira (centro, esquinas y bordes).
function playerEyes(world) {
  const z = world.playerZone;
  const xs = [z.minX + 0.5, (z.minX + z.maxX) / 2, z.maxX - 0.5];
  const zs = [z.minZ + 0.3, (z.minZ + z.maxZ) / 2, z.maxZ - 0.3];
  return xs.flatMap((x) => zs.map((zz) => new THREE.Vector3(x, EYE, zz)));
}

const head = (p, crouch = 0) => new THREE.Vector3(p.x, p.y + BOT_DIMENSIONS.headCenter - BOT_DIMENSIONS.crouchDrop * crouch, p.z);

// ¿Hay piso bajo un punto elevado? (rayo hacia abajo que toca algo sólido a menos de 0.5 m)
function hasFloor(world, p) {
  if (p.y < 0.01) return true;
  const rc = new THREE.Raycaster(new THREE.Vector3(p.x, p.y + 0.3, p.z), new THREE.Vector3(0, -1, 0), 0, 0.8);
  return rc.intersectObjects(world.solids, false).length > 0;
}

function pathClear(world, a, b, y) {
  const steps = Math.ceil(a.distanceTo(b) / 0.25);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    if (!world.isFree(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t, BOT_RADIUS - 0.05, y)) return false;
  }
  return true;
}

for (const [key, MapClass] of Object.entries(MAPS)) {
  describe(`mapa ${key}`, () => {
    const world = new MapClass();
    const los = new Ballistics();
    los.setWorld(world);
    const eyes = playerEyes(world);
    const seenFrom = (p) => eyes.filter((e) => los.lineOfSight(e, p)).length;

    it('el spawn del jugador está dentro de su zona y libre', () => {
      const s = world.spawn;
      const z = world.playerZone;
      expect(s.x >= z.minX && s.x <= z.maxX && s.z >= z.minZ && s.z <= z.maxZ).toBe(true);
      expect(world.isFree(s.x, s.z, 0.32)).toBe(true);
    });

    it('tiene coberturas de todas las zonas que usan los niveles', () => {
      for (const area of ['front', 'high', 'flank', 'back']) {
        expect(world.coverSpots.filter((s) => s.area === area).length, `zona ${area}`).toBeGreaterThan(0);
      }
      expect(world.highSpots.length).toBeGreaterThan(0);
    });

    it('cada asomada es visible desde la zona del jugador', () => {
      const bad = world.coverSpots.filter((s) => seenFrom(head(s.exposed)) === 0).map((s) => `#${s.id} ${s.kind}/${s.area}`);
      expect(bad).toEqual([]);
    });

    it('cada escondite oculta de verdad (desde el centro de la zona)', () => {
      const center = eyes[4];
      const bad = world.coverSpots
        .filter((s) => s.kind !== 'door')
        .filter((s) => los.lineOfSight(center, head(s.hidden, s.kind === 'rise' ? 1 : 0)))
        .map((s) => `#${s.id} ${s.kind}/${s.area}`);
      expect(bad).toEqual([]);
    });

    it('los bots caben donde se esconden y donde se asoman, y el camino está libre', () => {
      const bad = [];
      for (const s of world.coverSpots) {
        if (s.kind === 'door') continue; // las puertas empiezan fuera del mapa
        if (!world.isFree(s.hidden.x, s.hidden.z, BOT_RADIUS - 0.05, s.hidden.y)) bad.push(`#${s.id} escondite ocupado`);
        if (!world.isFree(s.exposed.x, s.exposed.z, BOT_RADIUS - 0.05, s.exposed.y)) bad.push(`#${s.id} asomada ocupada`);
        if (!pathClear(world, s.hidden, s.exposed, s.hidden.y)) bad.push(`#${s.id} camino bloqueado`);
      }
      expect(bad).toEqual([]);
    });

    it('las puertas tienen el paso libre desde fuera hasta dentro', () => {
      const bad = world.coverSpots.filter((s) => s.kind === 'door' && !pathClear(world, s.hidden, s.exposed, 0)).map((s) => `#${s.id}`);
      expect(bad).toEqual([]);
    });

    it('las posiciones elevadas tienen piso y son visibles', () => {
      const bad = [];
      for (const p of [...world.highSpots, ...world.coverSpots.filter((s) => s.exposed.y > 0).map((s) => s.exposed)]) {
        if (!hasFloor(world, p)) bad.push(`sin piso en ${p.toArray()}`);
        if (seenFrom(head(p)) === 0) bad.push(`invisible en ${p.toArray()}`);
      }
      expect(bad).toEqual([]);
    });

    it('el terreno abierto ofrece suficientes puntos libres y visibles', () => {
      const a = world.openArea;
      let ok = 0;
      const N = 400;
      for (let i = 0; i < N; i++) {
        const x = a.minX + ((i * 37) % 100) / 100 * (a.maxX - a.minX);
        const z = a.minZ + ((i * 61) % 100) / 100 * (a.maxZ - a.minZ);
        if (world.isFree(x, z, 0.5) && seenFrom(head(new THREE.Vector3(x, 0, z))) > 0) ok++;
      }
      expect(ok / N).toBeGreaterThan(0.35);
    });
  });
}
