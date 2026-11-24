export function withObb(box, x, z, hx, hz, ry) {
  box.obb = { x, z, hx, hz, c: Math.cos(ry), s: Math.sin(ry) };
  return box;
}

const toLocal = (o, px, pz) => {
  const dx = px - o.x;
  const dz = pz - o.z;
  return [o.c * dx - o.s * dz, o.s * dx + o.c * dz];
};
const toWorld = (o, lx, lz) => [o.x + o.c * lx + o.s * lz, o.z - o.s * lx + o.c * lz];

export function insideBox(b, px, pz, pad = 0) {
  if (b.obb) {
    const [lx, lz] = toLocal(b.obb, px, pz);
    return Math.abs(lx) < b.obb.hx + pad && Math.abs(lz) < b.obb.hz + pad;
  }
  return px > b.min.x - pad && px < b.max.x + pad && pz > b.min.z - pad && pz < b.max.z + pad;
}

export function pushCircleOut(b, px, pz, r) {
  if (b.obb) {
    const o = b.obb;
    const [lx, lz] = toLocal(o, px, pz);
    const cx = Math.max(-o.hx, Math.min(lx, o.hx));
    const cz = Math.max(-o.hz, Math.min(lz, o.hz));
    let ox = lx - cx;
    let oz = lz - cz;
    const d2 = ox * ox + oz * oz;
    if (d2 >= r * r) return null;
    let nx;
    let nz;
    if (d2 > 1e-10) {
      const d = Math.sqrt(d2);
      nx = cx + (ox / d) * r;
      nz = cz + (oz / d) * r;
    } else {
      const exits = [[o.hx - lx, 1, 0], [lx + o.hx, -1, 0], [o.hz - lz, 0, 1], [lz + o.hz, 0, -1]];
      exits.sort((a, c) => a[0] - c[0]);
      const [, ex, ez] = exits[0];
      nx = ex ? ex * (o.hx + r) : lx;
      nz = ez ? ez * (o.hz + r) : lz;
    }
    return toWorld(o, nx, nz);
  }
  const cx = Math.max(b.min.x, Math.min(px, b.max.x));
  const cz = Math.max(b.min.z, Math.min(pz, b.max.z));
  const ox = px - cx;
  const oz = pz - cz;
  const d2 = ox * ox + oz * oz;
  if (d2 >= r * r) return null;
  if (d2 > 1e-10) {
    const d = Math.sqrt(d2);
    return [cx + (ox / d) * r, cz + (oz / d) * r];
  }
  const exits = [[px - b.min.x, b.min.x - r, pz], [b.max.x - px, b.max.x + r, pz], [pz - b.min.z, px, b.min.z - r], [b.max.z - pz, px, b.max.z + r]];
  exits.sort((a, c) => a[0] - c[0]);
  return [exits[0][1], exits[0][2]];
}
