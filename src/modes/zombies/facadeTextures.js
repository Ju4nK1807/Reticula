import * as THREE from 'three';

/*
  Texturas dibujadas en canvas para las fachadas del Barrio en ruinas (no hay que descargar nada):
  - litWindow: ventana encendida (interior cálido, cortina a medio correr, marco y travesaño).
  - darkWindow: ventana a oscuras (interior negro azulado, marco, reflejo y a veces un vidrio roto).
  - grimeStrip: chorreones de mugre bajo cornisas y alféizares (alfa).
  Sin navegador (pruebas en Node) devuelven una textura vacía: el mapa se construye igual.
*/

function canvas(w, h, draw) {
  if (typeof document === 'undefined') return new THREE.Texture();
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function frame(g, w, h, color) {
  g.fillStyle = color;
  const t = Math.round(w * 0.08);
  g.fillRect(0, 0, w, t);
  g.fillRect(0, h - t, w, t);
  g.fillRect(0, 0, t, h);
  g.fillRect(w - t, 0, t, h);
  g.fillRect(w / 2 - t / 2, 0, t, h); // parteluz
  g.fillRect(0, h * 0.38, w, t * 0.8); // travesaño
}

export function litWindow() {
  return canvas(128, 192, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#5a2d10');
    grad.addColorStop(0.55, '#d9893a');
    grad.addColorStop(1, '#ffd08a');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    // Lámpara de techo (punto caliente) y una silueta de mueble al fondo.
    const lamp = g.createRadialGradient(w * 0.62, h * 0.18, 2, w * 0.62, h * 0.18, w * 0.5);
    lamp.addColorStop(0, 'rgba(255,240,200,0.9)');
    lamp.addColorStop(1, 'rgba(255,200,120,0)');
    g.fillStyle = lamp;
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(40,20,10,0.55)';
    g.fillRect(w * 0.55, h * 0.62, w * 0.4, h * 0.38);
    // Cortina a medio correr (con pliegues).
    for (let i = 0; i < 6; i++) {
      g.fillStyle = i % 2 ? 'rgba(90,30,20,0.85)' : 'rgba(120,45,28,0.85)';
      g.fillRect(i * 7, 0, 7, h);
    }
    frame(g, w, h, '#1c1712');
  });
}

export function darkWindow() {
  return canvas(128, 192, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, '#10161f');
    grad.addColorStop(1, '#05070a');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    // Reflejo en diagonal.
    g.fillStyle = 'rgba(150,170,200,0.10)';
    g.beginPath();
    g.moveTo(w * 0.15, h);
    g.lineTo(w * 0.45, h);
    g.lineTo(w * 0.95, 0);
    g.lineTo(w * 0.65, 0);
    g.closePath();
    g.fill();
    // Vidrio roto (un agujero negro con grietas).
    g.fillStyle = '#000';
    g.beginPath();
    g.moveTo(w * 0.62, h * 0.55);
    g.lineTo(w * 0.8, h * 0.5);
    g.lineTo(w * 0.86, h * 0.68);
    g.lineTo(w * 0.7, h * 0.78);
    g.lineTo(w * 0.58, h * 0.66);
    g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(180,190,210,0.35)';
    g.lineWidth = 1;
    for (const [x, y] of [[0.95, 0.42], [0.98, 0.85], [0.5, 0.95], [0.42, 0.55], [0.75, 0.3]]) {
      g.beginPath();
      g.moveTo(w * 0.72, h * 0.64);
      g.lineTo(w * x, h * y);
      g.stroke();
    }
    frame(g, w, h, '#2b2a28');
  });
}

export function grimeStrip() {
  const tex = canvas(256, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) {
      const x = Math.random() * w;
      const len = h * (0.2 + Math.random() * 0.8);
      const grad = g.createLinearGradient(0, 0, 0, len);
      grad.addColorStop(0, 'rgba(0,0,0,0.55)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grad;
      g.fillRect(x, 0, 1 + Math.random() * 4, len);
    }
  });
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

/**
 * Manchas para el suelo (alfa o color): splat (sangre con gotas), blob (charco o mancha de aceite de
 * borde suave e irregular), litter (papeles, hojas y colillas sobre transparente).
 */
export function decalTexture(kind) {
  if (kind === 'litter') {
    return canvas(256, 256, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      const colors = ['#b8b09a', '#8c7a5a', '#6e5a3a', '#4a3a26', '#a39b88', '#7a2f2a'];
      for (let i = 0; i < 46; i++) {
        g.save();
        g.translate(Math.random() * w, Math.random() * h);
        g.rotate(Math.random() * Math.PI);
        g.fillStyle = colors[i % colors.length];
        if (i % 3 === 0) {
          // Hoja seca: elipse con nervio.
          g.beginPath();
          g.ellipse(0, 0, 9 + Math.random() * 6, 4 + Math.random() * 3, 0, 0, Math.PI * 2);
          g.fill();
        } else g.fillRect(-8, -5, 10 + Math.random() * 14, 6 + Math.random() * 10); // papel
        g.restore();
      }
    });
  }
  const tex = canvas(256, 256, (g, w, h) => {
    g.fillStyle = '#000';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#fff';
    const blob = (x, y, r, n = 18) => {
      g.beginPath();
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * Math.PI * 2;
        const rr = r * (0.72 + Math.random() * 0.4);
        if (i === 0) g.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
        else g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      }
      g.closePath();
      g.fill();
    };
    if (kind === 'splat') {
      blob(w / 2, h / 2, w * 0.2);
      for (let i = 0; i < 8; i++) blob(w / 2 + (Math.random() - 0.5) * w * 0.34, h / 2 + (Math.random() - 0.5) * h * 0.34, w * (0.05 + Math.random() * 0.07));
      for (let i = 0; i < 28; i++) {
        const a = Math.random() * Math.PI * 2;
        const d = w * (0.22 + Math.random() * 0.24);
        blob(w / 2 + Math.cos(a) * d, h / 2 + Math.sin(a) * d, w * (0.008 + Math.random() * 0.02), 8);
      }
    } else {
      g.filter = 'blur(6px)';
      blob(w / 2, h / 2, w * 0.3, 24);
      for (let i = 0; i < 5; i++) blob(w / 2 + (Math.random() - 0.5) * w * 0.3, h / 2 + (Math.random() - 0.5) * h * 0.3, w * (0.1 + Math.random() * 0.08), 16);
    }
  });
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}
