// Carga todos los modos: cada src/modes/<modo>/index.js se registra a sí mismo (registerMode).
// import.meta.glob lo resuelve Vite al compilar; agregar una carpeta basta para que aparezca.
import.meta.glob('./*/index.js', { eager: true });

export { getMode, listModes } from './registry.js';
