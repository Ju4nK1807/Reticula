import * as THREE from 'three';

export const GRAVITY = 9.8;
export const STEP = 1 / 120;
const MAX_STEPS = 8;
const SLEEP_V = 0.07;
const SLEEP_W = 0.15;
const SLEEP_TIME = 0.5;
const MAX_W = 40;
const BOUNCE_V = 1.2;
const SLOP = 0.002;
const LINEAR_DAMP = 0.08;
const ANGULAR_DAMP = 0.6;
const ROLL_DAMP = 2.4;

const _r = new THREE.Vector3();
const _p = new THREE.Vector3();
const _vr = new THREE.Vector3();
const _t = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _qi = new THREE.Quaternion();
const _wq = new THREE.Quaternion();

export function boxPoints(w, h, d) {
  const pts = [];
  for (const x of [-w / 2, w / 2]) for (const y of [-h / 2, h / 2]) for (const z of [-d / 2, d / 2]) pts.push(new THREE.Vector3(x, y, z));
  return pts;
}

export function cylinderPoints(r, h, n = 8) {
  const pts = [];
  for (const y of [-h / 2, h / 2]) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r));
    }
  }
  return pts;
}

export function conePoints(r, h, n = 8) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a) * r, -h / 2, Math.sin(a) * r));
  }
  pts.push(new THREE.Vector3(0, h / 2, 0));
  return pts;
}

export const boxInertia = (m, w, h, d) => new THREE.Vector3((m / 12) * (h * h + d * d), (m / 12) * (w * w + d * d), (m / 12) * (w * w + h * h));
export const cylinderInertia = (m, r, h) => new THREE.Vector3((m / 12) * (3 * r * r + h * h), (m / 2) * r * r, (m / 12) * (3 * r * r + h * h));

export class RigidBody {
  constructor({ mass, inertia, points, restitution = 0.3, friction = 0.6, radius, footprint = radius, core = footprint, height = radius * 2 }) {
    this.mass = mass;
    this.invMass = 1 / mass;
    this.invInertia = new THREE.Vector3(1 / inertia.x, 1 / inertia.y, 1 / inertia.z);
    this.points = points;
    this.restitution = restitution;
    this.friction = friction;
    this.radius = radius;
    this.footprint = footprint;
    this.core = core;
    this.height = height;
    this.position = new THREE.Vector3();
    this.quaternion = new THREE.Quaternion();
    this.velocity = new THREE.Vector3();
    this.angular = new THREE.Vector3();
    this.awake = false;
    this.sleepT = 0;
    this.contacts = 0;
    this.lastImpact = 0;
  }

  wake() {
    this.awake = true;
    this.sleepT = 0;
  }

  invInertiaMul(v, out) {
    _qi.copy(this.quaternion).invert();
    out.copy(v).applyQuaternion(_qi);
    out.multiply(this.invInertia);
    return out.applyQuaternion(this.quaternion);
  }

  applyImpulse(impulse, point) {
    this.velocity.addScaledVector(impulse, this.invMass);
    _r.subVectors(point, this.position);
    _a.crossVectors(_r, impulse);
    this.invInertiaMul(_a, _b);
    this.angular.add(_b);
    if (this.angular.length() > MAX_W) this.angular.setLength(MAX_W);
    this.wake();
  }

  effectiveInv(r, n) {
    _a.crossVectors(r, n);
    this.invInertiaMul(_a, _b);
    _a.crossVectors(_b, r);
    return this.invMass + n.dot(_a);
  }
}

function boxContact(P, box, normal) {
  if (P.x <= box.min.x || P.x >= box.max.x || P.y <= box.min.y || P.y >= box.max.y || P.z <= box.min.z || P.z >= box.max.z) return -1;
  let best = P.x - box.min.x;
  normal.set(-1, 0, 0);
  const faces = [
    [box.max.x - P.x, 1, 0, 0],
    [P.y - box.min.y, 0, -1, 0],
    [box.max.y - P.y, 0, 1, 0],
    [P.z - box.min.z, 0, 0, -1],
    [box.max.z - P.z, 0, 0, 1],
  ];
  for (const [d, x, y, z] of faces) {
    if (d < best) {
      best = d;
      normal.set(x, y, z);
    }
  }
  return best;
}

const contactPool = [];
const nearBoxes = [];
const _n = new THREE.Vector3();

export function stepBody(body, dt, colliders = [], groundY = 0) {
  if (!body.awake) return;
  const steps = Math.min(MAX_STEPS, Math.max(1, Math.ceil(dt / STEP - 1e-6)));
  const h = dt / steps;
  for (let s = 0; s < steps; s++) substep(body, h, colliders, groundY);
  if (body.contacts > 0 && body.velocity.length() < SLEEP_V && body.angular.length() < SLEEP_W) {
    body.sleepT += dt;
    if (body.sleepT > SLEEP_TIME) {
      body.awake = false;
      body.velocity.set(0, 0, 0);
      body.angular.set(0, 0, 0);
    }
  } else body.sleepT = 0;
}

