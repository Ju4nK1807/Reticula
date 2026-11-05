// Gráficas de línea en SVG, sin librerías. Siguen el método de visualización del proyecto:
// - Colores categóricos en orden fijo, validados sobre la superficie oscura (#0d1219) con
//   validate_palette.js: CVD ΔE ≥ 8.4, visión normal ΔE ≥ 19.8, contraste ≥ 3:1 (4 series).
// - Un solo eje Y, cuadrícula discreta, líneas de 2 px, marcador de 8 px con anillo de superficie.
// - Leyenda con trazo de línea si hay ≥ 2 series, y etiqueta directa del último valor (≤ 4 series).
// - Interacción: línea vertical que sigue al puntero y salta al dato más cercano; tooltip con todas las
//   series (valor primero). Lo mismo con teclado (flechas). Tabla de datos plegable para accesibilidad.
// - Los textos (nombres, etiquetas) se insertan con textContent, nunca con innerHTML.
import { shortDate } from '../utils/format.js';

export const SERIES_COLORS = ['#3987e5', '#d95926', '#199e70', '#c98500'];

const NS = 'http://www.w3.org/2000/svg';
const PAD = { left: 34, right: 64, top: 12, bottom: 24 };

function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

function div(cls, text = null) {
  const el = document.createElement('div');
  if (cls) el.className = cls;
  if (text !== null) el.textContent = text;
  return el;
}

