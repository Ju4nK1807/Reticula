import * as THREE from 'three';

const _box = new THREE.Box3();
const _pad = new THREE.Vector3();

// Base de los mapas. Cada mapa expone:
// - solids: mallas que bloquean balas y línea de visión.
// - colliders: cajas que bloquean el movimiento del jugador y los bots.
// - playerBlockers: cajas invisibles solo para el jugador (barandales, puertas).
// - playerZone: límites donde puede moverse el jugador.
// - coverSpots / highSpots / openArea: lugares donde pueden aparecer bots.
export class World {
  constructor({ name, background, fogNear, fogFar, spawn, playerZone }) {
    this.name = name;
    this.spawn = spawn;
    this.playerZone = playerZone;
    this.openArea = null;
    this.solids = [];
    this.colliders = [];
    this.playerBlockers = [];
    this.coverSpots = [];
    this.highSpots = [];

    this.scene = new THREE.Scene();
    const bg = new THREE.Color(background);
    this.scene.background = bg;
    this.scene.fog = new THREE.Fog(bg, fogNear, fogFar);
  }

  // Caja con base en y0. `solid` = bloquea balas y movimiento.
  block(w, h, d, mat, x, z, y0 = 0, solid = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y0 + h / 2, z);
    this.scene.add(mesh);
    if (solid) {
      this.solids.push(mesh);
      this.colliders.push(new THREE.Box3().setFromCenterAndSize(mesh.position, new THREE.Vector3(w, h, d)));
    }
    return mesh;
  }

  playerBlocker(minX, maxX, minZ, maxZ) {
    this.playerBlockers.push(new THREE.Box3(new THREE.Vector3(minX, 0, minZ), new THREE.Vector3(maxX, 12, maxZ)));
  }

  ground(width, depth, centerZ, mat) {
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), mat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.z = centerZ;
    this.scene.add(ground);
    this.solids.push(ground);
    return ground;
  }

  // ¿Cabe un cilindro de radio r con base en y0 y altura h en (x, z) sin chocar con colliders?
  isFree(x, z, r = 0.45, y0 = 0, h = 1.8) {
    _pad.set(r, 0, r);
    for (const b of this.colliders) {
      if (b.max.y <= y0 + 0.05 || b.min.y >= y0 + h) continue;
      _box.copy(b).expandByVector(_pad);
      if (x > _box.min.x && x < _box.max.x && z > _box.min.z && z < _box.max.z) return false;
    }
    return true;
  }

  update() {}

  dispose() {
    this.scene.traverse((obj) => {
      obj.geometry?.dispose();
      obj.material?.dispose?.();
    });
  }
}
