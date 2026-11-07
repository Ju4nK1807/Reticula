import * as THREE from 'three';

/*
  Cámara de la pantalla de título (solo en mapas con `menuShots`, como la Armería):
  - Pasa de un plano a otro según la opción enfocada del menú, con un resorte críticamente amortiguado
    (arranca y frena suave, sin rebote) y sin cortes aunque se cambie de opción a mitad de camino.
  - Respira: una deriva lenta de pocos centímetros, para que la escena nunca esté quieta del todo.
  - Paralaje: se inclina un poco hacia donde está el mouse (en táctil no).
*/

export const MENU_VFOV = 44; // campo de visión vertical del menú (grados): lente "de cine", no de juego
const SMOOTH_TIME = 0.85; // s que tarda en llegar a un plano nuevo (aprox.)
const PARALLAX = { x: 0.08, y: 0.045, look: 0.35 };

/** Un paso de amortiguación crítica (como SmoothDamp). Devuelve [valor, velocidad]. */
export function smoothDamp(current, target, velocity, smoothTime, dt) {
  const omega = 2 / Math.max(1e-4, smoothTime);
  const x = omega * dt;
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = current - target;
  const temp = (velocity + omega * change) * dt;
  const v = (velocity - omega * temp) * exp;
  let out = target + (change + temp) * exp;
  // Sin pasarse del objetivo.
  if (target - current > 0 === out > target) return [target, 0];
  return [out, v];
}

const AXES = ['x', 'y', 'z'];

export class MenuCamera {
  constructor() {
    this.shots = null;
    this.shot = 'main';
    this.pos = new THREE.Vector3();
    this.look = new THREE.Vector3();
    this.vPos = new THREE.Vector3();
    this.vLook = new THREE.Vector3();
    this.mouse = { x: 0, y: 0, sx: 0, sy: 0 };
    this.ready = false;
    this._look = new THREE.Vector3();
    if (typeof window !== 'undefined') {
      window.addEventListener(
        'pointermove',
        (e) => {
          if (e.pointerType === 'touch') return;
          this.mouse.x = (e.clientX / Math.max(1, window.innerWidth)) * 2 - 1;
          this.mouse.y = (e.clientY / Math.max(1, window.innerHeight)) * 2 - 1;
        },
        { passive: true },
      );
    }
  }

  /** Planos del mapa activo ({ main, …: { pos, look } }) o null si el mapa no tiene. */
  setShots(shots) {
    if (this.shots === shots) return;
    this.shots = shots;
    this.ready = false;
    this.shot = 'main';
  }

  /** Cambia al plano de una opción del menú (si el mapa no lo tiene, al principal). */
  focus(id) {
    this.shot = this.shots?.[id] ? id : 'main';
  }

  /** Coloca la cámara. `time` en s (para la deriva). */
  update(dt, time, camera) {
    const s = this.shots?.[this.shot] ?? this.shots?.main;
    if (!s) return;
    if (!this.ready) {
      this.pos.copy(s.pos);
      this.look.copy(s.look);
      this.vPos.set(0, 0, 0);
      this.vLook.set(0, 0, 0);
      this.ready = true;
    }
    const step = Math.min(dt, 0.1);
    for (const a of AXES) {
      [this.pos[a], this.vPos[a]] = smoothDamp(this.pos[a], s.pos[a], this.vPos[a], SMOOTH_TIME, step);
      [this.look[a], this.vLook[a]] = smoothDamp(this.look[a], s.look[a], this.vLook[a], SMOOTH_TIME, step);
    }
    const m = this.mouse;
    const km = 1 - Math.exp(-step * 3.5);
    m.sx += (m.x - m.sx) * km;
    m.sy += (m.y - m.sy) * km;
    camera.position.set(
      this.pos.x + Math.sin(time * 0.31) * 0.025 + m.sx * PARALLAX.x,
      this.pos.y + Math.sin(time * 0.47) * 0.012 - m.sy * PARALLAX.y,
      this.pos.z + Math.cos(time * 0.23) * 0.02,
    );
    this._look.set(this.look.x + m.sx * PARALLAX.look, this.look.y - m.sy * PARALLAX.look * 0.5, this.look.z);
    camera.lookAt(this._look);
  }
}
