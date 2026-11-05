// Datos de la campaña: mapas, niveles y perfil de los bots según la dificultad.
// Sin Three.js ni DOM: se prueban en tests/campaign.test.js.

// Un mapa por tramo de rango. `ranks`: rangos (config/ranks.js) para los que es el mapa recomendado.
export const CAMPAIGN_MAPS = [
  {
    id: 'bodega',
    name: 'Bodega',
    world: 'warehouse',
    ranks: ['bronce', 'plata'],
    tier: 0,
    color: '#c8814f',
    desc: 'Almacén con estanterías altas, montacargas y una pasarela. Bots de tamaño real, lentos y previsibles: ideal para asentar fundamentos.',
    levelNames: ['Turno de noche', 'Pasillos', 'Montacargas', 'Cierre del almacén'],
  },
  {
    id: 'ciudad',
    name: 'Ciudad',
    world: 'city',
    ranks: ['oro', 'diamante'],
    tier: 1,
    color: '#f2c14e',
    desc: 'Calle con coches cruzados, balcones y callejones. Bots más pequeños y rápidos que se asoman desde las alturas y los flancos.',
    levelNames: ['Patrulla', 'Balcones', 'Callejones', 'Toque de queda'],
  },
  {
    id: 'arena',
    name: 'Arena',
    world: 'arena',
    ranks: ['elite'],
    tier: 2,
    color: '#ff4d6d',
    desc: 'Arena competitiva simétrica con torre central y plataformas. Bots pequeños, muy rápidos e impredecibles: amagan, saltan y castigan cada error.',
    levelNames: ['Calentamiento', 'Dominio alto', 'Flancos', 'Final de la arena'],
  },
];

export const LEVELS_PER_MAP = 4;

/*
  Plantillas de nivel (iguales en estructura para cada mapa; la dificultad sube con el mapa y el nivel).
  encounters: se juegan en orden; el siguiente empieza cuando no queda nadie del anterior.
    type: 'flick' (aparece en terreno abierto) | 'strafe' (duelo en movimiento) | 'peek' (desde cobertura)
          | 'mixed' (cualquiera de los tres)
    count: bots del encuentro · concurrent: máximo a la vez · areas: zonas de cobertura para los peeks
*/
export const LEVEL_TEMPLATES = [
  {
    key: 'recon',
    kind: 'Reconocimiento',
    desc: 'Enemigos que aparecen en terreno abierto y duelos en movimiento. Calienta la puntería antes de lo difícil.',
    time: 75,
    encounters: [
      { type: 'flick', count: 6, concurrent: 1 },
      { type: 'strafe', count: 3, concurrent: 1 },
    ],
  },
  {
    key: 'peeks',
    kind: 'Asomadas',
    desc: 'Se asoman desde coberturas y posiciones altas, a veces amagando. Reacciona antes de que te disparen.',
    time: 80,
    encounters: [
      { type: 'peek', count: 6, concurrent: 1, areas: ['front', 'high'] },
      { type: 'flick', count: 4, concurrent: 2 },
    ],
  },
  {
    key: 'cross',
    kind: 'Fuego cruzado',
    desc: 'Varios a la vez y desde los flancos. Escucha de dónde vienen y elige bien a quién disparar primero.',
    time: 90,
    encounters: [
      { type: 'peek', count: 4, concurrent: 2, areas: ['front', 'flank'] },
      { type: 'strafe', count: 3, concurrent: 2 },
      { type: 'peek', count: 4, concurrent: 2, areas: ['high', 'flank', 'back'] },
    ],
  },
  {
    key: 'final',
    kind: 'Asalto final',
    desc: 'Todo a la vez: peeks, duelos y apariciones por cualquier lado, incluso por detrás. Sobrevive y no dejes escapar a nadie.',
    time: 100,
    encounters: [{ type: 'mixed', count: 14, concurrent: 3, areas: ['front', 'high', 'flank', 'back'] }],
  },
];

