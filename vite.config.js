import { defineConfig } from 'vite';

export default defineConfig({
  // Rutas relativas: la versión compilada funciona en cualquier subcarpeta (p. ej. GitHub Pages en
  // https://<usuario>.github.io/Reticula/) y abierta desde un servidor local.
  base: './',
  build: {
    // Three.js (con PBR, sombras y entorno) ocupa ~600 kB minificado; no es un problema para un juego.
    // El postproceso de calidad alta va en un archivo aparte que se carga solo si se usa.
    chunkSizeWarningLimit: 900,
  },
});
