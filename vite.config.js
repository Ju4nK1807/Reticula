import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    // Three.js ocupa ~550 kB minificado; no es un problema para un juego.
    chunkSizeWarningLimit: 800,
  },
});