function substep(body, h, colliders, groundY) {
  const v = body.velocity;
  const w = body.angular;
  v.y -= GRAVITY * h;
  v.multiplyScalar(Math.exp(-LINEAR_DAMP * h));
  w.multiplyScalar(Math.exp(-(ANGULAR_DAMP + (body.contacts ? ROLL_DAMP : 0)) * h));
  if (body.contacts) {
    const k = Math.exp(-0.9 * h);
    v.x *= k;
    v.z *= k;
    if (body.contacts >= 2 && v.lengthSq() < 0.09) {
      w.multiplyScalar(Math.exp(-8 * h));
      v.multiplyScalar(Math.exp(-3 * h));
    }
  }
  body.position.addScaledVector(v, h);
  _wq.set(w.x, w.y, w.z, 0).multiply(body.quaternion);
  const q = body.quaternion;
  q.set(q.x + 0.5 * _wq.x * h, q.y + 0.5 * _wq.y * h, q.z + 0.5 * _wq.z * h, q.w + 0.5 * _wq.w * h).normalize();

  let n = 0;
  const near = nearBoxes;
  near.length = 0;
  for (const box of colliders) {
    if (
      body.position.x + body.radius < box.min.x || body.position.x - body.radius > box.max.x ||
      body.position.y + body.radius < box.min.y || body.position.y - body.radius > box.max.y ||
      body.position.z + body.radius < box.min.z || body.position.z - body.radius > box.max.z
    ) continue;
    near.push(box);
  }
  for (const local of body.points) {
    _p.copy(local).applyQuaternion(q).add(body.position);
    let depth = groundY - _p.y;
    if (depth > 0) _n.set(0, 1, 0);
    else {
      depth = -1;
      for (const box of near) {
        const d = boxContact(_p, box, _t);
        if (d > depth) {
          depth = d;
          _n.copy(_t);
        }
      }
    }
    if (depth <= 0) continue;
    const c = contactPool[n] ?? (contactPool[n] = { p: new THREE.Vector3(), n: new THREE.Vector3(), depth: 0 });
    c.p.copy(_p);
    c.n.copy(_n);
    c.depth = depth;
    n++;
  }
  body.contacts = n;
  if (!n) return;

  for (let it = 0; it < 3; it++) {
    for (let i = 0; i < n; i++) {
      const c = contactPool[i];
      _r.subVectors(c.p, body.position);
      _vr.crossVectors(w, _r).add(v);
      const vn = _vr.dot(c.n);
      if (vn >= 0) continue;
      if (it === 0 && -vn > body.lastImpact) body.lastImpact = -vn;
      const e = -vn > BOUNCE_V ? body.restitution : 0;
      const jn = (-(1 + e) * vn) / body.effectiveInv(_r, c.n);
      _a.copy(c.n).multiplyScalar(jn);
      applyAt(body, _a, _r);
      _vr.crossVectors(w, _r).add(v);
      _t.copy(_vr).addScaledVector(c.n, -_vr.dot(c.n));
      const vt = _t.length();
      if (vt > 1e-5) {
        _t.divideScalar(vt);
        const jt = Math.min(vt / body.effectiveInv(_r, _t), body.friction * jn);
        _a.copy(_t).multiplyScalar(-jt);
        applyAt(body, _a, _r);
      }
    }
  }
  _a.set(0, 0, 0);
  const seen = [];
  for (let i = 0; i < n; i++) {
    const c = contactPool[i];
    const key = `${c.n.x},${c.n.y},${c.n.z}`;
    const prev = seen.find((x) => x.key === key);
    if (prev) prev.depth = Math.max(prev.depth, c.depth);
    else seen.push({ key, n: c.n, depth: c.depth });
  }
  for (const s of seen) _a.addScaledVector(s.n, Math.max(0, s.depth - SLOP) * 0.85);
  body.position.add(_a);
}

function applyAt(body, impulse, r) {
  body.velocity.addScaledVector(impulse, body.invMass);
  _b.crossVectors(r, impulse);
  body.invInertiaMul(_b, _b);
  body.angular.add(_b);
  if (body.angular.length() > MAX_W) body.angular.setLength(MAX_W);
}

export function separate(a, b) {
  const ha = a.height / 2;
  const hb = b.height / 2;
  if (a.position.y + ha < b.position.y - hb || b.position.y + hb < a.position.y - ha) return false;
  _a.set(b.position.x - a.position.x, 0, b.position.z - a.position.z);
  const dist = _a.length();
  const min = a.core + b.core;
  if (dist >= min || dist < 1e-6) return false;
  _a.divideScalar(dist);
  const total = a.invMass + b.invMass;
  const push = min - dist;
  const vn = _vr.subVectors(b.velocity, a.velocity).dot(_a);
  for (const [body, sign] of [[a, -1], [b, 1]]) {
    const share = (push * body.invMass) / total;
    if (!body.awake && share < 0.003 && Math.abs(vn) < 0.6) continue;
    body.position.addScaledVector(_a, sign * share);
    if (vn < 0) body.velocity.addScaledVector(_a, (sign * (-(1 + 0.2) * vn) * body.invMass) / total);
    body.wake();
  }
  return true;
}
