/*
  Calidad automática con resolución dinámica: mantiene los FPS objetivo ajustando la resolución
  interna de render y, si no alcanza, bajando el nivel de detalle.

  Se alimenta con el tiempo real de cada cuadro (ms) mientras se juega y decide cada VENTANA:
  - Por encima del presupuesto (va lento): baja la escala (5-10 %). Si ya está en el mínimo, baja el
    detalle (alta → media → baja) y recupera algo de escala, porque eso libera mucho trabajo.
  - En el objetivo de forma estable: prueba a subir la escala un paso. Con la sincronía vertical no
    se ve el margen real, así que la subida es una prueba: si el siguiente tramo va lento, se deshace
    y se espera el doble antes de volver a intentarlo (sin oscilar).
  - El detalle nunca sube solo durante la partida (cambiarlo recompila sombreadores y se notaría).
  Lógica pura (sin DOM ni Three.js): ver tests/autoQuality.test.js.
*/

export const AUTO_DETAILS = ['alta', 'media', 'baja'];
export const AUTO_SCALE = { min: 0.5, max: 1, step: 0.05 };
const WINDOW = 0.75; // s de cuadros por decisión
const SLOW = 1.08; // ×presupuesto: por encima, va lento (60 FPS → < ~55.5 FPS)
const OK = 1.04; // ×presupuesto: hasta aquí, está en el objetivo
const STABLE_TO_RAISE = 4; // s estables antes de probar a subir la escala
const MAX_BACKOFF = 60; // s
const HITCH = 250; // ms: cuadros más largos son tirones aislados (carga, cambio de pestaña), no cuentan
// Bajar el detalle recompila todos los sombreadores (un tirón grande): solo si en la escala mínima
// sigue lento varias ventanas seguidas, no por un momento de carga (una tanda de enemigos).
const SLOW_AT_MIN = 3;

/** Detalle inicial según la GPU (nombre de WEBGL_debug_renderer_info) y el tipo de dispositivo. */
export function guessDetail(renderer = '', { touch = false } = {}) {
  const r = String(renderer).toLowerCase();
  if (/swiftshader|llvmpipe|software|microsoft basic/.test(r)) return 'baja';
  if (touch) return /adreno \(tm\) (7|8)\d\d|apple gpu|mali-g7[1-9]|mali-g[89]\d|immortalis|xclipse/.test(r) ? 'media' : 'baja';
  if (/nvidia|geforce|rtx|gtx|quadro|radeon rx|radeon pro|arc a\d|apple m\d/.test(r)) return 'alta';
  return 'media'; // integradas (Intel UHD/Iris, Radeon Graphics de APU) y desconocidas
}

export class AutoQuality {
  constructor({ detail = 'media', scale = 1, targetFps = 60 } = {}) {
    this.detail = AUTO_DETAILS.includes(detail) ? detail : 'media';
    this.scale = clampScale(scale);
    this.budget = 1000 / targetFps;
    this.acc = 0;
    this.sum = 0;
    this.n = 0;
    this.stable = 0; // s seguidos en el objetivo
    this.needStable = STABLE_TO_RAISE;
    this.probe = null; // escala anterior mientras se prueba una subida
    this.slowAtMin = 0; // ventanas lentas seguidas ya en la escala mínima
    this.changes = 0;
  }

  /**
   * Un cuadro más. Devuelve { detail, scale } cuando hay que cambiar algo, o null.
   * @param {number} ms tiempo real del cuadro
   */
  sample(ms) {
    if (!(ms > 0) || ms > HITCH) return null;
    this.acc += ms / 1000;
    this.sum += ms;
    this.n++;
    if (this.acc < WINDOW) return null;
    const avg = this.sum / this.n;
    const elapsed = this.acc;
    this.acc = 0;
    this.sum = 0;
    this.n = 0;
    return this.decide(avg, elapsed);
  }

  decide(avg, elapsed) {
    const slow = avg > this.budget * SLOW;
    if (this.probe !== null) {
      // Resultado de la prueba de subida.
      const before = this.probe;
      this.probe = null;
      if (slow) {
        this.needStable = Math.min(MAX_BACKOFF, this.needStable * 2);
        this.stable = 0;
        return this.set(this.detail, before);
      }
      this.needStable = STABLE_TO_RAISE;
    }
    if (slow) {
      this.stable = 0;
      const step = avg > this.budget * 1.5 ? AUTO_SCALE.step * 2 : AUTO_SCALE.step;
      if (this.scale - step >= AUTO_SCALE.min - 1e-6) {
        this.slowAtMin = 0;
        return this.set(this.detail, this.scale - step);
      }
      if (this.scale > AUTO_SCALE.min) return this.set(this.detail, AUTO_SCALE.min);
      const i = AUTO_DETAILS.indexOf(this.detail);
      if (i < AUTO_DETAILS.length - 1 && ++this.slowAtMin >= SLOW_AT_MIN) {
        this.slowAtMin = 0;
        return this.set(AUTO_DETAILS[i + 1], Math.min(AUTO_SCALE.max, this.scale + 0.15));
      }
      return null; // ya está en lo mínimo (o esperando confirmar antes de bajar el detalle)
    }
    this.slowAtMin = 0;
    if (avg <= this.budget * OK) {
      this.stable += elapsed;
      if (this.stable >= this.needStable && this.scale < AUTO_SCALE.max - 1e-6) {
        this.stable = 0;
        this.probe = this.scale;
        return this.set(this.detail, this.scale + AUTO_SCALE.step);
      }
    } else this.stable = 0;
    return null;
  }

  set(detail, scale) {
    const s = clampScale(scale);
    if (detail === this.detail && Math.abs(s - this.scale) < 1e-6) return null;
    this.detail = detail;
    this.scale = s;
    this.changes++;
    return { detail, scale: s };
  }
}

function clampScale(v) {
  const n = Number.isFinite(v) ? v : 1;
  const stepped = Math.round(n / AUTO_SCALE.step) * AUTO_SCALE.step;
  return Math.min(AUTO_SCALE.max, Math.max(AUTO_SCALE.min, +stepped.toFixed(2)));
}
