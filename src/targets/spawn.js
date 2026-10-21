import * as THREE from 'three';
import { DEG } from '../utils/math.js';

// Convierte ángulos (grados, yaw positivo = izquierda) y distancia a un punto en el mundo.
// Con yaw = pitch = 0 el punto queda justo enfrente (-Z) del origen.
export function pointFromAngles(yawDeg, pitchDeg, distance, origin, out = new THREE.Vector3()) {
  const y = yawDeg * DEG;
  const p = pitchDeg * DEG;
  return out
    .set(-Math.sin(y) * Math.cos(p), Math.sin(p), -Math.cos(y) * Math.cos(p))
    .multiplyScalar(distance)
    .add(origin);
}

// Separación angular aproximada entre dos direcciones { yaw, pitch } en grados.
export function angularDistance(a, b) {
  const cosPitch = Math.cos(((a.pitch + b.pitch) / 2) * DEG);
  return Math.hypot((a.yaw - b.yaw) * cosPitch, a.pitch - b.pitch);
}
