/*
  Navegación de la horda: campo de flujo sobre una cuadrícula.

  La cuadrícula cubre la zona de juego en celdas de `cell` metros; una celda está bloqueada si su centro
  cae dentro de un colisionador (agrandado por el radio del zombi). build(x, z) calcula con Dijkstra
  (8 vecinos, diagonales √2 y sin cortar esquinas) la distancia de cada celda al jugador y hacia qué
  vecina seguir. Así 24 zombis rodean obstáculos con un solo cálculo compartido (unas pocas veces por
  segundo), en vez de buscar un camino cada uno.
  Lógica pura: ver tests/navGrid.test.js.
*/

const DIRS = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
];

export class NavGrid {
  /**
   * @param {{ minX:number, maxX:number, minZ:number, maxZ:number, cell?:number, radius?:number,
   *           colliders?: Array<{min:{x,y,z},max:{x,y,z}}> }} opts
   */
  constructor({ minX, maxX, minZ, maxZ, cell = 1, radius = 0.45, colliders = [] }) {
    this.cell = cell;
    this.minX = minX;
    this.minZ = minZ;
    this.w = Math.max(1, Math.ceil((maxX - minX) / cell));
    this.h = Math.max(1, Math.ceil((maxZ - minZ) / cell));
    const n = this.w * this.h;
    this.blocked = new Uint8Array(n);
    this.dist = new Float32Array(n).fill(Infinity);
    this.next = new Int32Array(n).fill(-1);
    this.heap = new Int32Array(n * 8 + 8); // cola de prioridad (índices, con repetidos) reutilizada
    this.heapLen = 0;
    for (let i = 0; i < n; i++) {
      const { x, z } = this.center(i);
      for (const b of colliders) {
        // Solo cuenta lo que bloquea el paso a la altura de un cuerpo.
        if (b.max.y < 0.3 || b.min.y > 1.6) continue;
        if (x > b.min.x - radius && x < b.max.x + radius && z > b.min.z - radius && z < b.max.z + radius) {
          this.blocked[i] = 1;
          break;
        }
      }
    }
    this.target = -1;
  }

  index(x, z) {
    const cx = Math.floor((x - this.minX) / this.cell);
    const cz = Math.floor((z - this.minZ) / this.cell);
    if (cx < 0 || cz < 0 || cx >= this.w || cz >= this.h) return -1;
    return cz * this.w + cx;
  }

  center(i, out = { x: 0, z: 0 }) {
    out.x = this.minX + ((i % this.w) + 0.5) * this.cell;
    out.z = this.minZ + (Math.floor(i / this.w) + 0.5) * this.cell;
    return out;
  }

  /** Campo de flujo hacia el punto (x, z). */
  build(x, z) {
    let t = this.index(x, z);
    if (t < 0) return false;
    if (this.blocked[t]) t = this.nearestFree(t);
    if (t < 0) return false;
    this.target = t;
    this.dist.fill(Infinity);
    this.next.fill(-1);
    this.dist[t] = 0;
    this.heapLen = 0;
    this.push(t);
    const w = this.w;
    while (this.heapLen) {
      const i = this.pop();
      const ix = i % w;
      const iz = (i - ix) / w;
      const di = this.dist[i];
      for (const [dx, dz, cost] of DIRS) {
        const nx = ix + dx;
        const nz = iz + dz;
        if (nx < 0 || nz < 0 || nx >= w || nz >= this.h) continue;
        const j = nz * w + nx;
        if (this.blocked[j]) continue;
        // Sin cortar esquinas: en diagonal, las dos celdas rectas también deben estar libres.
        if (dx && dz && (this.blocked[iz * w + nx] || this.blocked[nz * w + ix])) continue;
        const d = di + cost;
        if (d < this.dist[j]) {
          this.dist[j] = d;
          this.next[j] = i;
          this.push(j);
        }
      }
    }
    return true;
  }

  /**
   * Dirección (normalizada, en out.x/out.z) para seguir el campo desde (x, z): hacia el centro de la
   * celda que está DOS pasos más adelante (curvas más suaves). Devuelve false si no hay camino.
   */
  direction(x, z, out) {
    let i = this.index(x, z);
    if (i < 0 || this.target < 0) return false;
    if (this.blocked[i] || this.dist[i] === Infinity) {
      i = this.nearestFree(i, true);
      if (i < 0) return false;
    }
    if (i === this.target) return false; // ya está en la celda del jugador: que vaya directo
    let j = this.next[i];
    if (j < 0) return false;
    if (this.next[j] >= 0 && this.next[j] !== this.target) j = this.next[j];
    const c = this.center(j, _c);
    const dx = c.x - x;
    const dz = c.z - z;
    const len = Math.hypot(dx, dz) || 1;
    out.x = dx / len;
    out.z = dz / len;
    return true;
  }

  /** Distancia por el campo (en m) desde (x, z) hasta el jugador, o Infinity. */
  pathDistance(x, z) {
    const i = this.index(x, z);
    return i < 0 ? Infinity : this.dist[i] * this.cell;
  }

  // Celda libre más cercana (anillos crecientes). `reachable`: además con camino calculado.
  nearestFree(i, reachable = false) {
    const ix = i % this.w;
    const iz = Math.floor(i / this.w);
    for (let r = 1; r < 6; r++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const nx = ix + dx;
          const nz = iz + dz;
          if (nx < 0 || nz < 0 || nx >= this.w || nz >= this.h) continue;
          const j = nz * this.w + nx;
          if (!this.blocked[j] && (!reachable || this.dist[j] < Infinity)) return j;
        }
      }
    }
    return -1;
  }

  // Montículo binario mínimo por distancia (con entradas repetidas: se ignoran las viejas al sacarlas).
  push(i) {
    const h = this.heap;
    let k = this.heapLen++;
    h[k] = i;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (this.dist[h[p]] <= this.dist[h[k]]) break;
      [h[p], h[k]] = [h[k], h[p]];
      k = p;
    }
  }

  pop() {
    const h = this.heap;
    const top = h[0];
    h[0] = h[--this.heapLen];
    let k = 0;
    for (;;) {
      const l = 2 * k + 1;
      const r = l + 1;
      let m = k;
      if (l < this.heapLen && this.dist[h[l]] < this.dist[h[m]]) m = l;
      if (r < this.heapLen && this.dist[h[r]] < this.dist[h[m]]) m = r;
      if (m === k) break;
      [h[m], h[k]] = [h[k], h[m]];
      k = m;
    }
    return top;
  }
}

const _c = { x: 0, z: 0 };