// Dificultad continua de toda la campaña: 0 (Bodega 1) … 11 (Arena 4).
export function difficultyOf(map, index) {
  return map.tier * LEVELS_PER_MAP + index;
}

// Metas de estrellas (puntuación 0-100 del nivel). La 1ª desbloquea el siguiente nivel.
// Suben nivel a nivel dentro de un mapa. Al pasar a un mapa nuevo la meta baja (Bodega 4 = 57,
// Ciudad 1 = 48) a propósito: los bots ya son más difíciles, y exigir además más nota sería un salto
// doble. Entre mapas, la meta inicial sí sube (45 → 48 → 51).
export function goalsFor(map, index) {
  const base = 45 + 4 * index + 3 * map.tier;
  return [base, base + 15, Math.min(97, base + 27)];
}

export const ALL_LEVELS = CAMPAIGN_MAPS.flatMap((map) =>
  LEVEL_TEMPLATES.map((t, index) => ({
    id: `${map.id}-${index + 1}`,
    mapId: map.id,
    index,
    number: index + 1,
    name: map.levelNames[index],
    kind: t.kind,
    desc: t.desc,
    time: t.time,
    encounters: t.encounters,
    total: t.encounters.reduce((s, e) => s + e.count, 0),
    difficulty: difficultyOf(map, index),
    goals: goalsFor(map, index),
  })),
);

export function getMap(id) {
  return CAMPAIGN_MAPS.find((m) => m.id === id) ?? null;
}

export function getLevel(id) {
  return ALL_LEVELS.find((l) => l.id === id) ?? null;
}

export function levelsOf(mapId) {
  return ALL_LEVELS.filter((l) => l.mapId === mapId);
}

const lin = (start, perLevel, limit, d) => {
  const v = start + perLevel * d;
  return perLevel >= 0 ? Math.min(limit, v) : Math.max(limit, v);
};
const r2 = (v) => Math.round(v * 100) / 100;

// Perfil de los bots para una dificultad d (0-11). "Impredecible" = cambios de dirección más
// frecuentes, más amagos, más asomadas abiertas, más agacharse y saltar.
export function botProfile(d) {
  return {
    scale: r2(lin(1, -0.025, 0.72, d)),
    flickLifetime: r2(lin(2.6, -0.12, 1.25, d)),
    strafeLifetime: r2(lin(7, -0.2, 4.5, d)),
    peekLifetime: 10,
    peekSpeed: r2(lin(4, 0.35, 8, d)),
    hold: [r2(lin(1, -0.05, 0.35, d)), r2(lin(1.4, -0.06, 0.6, d))],
    wideChance: r2(lin(0.3, 0.03, 0.65, d)),
    jiggleChance: r2(lin(0.15, 0.04, 0.6, d)),
    strafe: {
      range: r2(lin(1.8, 0.12, 3.2, d)),
      speed: [r2(lin(1.8, 0.3, 5.2, d)), r2(lin(3.2, 0.4, 7.6, d))],
      change: [r2(lin(0.8, -0.05, 0.2, d)), r2(lin(1.6, -0.09, 0.5, d))],
      crouchChance: r2(lin(0.05, 0.025, 0.35, d)),
      jumpChance: r2(lin(0, 0.02, 0.22, d)),
      stopChance: r2(lin(0.25, -0.012, 0.08, d)),
    },
    // Daño por segundo de un bot ≈ accuracy × damage / interval: de ~3.6 (Bodega 1) a ~14 (Arena 4).
    // Con 3 a la vez en el último nivel ya es muy exigente; más que eso no dejaría asomarse a nadie.
    shooter: {
      reaction: r2(lin(0.75, -0.04, 0.3, d)),
      interval: r2(lin(0.45, -0.012, 0.32, d)),
      accuracy: r2(lin(0.2, 0.018, 0.4, d)),
      damage: Math.round(lin(8, 0.28, 11, d)),
    },
  };
}
