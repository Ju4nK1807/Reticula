import * as THREE from 'three';

/*
  Texturas dibujadas en un canvas (sin descargar nada): tablero perforado, pantallas holográficas,
  franjas de seguridad, el abanico del láser y siluetas de blanco. Se generan una vez y se comparten.
  Sin navegador (pruebas en Node) devuelven null y el mapa usa colores planos.
*/

const hasCanvas = () => typeof document !== 'undefined' && typeof document.createElement === 'function';
const cache = new Map();

function make(key, w, h, draw, { repeat = null, srgb = true } = {}) {
  if (!hasCanvas()) return null;
  if (cache.has(key)) return cache.get(key);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  draw(ctx, w, h);
  const tex = new THREE.CanvasTexture(canvas);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  if (repeat) {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(...repeat);
  }
  tex.anisotropy = 4;
  cache.set(key, tex);
  return tex;
}

/** Tablero perforado de taller con herramientas colgadas (siluetas). */
export function pegboardTexture() {
  return make('pegboard', 512, 256, (ctx, w, h) => {
    ctx.fillStyle = '#2f3a3f';
    ctx.fillRect(0, 0, w, h);
    // Agujeros en cuadrícula.
    ctx.fillStyle = '#11171a';
    for (let y = 8; y < h; y += 16) for (let x = 8; x < w; x += 16) {
      ctx.beginPath();
      ctx.arc(x, y, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
    // Herramientas: llaves, destornilladores, alicates (formas simples con sombra).
    const tool = (x, y, draw) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.shadowColor = 'rgba(0,0,0,0.6)';
      ctx.shadowBlur = 6;
      ctx.shadowOffsetX = 3;
      ctx.shadowOffsetY = 4;
      draw();
      ctx.restore();
    };
    const wrench = (len) => {
      ctx.fillStyle = '#8f9aa3';
      ctx.fillRect(-4, 0, 8, len);
      ctx.beginPath();
      ctx.arc(0, 0, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#2f3a3f';
      ctx.fillRect(-4, -12, 8, 10);
    };
    const driver = (color) => {
      ctx.fillStyle = color;
      ctx.fillRect(-6, 0, 12, 34);
      ctx.fillStyle = '#9aa4ad';
      ctx.fillRect(-2, 34, 4, 46);
    };
    const pliers = () => {
      ctx.strokeStyle = '#c4532f';
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(-10, 0);
      ctx.lineTo(-3, 52);
      ctx.moveTo(10, 0);
      ctx.lineTo(3, 52);
      ctx.stroke();
      ctx.fillStyle = '#8f9aa3';
      ctx.fillRect(-5, 50, 10, 26);
    };
    for (let i = 0; i < 4; i++) tool(40 + i * 26, 40, () => wrench(70 + i * 12));
    tool(180, 36, () => driver('#d9a21b'));
    tool(206, 36, () => driver('#1f8f6a'));
    tool(232, 36, () => driver('#c4532f'));
    tool(290, 30, pliers);
    tool(330, 30, pliers);
    // Silueta de un arma colgada.
    tool(380, 70, () => {
      ctx.fillStyle = '#1a1f23';
      ctx.fillRect(0, 0, 110, 14);
      ctx.fillRect(20, 14, 14, 26);
      ctx.fillRect(70, 14, 10, 18);
      ctx.fillRect(-24, 2, 30, 18);
    });
    // Etiquetas de cinta.
    ctx.fillStyle = '#d8d2b8';
    for (const x of [30, 176, 286, 380]) ctx.fillRect(x, 200, 60, 12);
  });
}

/**
 * Pantalla holográfica (HUD verde azulado). kind: 'scan' (arma en cuadrícula), 'stats' (barras y
 * gráfica) o 'map' (plano de blancos).
 */
export function holoTexture(kind = 'scan') {
  return make(`holo-${kind}`, 512, 320, (ctx, w, h) => {
    const C = '#36f5c4';
    ctx.fillStyle = 'rgba(6, 40, 34, 0.55)';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(54,245,196,0.85)';
    ctx.lineWidth = 3;
    ctx.strokeRect(6, 6, w - 12, h - 12);
    // Esquinas marcadas.
    ctx.lineWidth = 6;
    for (const [x, y, dx, dy] of [[6, 6, 1, 1], [w - 6, 6, -1, 1], [6, h - 6, 1, -1], [w - 6, h - 6, -1, -1]]) {
      ctx.beginPath();
      ctx.moveTo(x + dx * 30, y);
      ctx.lineTo(x, y);
      ctx.lineTo(x, y + dy * 30);
      ctx.stroke();
    }
    ctx.font = '600 22px monospace';
    ctx.fillStyle = C;
    // Cuadrícula tenue.
    ctx.strokeStyle = 'rgba(54,245,196,0.12)';
    ctx.lineWidth = 1;
    for (let x = 20; x < w; x += 24) {
      ctx.beginPath();
      ctx.moveTo(x, 20);
      ctx.lineTo(x, h - 20);
      ctx.stroke();
    }
    for (let y = 20; y < h; y += 24) {
      ctx.beginPath();
      ctx.moveTo(20, y);
      ctx.lineTo(w - 20, y);
      ctx.stroke();
    }
    ctx.strokeStyle = C;
    ctx.fillStyle = C;
    if (kind === 'scan') {
      ctx.fillText('ANÁLISIS · RIFLE', 26, 44);
      // Contorno de un rifle.
      ctx.lineWidth = 3;
      ctx.beginPath();
      const pts = [[60, 170], [150, 160], [170, 150], [330, 150], [340, 140], [440, 140], [440, 156], [350, 160], [345, 178], [300, 182], [290, 215], [262, 215], [258, 186], [190, 186], [175, 210], [140, 210], [150, 186], [60, 196]];
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      ctx.stroke();
      ctx.globalAlpha = 0.18;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.font = '500 16px monospace';
      for (const [x, y, t] of [[60, 250, 'CALIBRE 5.56'], [240, 250, 'CADENCIA 11/s'], [60, 280, 'DAÑO 34'], [240, 280, 'ESTADO ÓPTIMO']]) ctx.fillText(t, x, y);
    } else if (kind === 'stats') {
      ctx.fillText('PRECISIÓN', 26, 44);
      ctx.font = '700 54px monospace';
      ctx.fillText('87%', 26, 110);
      ctx.lineWidth = 3;
      ctx.beginPath();
      const ys = [230, 214, 222, 190, 200, 170, 176, 150, 160, 128, 136, 112];
      ys.forEach((y, i) => (i ? ctx.lineTo(40 + i * 40, y) : ctx.moveTo(40, y)));
      ctx.stroke();
      for (let i = 0; i < 10; i++) {
        const bh = 20 + ((i * 37) % 60);
        ctx.globalAlpha = 0.5;
        ctx.fillRect(250 + i * 24, 110 - bh, 14, bh);
      }
      ctx.globalAlpha = 1;
      ctx.font = '500 16px monospace';
      ctx.fillText('REACCIÓN 212 ms', 26, 290);
      ctx.fillText('RACHA 14', 300, 290);
    } else {
      ctx.fillText('CAMPO DE TIRO · CARRIL 3', 26, 44);
      ctx.lineWidth = 3;
      for (let i = 0; i < 4; i++) {
        const x = 90 + i * 110;
        ctx.beginPath();
        ctx.arc(x, 160, 34, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x, 160, 16, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x, 160, 4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.font = '500 16px monospace';
      ctx.fillText('OBJETIVOS 4 · DISTANCIA 21 m', 26, 270);
    }
  });
}

/** Franjas de seguridad amarillas y negras (repetibles a lo largo). */
export function hazardTexture() {
  return make(
    'hazard',
    128,
    32,
    (ctx, w, h) => {
      ctx.fillStyle = '#d9a21b';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#16181a';
      for (let x = -h; x < w + h; x += 32) {
        ctx.beginPath();
        ctx.moveTo(x, h);
        ctx.lineTo(x + 16, h);
        ctx.lineTo(x + 16 + h, 0);
        ctx.lineTo(x + h, 0);
        ctx.closePath();
        ctx.fill();
      }
    },
    { repeat: [1, 1] },
  );
}

/** Degradado del abanico del láser: intenso en el origen y desvanecido hacia el borde. */
export function laserTexture() {
  return make('laser', 64, 256, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(120,255,210,0.95)');
    g.addColorStop(0.55, 'rgba(60,255,190,0.35)');
    g.addColorStop(1, 'rgba(40,255,180,0.05)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
}

/** Silueta de blanco de tiro con anillos (para el fondo del campo). */
export function silhouetteTexture() {
  return make('silhouette', 256, 512, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(30, 255, 200, 0.22)';
    ctx.strokeStyle = '#3dffc9';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(w / 2, 90, 52, 0, Math.PI * 2); // cabeza
    ctx.moveTo(40, h - 20);
    ctx.quadraticCurveTo(30, 190, w / 2, 170);
    ctx.quadraticCurveTo(w - 30, 190, w - 40, h - 20);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.lineWidth = 5;
    for (const r of [30, 62, 94]) {
      ctx.beginPath();
      ctx.arc(w / 2, 330, r, 0, Math.PI * 2);
      ctx.stroke();
    }
  });
}

/** Resplandor radial (luces, halos): blanco al centro y transparente al borde. */
export function haloTexture() {
  return make('halo', 128, 128, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,255,255,0.45)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
}

/** Haz de luz de una lámpara (cono volumétrico falso): brillante arriba, se apaga hacia abajo y los bordes. */
export function beamTexture() {
  return make('beam', 128, 256, (ctx, w, h) => {
    const v = ctx.createLinearGradient(0, 0, 0, h);
    v.addColorStop(0, 'rgba(255,255,255,0.9)');
    v.addColorStop(0.35, 'rgba(255,255,255,0.35)');
    v.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, w, h);
    // Bordes laterales más tenues (el cono se ve como un volumen, no como una lámina).
    ctx.globalCompositeOperation = 'destination-in';
    const hz = ctx.createLinearGradient(0, 0, w, 0);
    hz.addColorStop(0, 'rgba(0,0,0,0.25)');
    hz.addColorStop(0.5, 'rgba(0,0,0,1)');
    hz.addColorStop(1, 'rgba(0,0,0,0.25)');
    ctx.fillStyle = hz;
    ctx.fillRect(0, 0, w, h);
  });
}

/** Letrero luminoso (texto en mayúsculas sobre panel oscuro, con marco). */
export function signTexture(text, color = '#36f5c4') {
  return make(`sign-${text}-${color}`, 1024, 160, (ctx, w, h) => {
    ctx.fillStyle = 'rgba(4, 10, 12, 0.92)';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = color;
    ctx.lineWidth = 6;
    ctx.strokeRect(8, 8, w - 16, h - 16);
    ctx.font = '700 84px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = color;
    ctx.shadowBlur = 18;
    ctx.fillStyle = color;
    ctx.fillText(text.toUpperCase().split('').join(' '), w / 2, h / 2 + 4);
    // Flechas laterales.
    ctx.shadowBlur = 0;
    for (const [x, d] of [[70, 1], [w - 70, -1]]) {
      ctx.beginPath();
      ctx.moveTo(x - 22 * d, h / 2 - 26);
      ctx.lineTo(x + 18 * d, h / 2);
      ctx.lineTo(x - 22 * d, h / 2 + 26);
      ctx.closePath();
      ctx.fill();
    }
  });
}