/*
  lineChart({
    label: título accesible,
    series: [{ id, label, points: [{ t: ms, v: número }] }],   (el color sigue el orden de la serie)
    yMax = 100, yTicks = [0, 25, 50, 75, 100], height = 200,
    format = (v) => texto del valor, empty = texto si no hay datos,
  }) → elemento DOM
*/
export function lineChart({ label, series, yMax = 100, yTicks = [0, 25, 50, 75, 100], height = 200, format = (v) => String(v), empty = 'Aún no hay datos.' }) {
  const root = div('chart');
  const visible = series.filter((s) => s.points.length);
  if (!visible.length) {
    root.append(div('chart-empty', empty));
    return root;
  }
  const colorOf = (s) => SERIES_COLORS[series.indexOf(s) % SERIES_COLORS.length];

  // Leyenda (solo con 2 o más series): trazo de línea + nombre en tinta de texto.
  if (series.length >= 2) {
    const legend = div('chart-legend');
    for (const s of series) {
      const item = div('chart-legend-item');
      const key = document.createElement('i');
      key.style.background = colorOf(s);
      const name = document.createElement('span');
      name.textContent = s.label;
      item.append(key, name);
      legend.append(item);
    }
    root.append(legend);
  }

  const H = height;
  const times = [...new Set(visible.flatMap((s) => s.points.map((p) => p.t)))].sort((a, b) => a - b);
  const tip = div('chart-tip');
  tip.hidden = true;
  const frame = div('chart-frame');
  frame.tabIndex = 0;
  frame.setAttribute('aria-label', `${label}. Usa las flechas para recorrer los datos.`);
  frame.style.height = `${H}px`;
  root.append(frame);

  let index = times.length - 1;
  let show = () => {};
  let hide = () => {};

  // Se dibuja al ancho real del contenedor (y se redibuja si cambia): texto de 11 px y líneas de 2 px
  // exactos a cualquier tamaño, en vez de escalar un viewBox fijo.
  const draw = (W) => {
    const plotW = Math.max(40, W - PAD.left - PAD.right);
    const plotH = H - PAD.top - PAD.bottom;
    const t0 = times[0];
    const t1 = times.at(-1);
    const x = (t) => PAD.left + (t1 === t0 ? plotW / 2 : ((t - t0) / (t1 - t0)) * plotW);
    const y = (v) => PAD.top + plotH - (Math.max(0, Math.min(yMax, v)) / yMax) * plotH;
    const svg = svgEl('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, class: 'chart-svg', role: 'img', 'aria-label': label });

    // Cuadrícula y eje Y (recesivos).
    for (const tick of yTicks) {
      svg.append(svgEl('line', { x1: PAD.left, x2: PAD.left + plotW, y1: y(tick), y2: y(tick), class: tick === 0 ? 'chart-axis' : 'chart-grid' }));
      const t = svgEl('text', { x: PAD.left - 6, y: y(tick) + 4, 'text-anchor': 'end', class: 'chart-tick' });
      t.textContent = format(tick);
      svg.append(t);
    }
    // Eje X: primera y última fecha.
    const dateLabel = (t, anchor, xPos) => {
      const el = svgEl('text', { x: xPos, y: H - 6, 'text-anchor': anchor, class: 'chart-tick' });
      el.textContent = shortDate(new Date(t).toISOString());
      svg.append(el);
    };
    dateLabel(t0, times.length > 1 ? 'start' : 'middle', x(t0));
    if (times.length > 1) dateLabel(t1, 'end', x(t1));

    // Series: línea de 2 px, marcador del último punto y etiqueta directa (≤ 4 series).
    const direct = visible.length <= 4;
    const labelYs = [];
    for (const s of visible) {
      const color = colorOf(s);
      const pts = [...s.points].sort((a, b) => a.t - b.t);
      if (pts.length > 1) {
        const d = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
        svg.append(svgEl('path', { d, class: 'chart-line', stroke: color }));
      }
      const last = pts.at(-1);
      svg.append(svgEl('circle', { cx: x(last.t), cy: y(last.v), r: 4, fill: color, class: 'chart-dot' }));
      if (direct) {
        // Evita que dos etiquetas se monten (separación mínima de 12 px).
        let ly = y(last.v) + 4;
        for (const other of labelYs) if (Math.abs(other - ly) < 12) ly = other + (ly >= other ? 12 : -12);
        labelYs.push(ly);
        const t = svgEl('text', { x: x(last.t) + 8, y: ly, class: 'chart-direct' });
        t.textContent = format(last.v);
        svg.append(t);
      }
    }

    // Capa de interacción: línea vertical + tooltip con todas las series en esa fecha.
    const cross = svgEl('line', { y1: PAD.top, y2: PAD.top + plotH, class: 'chart-cross', visibility: 'hidden' });
    svg.append(cross);
    const hit = svgEl('rect', { x: PAD.left - 8, y: 0, width: plotW + 16, height: H, fill: 'transparent' });
    svg.append(hit);

    show = (i) => {
      index = Math.max(0, Math.min(times.length - 1, i));
      const t = times[index];
      const cx = x(t);
      cross.setAttribute('x1', cx);
      cross.setAttribute('x2', cx);
      cross.setAttribute('visibility', 'visible');
      tip.replaceChildren(div('chart-tip-date', shortDate(new Date(t).toISOString())));
      for (const s of visible) {
        // Valor de cada serie en esa fecha, o el último anterior (la serie "sigue" ahí).
        const prev = s.points.filter((p) => p.t <= t).sort((a, b) => b.t - a.t)[0];
        if (!prev) continue;
        const row = div('chart-tip-row');
        const key = document.createElement('i');
        key.style.background = colorOf(s);
        const v = document.createElement('strong');
        v.textContent = format(prev.v);
        const name = document.createElement('span');
        name.textContent = prev.t === t ? s.label : `${s.label} (anterior)`;
        row.append(key, v, name);
        tip.append(row);
      }
      tip.hidden = false;
      tip.style.left = `${cx}px`;
      tip.classList.toggle('flip', cx > W * 0.6);
    };
    hide = () => {
      cross.setAttribute('visibility', 'hidden');
      tip.hidden = true;
    };
    hit.addEventListener('pointermove', (e) => {
      const px = e.clientX - svg.getBoundingClientRect().left;
      let best = 0;
      for (let i = 1; i < times.length; i++) if (Math.abs(x(times[i]) - px) < Math.abs(x(times[best]) - px)) best = i;
      show(best);
    });
    hit.addEventListener('pointerleave', () => hide());
    frame.replaceChildren(svg, tip);
  };

  let lastW = 0;
  const observer = new ResizeObserver(([entry]) => {
    const W = Math.round(entry.contentRect.width);
    if (W > 0 && W !== lastW) {
      lastW = W;
      draw(W);
    }
  });
  observer.observe(frame);
  frame.addEventListener('focus', () => show(index));
  frame.addEventListener('blur', () => hide());
  frame.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      show(index + (e.key === 'ArrowRight' ? 1 : -1));
    }
  });

  // Tabla de datos (accesible, sin depender del color ni del puntero).
  const details = document.createElement('details');
  details.className = 'chart-table';
  const summary = document.createElement('summary');
  summary.textContent = 'Ver datos';
  const table = document.createElement('table');
  const head = document.createElement('tr');
  for (const h of ['Fecha', ...visible.map((s) => s.label)]) {
    const th = document.createElement('th');
    th.textContent = h;
    head.append(th);
  }
  table.append(head);
  for (const t of [...times].reverse()) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.textContent = shortDate(new Date(t).toISOString());
    tr.append(td);
    for (const s of visible) {
      const cell = document.createElement('td');
      const p = s.points.find((q) => q.t === t);
      cell.textContent = p ? format(p.v) : '—';
      tr.append(cell);
    }
    table.append(tr);
  }
  details.append(summary, table);
  root.append(details);
  return root;
}
