// Genera la mira como SVG a partir de la configuración { shape, color, size, thickness, gap, outline, opacity }.
export function crosshairSVG(c) {
  const t = Math.max(1, Math.round(c.thickness));
  const gap = Math.max(0, Math.round(c.gap));
  const len = Math.max(0, Math.round(c.size));
  const o = c.outline ? 1 : 0;
  const shape = c.shape;
  const circleR = gap + len / 2 + 2;
  const ext = Math.ceil(Math.max(gap + len, shape === 'circle' ? circleR + t : 0) + o + 2);
  const S = ext * 2;
  const cx = ext;

  const rects = [];
  if (['cross', 'cross-dot', 't'].includes(shape) && len > 0) {
    if (shape !== 't') rects.push([cx - t / 2, cx - gap - len, t, len]);
    rects.push([cx - t / 2, cx + gap, t, len]);
    rects.push([cx - gap - len, cx - t / 2, len, t]);
    rects.push([cx + gap, cx - t / 2, len, t]);
  }
  if (['dot', 'cross-dot', 'circle'].includes(shape)) {
    const d = Math.max(2, t);
    rects.push([cx - d / 2, cx - d / 2, d, d]);
  }

  const rect = ([x, y, w, h], fill, grow = 0) =>
    `<rect x="${x - grow}" y="${y - grow}" width="${w + grow * 2}" height="${h + grow * 2}" fill="${fill}"/>`;
  const circle = (stroke, width) =>
    `<circle cx="${cx}" cy="${cx}" r="${circleR}" fill="none" stroke="${stroke}" stroke-width="${width}"/>`;

  let body = '';
  if (o) body += `<g fill-opacity="0.85">${rects.map((r) => rect(r, '#000', o)).join('')}</g>`;
  if (shape === 'circle') {
    if (o) body += circle('rgba(0,0,0,0.85)', t + 2);
    body += circle(c.color, t);
  }
  body += `<g shape-rendering="crispEdges">${rects.map((r) => rect(r, c.color)).join('')}</g>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}" style="opacity:${c.opacity ?? 1}">${body}</svg>`;
}
