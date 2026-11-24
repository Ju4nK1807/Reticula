const WINDOW = 240;
const REPORT_EVERY = 0.5;

export class PerfMeter {
  constructor() {
    this.times = new Float32Array(WINDOW);
    this.count = 0;
    this.index = 0;
    this.last = null;
    this.acc = 0;
    this.sorted = new Float32Array(WINDOW);
    this.report = null;
  }

  tick(now = performance.now()) {
    if (this.last === null) {
      this.last = now;
      return null;
    }
    const ms = now - this.last;
    this.last = now;
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

export function summarize(times, count, scratch = new Float32Array(count)) {
  if (!count) return { fps: 0, ms: 0, low1: 0 };
  let sum = 0;
  for (let i = 0; i < count; i++) {
    sum += times[i];
    scratch[i] = times[i];
  }
  const avg = sum / count;
  const view = scratch.subarray(0, count).sort();
  const k = Math.max(1, Math.floor(count * 0.01));
  let worst = 0;
  for (let i = count - k; i < count; i++) worst += view[i];
  worst /= k;
  return { fps: Math.round(1000 / avg), ms: Math.round(avg * 10) / 10, low1: Math.round(1000 / worst) };
}
