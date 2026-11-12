import * as THREE from 'three';
import { glow } from '../../gfx/surfaces.js';
import { sign } from './sections.js';

/*
  Relicario: rincón cerrado en la esquina noreste de la plaza, donde empieza la caja misteriosa (y adonde
  vuelve cuando se muda a la plaza). Dos muros nuevos contra las fachadas norte y este, una sola entrada
  angosta en el sur, cortinas rojas, velas y un cartel sobre la puerta. Es un callejón sin salida: entrar
  a usar la caja tiene su riesgo.
*/
export const RELICARIO = { minX: 14.2, maxX: 22, minZ: -22, maxZ: -17.4, door: [19, 21], h: 3.4, t: 0.4, floorH: 0.12 };
// Lugar de la caja dentro del relicario: contra la fachada norte, de frente a la entrada.
export const RELICARIO_BOX = { x: 17.2, z: -21.55, ry: 0, where: 'el Relicario (Plaza)' };

export function buildRelicario(map, M) {
  const R = RELICARIO;
  const b = map.block.bind(map);
  const zWall = R.maxZ - R.t / 2;
  const xWall = R.minX + R.t / 2;
  // Piso propio de baldosa, a la altura de las veredas que cruzan la esquina (todo parejo, la caja
  // apoyada): un escalón de 12 cm en la entrada.
  map.floors.push({ minX: R.minX, maxX: R.maxX, minZ: R.minZ, maxZ: R.maxZ, h: R.floorH });
  b(R.maxX - R.minX, R.floorH + 0.006, R.maxZ - R.minZ, M.sidewalk ?? M.concrete, (R.minX + R.maxX) / 2, (R.minZ + R.maxZ) / 2, 0, false);
  // Muro oeste y muro sur (con el hueco de la puerta).
  b(R.t, R.h, R.maxZ - R.minZ, M.brickDark, xWall, (R.minZ + R.maxZ) / 2);
  const [d0, d1] = R.door;
  b(d0 - R.minX, R.h, R.t, M.brickDark, (R.minX + d0) / 2, zWall);
  b(R.maxX - d1, R.h, R.t, M.brickDark, (d1 + R.maxX) / 2, zWall);
  // Dintel y marco de la puerta (sin colisión: van por encima de la cabeza).
  b(d1 - d0 + 0.4, 0.5, R.t + 0.1, M.wood, (d0 + d1) / 2, zWall, R.h - 0.9, false);
  for (const x of [d0 - 0.1, d1 + 0.1]) b(0.2, R.h - 0.9, R.t + 0.12, M.wood, x, zWall, 0, false);
  // Remate de los muros.
  b(R.t + 0.1, 0.12, R.maxZ - R.minZ, M.concrete, xWall, (R.minZ + R.maxZ) / 2, R.h, false);
  b(R.maxX - R.minX, 0.12, R.t + 0.1, M.concrete, (R.minX + R.maxX) / 2, zWall, R.h, false);

  // Cartel sobre la puerta, hacia la plaza.
  sign(map, 'RELICARIO', '#7fd4ff', (d0 + d1) / 2, R.h - 0.65, R.maxZ + 0.03, 0, 1.8, 0.4);

  // Cortinas rojas colgadas en las paredes de adentro (con pliegues).
  const cloth = new THREE.MeshStandardMaterial({ color: '#4a0d12', roughness: 0.85, side: THREE.DoubleSide });
  const curtain = (w, x, z, ry) => {
    const geo = new THREE.PlaneGeometry(w, 2.6, Math.max(4, Math.round(w * 6)), 1);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin(pos.getX(i) * 7) * 0.06);
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, cloth);
    m.position.set(x, 1.75, z);
    m.rotation.y = ry;
    map.scene.add(m);
  };
  curtain(4.2, (R.minX + R.maxX) / 2 - 0.6, R.minZ + 0.08, 0); // detrás de la caja
  curtain(3.6, R.minX + R.t + 0.06, (R.minZ + R.maxZ) / 2, Math.PI / 2);
  // Alfombra delante de la caja.
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.6), new THREE.MeshStandardMaterial({ color: '#3a0a10', roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -2 }));
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(RELICARIO_BOX.x, R.floorH + 0.015, RELICARIO_BOX.z + 1.15);
  rug.userData.noShadow = true;
  map.scene.add(rug);

  // Velas: candelabros a los lados de la caja y velas sueltas en el piso, contra los muros.
  const wax = new THREE.MeshStandardMaterial({ color: '#d9cfb4', roughness: 0.6 });
  const flame = glow('#ffb35a');
  const candle = (x, z, y0 = 0, h = 0.22) => {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, h, 8), wax);
    c.position.set(x, y0 + h / 2, z);
    const f = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 4), flame);
    f.scale.y = 1.8;
    f.position.set(x, y0 + h + 0.04, z);
    map.scene.add(c, f);
  };
  for (const sx of [-1.45, 1.45]) {
    const x = RELICARIO_BOX.x + sx;
    const z = RELICARIO_BOX.z + 0.1;
    b(0.08, 1.1, 0.08, M.metal, x, z, R.floorH, false);
    b(0.4, 0.04, 0.4, M.metal, x, z, R.floorH + 1.1, false);
    for (const [ox, oz] of [[-0.12, 0], [0.12, 0], [0, 0.12]]) candle(x + ox, z + oz, R.floorH + 1.14, 0.18);
  }
  for (const [x, z, h] of [[R.minX + 0.6, -18.3, 0.3], [R.minX + 0.75, -18.6, 0.18], [R.minX + 0.55, -20.9, 0.25], [21.4, -21.4, 0.28], [21.6, -21.1, 0.16], [21.5, -18.2, 0.22]]) candle(x, z, R.floorH, h);
  map.lights.add({ pos: new THREE.Vector3(RELICARIO_BOX.x, R.floorH + 1.5, RELICARIO_BOX.z + 0.8), color: '#ff9a4a', intensity: 8, distance: 7, power: false, flicker: 'fire' });
}
