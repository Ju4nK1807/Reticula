import * as THREE from 'three';
import { World } from '../../../scenes/World.js';

/*
  Base de los mapas de campaña. Convención (la misma que TrainingYard, la que esperan los bots y Phase):
  el jugador está hacia +Z mirando a -Z y el campo enemigo se extiende hacia -Z.

  Expone, además de World:
  - coverSpots: { id, hidden, exposed, kind: 'side' | 'rise' | 'door', area: 'front' | 'high' | 'flank' | 'back' }
  - highSpots: puntos exactos en posiciones elevadas (con piso debajo)
  - openArea: rectángulo de terreno abierto para apariciones
  Todo esto lo verifica tests/campaignMaps.test.js (auditoría de mapas).
*/
export class CampaignWorld extends World {
  constructor(opts) {
    super(opts);
    // Material Lambert con sombreado plano (estilo low-poly del juego).
    this.lambert = (color) => new THREE.MeshLambertMaterial({ color, flatShading: true });
  }

  // Caja definida por sus límites en X y Z (más legible para muros y losas).
  box(x0, x1, z0, z1, h, mat, y0 = 0, solid = true) {
    return this.block(x1 - x0, h, z1 - z0, mat, (x0 + x1) / 2, (z0 + z1) / 2, y0, solid);
  }

  spot(hx, hy, hz, ex, ey, ez, kind, area) {
    const s = { id: this.coverSpots.length, hidden: new THREE.Vector3(hx, hy, hz), exposed: new THREE.Vector3(ex, ey, ez), kind, area };
    this.coverSpots.push(s);
    return s;
  }

  // Bordes izquierdo y derecho de una cobertura ancha (perpendicular a la vista): el bot se esconde
  // detrás (lado -Z) y sale de lado.
  addSideSpots(cx, cz, w, d, y = 0, area = 'front') {
    const z = cz - d / 2 - 0.7;
    this.spot(cx - w / 2 + 0.6, y, z, cx - w / 2 - 1.1, y, z, 'side', area);
    this.spot(cx + w / 2 - 0.6, y, z, cx + w / 2 + 1.1, y, z, 'side', area);
  }

  // Detrás de una cobertura baja: espera agachado y se levanta.
  addRiseSpot(x, y, z, area = 'front') {
    this.spot(x, y, z, x, y, z, 'rise', area);
  }

  // Puerta: el bot entra caminando desde fuera del mapa.
  addDoorSpot(hx, hz, ex, ez, area) {
    this.spot(hx, 0, hz, ex, 0, ez, 'door', area);
  }

  // Muro a lo largo de X (en z fijo) con huecos de puerta [{ at, w }] y dintel sobre cada hueco.
  wallX(x0, x1, z, h, mat, gaps = [], thickness = 1, doorH = 3.2) {
    const cuts = [...gaps].sort((a, b) => a.at - b.at);
    let from = x0;
    for (const g of cuts) {
      this.box(from, g.at - g.w / 2, z - thickness / 2, z + thickness / 2, h, mat);
      this.box(g.at - g.w / 2, g.at + g.w / 2, z - thickness / 2, z + thickness / 2, h - doorH, mat, doorH);
      from = g.at + g.w / 2;
    }
    this.box(from, x1, z - thickness / 2, z + thickness / 2, h, mat);
  }

  // Muro a lo largo de Z (en x fijo) con huecos de puerta.
  wallZ(z0, z1, x, h, mat, gaps = [], thickness = 1, doorH = 3.2) {
    const cuts = [...gaps].sort((a, b) => a.at - b.at);
    let from = z0;
    for (const g of cuts) {
      this.box(x - thickness / 2, x + thickness / 2, from, g.at - g.w / 2, h, mat);
      this.box(x - thickness / 2, x + thickness / 2, g.at - g.w / 2, g.at + g.w / 2, h - doorH, mat, doorH);
      from = g.at + g.w / 2;
    }
    this.box(x - thickness / 2, x + thickness / 2, from, z1, h, mat);
  }

  // Techo sin iluminación (mira hacia abajo y la luz viene de arriba) y sólido para las balas.
  ceiling(width, depth, centerZ, y, color) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), new THREE.MeshBasicMaterial({ color }));
    mesh.rotation.x = Math.PI / 2;
    mesh.position.set(0, y, centerZ);
    this.scene.add(mesh);
    this.solids.push(mesh);
    return mesh;
  }

  finish() {
    this.scene.updateMatrixWorld(true);
  }
}
