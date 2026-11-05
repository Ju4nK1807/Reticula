import { registerWorld } from '../../scenes/registry.js';
import { registerMode, requiresRank } from '../registry.js';
import { WarehouseMap } from './maps/WarehouseMap.js';
import { CityMap } from './maps/CityMap.js';
import { ArenaMap } from './maps/ArenaMap.js';
import { Campaign, MODE_ID } from './Campaign.js';

// Campaña: un mapa por rango (Bodega, Ciudad, Arena) con 4 niveles cada uno.
registerWorld('warehouse', () => new WarehouseMap());
registerWorld('city', () => new CityMap());
registerWorld('arena', () => new ArenaMap());

registerMode({
  id: MODE_ID,
  title: 'Campaña',
  desc: 'Bodega, Ciudad y Arena: un mapa por rango, 12 niveles con estrellas y bots cada vez más difíciles',
  order: 30,
  locked: requiresRank,
  create: (game) => new Campaign(game),
});
