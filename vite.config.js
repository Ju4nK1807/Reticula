import { defineConfig } from 'vite';

export default defineConfig({
  // Rutas relativas: la versión compilada funciona en cualquier subcarpeta (p. ej. GitHub Pages en
  // https://<usuario>.github.io/Reticula/) y abierta desde un servidor local.
  base: './',
  build: {
    // Three.js ocupa ~550 kB minificado; no es un problema para un juego.
    chunkSizeWarningLimit: 800,
  },
});
