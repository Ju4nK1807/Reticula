// Medidor de rendimiento con el reloj real (no con el dt del juego, que está limitado a 50 ms y
// escondería las caídas por debajo de 20 FPS).
// Cada REPORT_EVERY segundos calcula: FPS promedio, ms por cuadro y "1 % low" (los FPS del 1 % de
// cuadros más lentos de la ventana), que es lo que de verdad se siente como tirones.

const WINDOW = 240; // cuadros guardados (~2-4 s según los FPS)
const REPORT_EVERY = 0.5; // s

export class PerfMeter {
  constructor() {
    this.times = new Float32Array(WINDOW); // ms de cada cuadro (búfer circular)
    this.count = 0;
    this.index = 0;
    this.last = null;
    this.acc = 0;
    this.sorted = new Float32Array(WINDOW);
    this.report = null; // { fps, ms, low1 }
  }

  // Llamar una vez por cuadro. Devuelve el informe nuevo cuando toca, o null.
  tick(now = performance.now()) {
    if (this.last === null) {
      this.last = now;
      return null;
    }
    const ms = now - this.last;
    this.last = now;
    // Una pausa larga (pestaña oculta, depurador) no es un cuadro real: no cuenta.
    if (ms > 1000) return null;
    this.times[this.index] = ms;
    this.index = (this.index + 1) % WINDOW;
    this.count = Math.min(WINDOW, this.count + 1);
    this.acc += ms / 1000;
    if (this.acc < REPORT_EVERY) return null;
    this.acc = 0;
    this.report = summarize(this.times, this.count, this.sorted);
    return this.report;
  }
}

// Exportada para probarla: fps promedio, ms promedio y 1 % low a partir de los tiempos de cuadro.
export function summarize(times, count, scratch = new Float32Array(count)) {
  if (!count) return { fps: 0, ms: 0, low1: 0 };
  let sum = 0;
  for (let i = 0; i < count; i++) {
    sum += times[i];
    scratch[i] = times[i];
  }
  const avg = sum / count;
  const view = scratch.subarray(0, count).sort();
  // Promedio del 1 % más lento (al menos 1 cuadro).
  const k = Math.max(1, Math.floor(count * 0.01));
  let worst = 0;
  for (let i = count - k; i < count; i++) worst += view[i];
  worst /= k;
  return { fps: Math.round(1000 / avg), ms: Math.round(avg * 10) / 10, low1: Math.round(1000 / worst) };
}
