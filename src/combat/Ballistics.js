import * as THREE from 'three';

const _dir = new THREE.Vector3();

// Raycasts de balas (hitscan) y línea de visión contra la geometría del mapa y los bots.
export class Ballistics {
  constructor() {
    this.world = null;
    this.raycaster = new THREE.Raycaster();
  }

  setWorld(world) {
    this.world = world;
  }

  // Primer impacto a lo largo del rayo. `extra` = mallas de hitbox de los bots.
  // Devuelve { point, normal, distance, bot, part } o null si no toca nada.
  cast(origin, dir, extra = [], far = 250) {
    const rc = this.raycaster;
    rc.set(origin, dir);
    rc.far = far;
    const targets = extra.length ? this.world.solids.concat(extra) : this.world.solids;
    const hit = rc.intersectObjects(targets, false)[0];
    if (!hit) return null;
    const normal = hit.face
      ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld)
      : new THREE.Vector3(0, 1, 0);
    return {
      point: hit.point,
      normal,
      distance: hit.distance,
      bot: hit.object.userData.bot ?? null,
      part: hit.object.userData.part ?? null,
    };
  }

  // true si ninguna geometría sólida del mapa se interpone entre `from` y `to`.
  lineOfSight(from, to) {
    _dir.subVectors(to, from);
    const dist = _dir.length();
    if (dist < 1e-3) return true;
    _dir.divideScalar(dist);
    const rc = this.raycaster;
    rc.set(from, _dir);
    rc.far = dist - 0.05;
    return rc.intersectObjects(this.world.solids, false).length === 0;
  }
}
