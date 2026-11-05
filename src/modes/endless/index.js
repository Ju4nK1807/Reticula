import { registerWorld } from '../../scenes/registry.js';
import { BastionMap } from './BastionMap.js';

// Modo infinito: oleadas de bots cada vez más rápidos, numerosos y pequeños hasta caer.
registerWorld('bastion', () => new BastionMap());
