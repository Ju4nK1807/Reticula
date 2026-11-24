import { insideBox } from '../../physics/obb.js';

const DX = new Int8Array([1, -1, 0, 0, 1, 1, -1, -1]);
const DZ = new Int8Array([0, 0, 1, -1, 1, -1, 1, -1]);
const COST = new Float32Array([1, 1, 1, 1, Math.SQRT2, Math.SQRT2, Math.SQRT2, Math.SQRT2]);

export class NavGrid {
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
    this.done = new Uint8Array(n);
    this.heap = new Int32Array(n * 8 + 8);
    this.heapLen = 0;
    this.setColliders(colliders, radius);
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

  build(x, z) {
    let t = this.index(x, z);
    if (t < 0) return false;
    if (this.blocked[t]) t = this.nearestFree(t);
    if (t < 0) return false;
    return this.buildFrom([t]);
  }

  buildToMany(points) {
    const seeds = [];
    for (const p of points) {
      let t = this.index(p.x, p.z);
      if (t < 0) continue;
      if (this.blocked[t]) t = this.nearestFree(t);
      if (t >= 0 && !seeds.includes(t)) seeds.push(t);
    }
    return seeds.length ? this.buildFrom(seeds) : false;
  }

  buildFrom(seeds) {
    this.target = seeds[0];
    const { w, h, blocked, dist, next, done } = this;
    dist.fill(Infinity);
    next.fill(-1);
    done.fill(0);
    this.heapLen = 0;
    for (const t of seeds) {
      dist[t] = 0;
      this.push(t);
    }
    while (this.heapLen) {
      const i = this.pop();
      if (done[i]) continue;
      done[i] = 1;
      const ix = i % w;
      const iz = (i - ix) / w;
      const di = dist[i];
      for (let k = 0; k < 8; k++) {
        const dx = DX[k];
        const dz = DZ[k];
        const nx = ix + dx;
        const nz = iz + dz;
        if (nx < 0 || nz < 0 || nx >= w || nz >= h) continue;
        const j = nz * w + nx;
        if (blocked[j] || done[j]) continue;
        if (dx && dz && (blocked[iz * w + nx] || blocked[nz * w + ix])) continue;
        const d = di + COST[k];
        if (d < dist[j]) {
          dist[j] = d;
          next[j] = i;
          this.push(j);
        }
      }
    }
    return true;
  }

  direction(x, z, out) {
    let i = this.index(x, z);
    if (i < 0 || this.target < 0) return false;
    if (this.blocked[i] || this.dist[i] === Infinity) {
      i = this.nearestFree(i, true);
      if (i < 0) return false;
    }
    if (this.dist[i] === 0) return false;
    let j = this.next[i];
    if (j < 0) return false;
    if (this.next[j] >= 0 && this.dist[this.next[j]] > 0) j = this.next[j];
    const c = this.center(j, _c);
    const dx = c.x - x;
    const dz = c.z - z;
    const len = Math.hypot(dx, dz) || 1;
    out.x = dx / len;
    out.z = dz / len;
    return true;
  }

  clearLine(x0, z0, x1, z1) {
    const dx = x1 - x0;
    const dz = z1 - z0;
    const steps = Math.ceil(Math.hypot(dx, dz) / (this.cell * 0.5));
    for (let s = 1; s < steps; s++) {
      const i = this.index(x0 + (dx * s) / steps, z0 + (dz * s) / steps);
      if (i < 0 || this.blocked[i]) return false;
    }
    return true;
  }

  setColliders(colliders, radius = this.radius) {
    this.radius = radius;
    this.blocked.fill(0);
    const { cell, w, h, minX, minZ } = this;
    for (const b of colliders) {
      if (b.max.y < 0.3 || b.min.y > 1.6) continue;
      const x0 = Math.max(0, Math.floor((b.min.x - radius - minX) / cell - 0.5));
      const x1 = Math.min(w - 1, Math.ceil((b.max.x + radius - minX) / cell - 0.5));
      const z0 = Math.max(0, Math.floor((b.min.z - radius - minZ) / cell - 0.5));
      const z1 = Math.min(h - 1, Math.ceil((b.max.z + radius - minZ) / cell - 0.5));
      for (let cz = z0; cz <= z1; cz++) {
        const z = minZ + (cz + 0.5) * cell;
        for (let cx = x0; cx <= x1; cx++) {
          const i = cz * w + cx;
          if (!this.blocked[i] && insideBox(b, minX + (cx + 0.5) * cell, z, radius)) this.blocked[i] = 1;
        }
      }
    }
    this.target = -1;
  }

  pathDistance(x, z) {
    const i = this.index(x, z);
    return i < 0 ? Infinity : this.dist[i] * this.cell;
  }

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
