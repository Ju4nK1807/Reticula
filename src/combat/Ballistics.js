import * as THREE from 'three';

const _dir = new THREE.Vector3();

// Raycasts de balas (hitscan) y línea de visión contra la geometría del mapa y los bots.
export class Ballistics {
  constructor() {
    this.world = null;
    this.raycaster = new THREE.Raycaster();
    this.targets = []; // sólidos + hitboxes, reutilizado en cada disparo
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
    let targets = this.world.solids;
    if (extra.length) {
      targets = this.targets;
      targets.length = 0;
      for (const m of this.world.solids) targets.push(m);
      for (const m of extra) targets.push(m);
    }
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
      prop: hit.object.userData.prop ?? null, // utilería con física (physics/Props.js)
      object: hit.object, // la malla tocada (p. ej. una botella de la barra)
      instanceId: hit.instanceId ?? null, // en mallas instanciadas, cuál de las instancias
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
