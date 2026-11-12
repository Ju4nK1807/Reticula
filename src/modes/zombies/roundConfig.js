/*
  Balance de las rondas del modo zombi: todo lo que hay que tocar para hacerlo más fácil o más difícil.
  `r` es el número de ronda (1, 2, 3…). Las fórmulas están en zombieData.waveConfig.

    cantidad = countBase + r × countPerRound + r² × countCurve       (redondeado, hasta countMax)
    vida     = hpBase × (1 + hpPerRound × (r − 1)) × hpLate^(r − hpLateFrom, si r > hpLateFrom)
    velocidad= speedBase + speedPerRound × (r − 1)                 (multiplica la del tipo; hasta speedMax)
    daño     = damageBase + damagePerRound × (r − 1)               (multiplica el del tipo; hasta damageMax)
    vivos    = aliveBase + alivePerRound × (r − 1)                 (a la vez; hasta aliveMax y el tope de
                                                                    la calidad gráfica, ALIVE_BY_DETAIL)

  La vida es la de un caminante; el corredor tiene ×0.7, el reptante ×0.6 y el bruto ×3 (ZOMBIE_TYPES).
  Las dificultades (zombieData.DIFFICULTIES) multiplican encima de esto.

  Ronda 1 con estos valores: 6 caminantes lentos (1.2 m/s) de 55 de vida, que mueren de 2 disparos de
  pistola al cuerpo (30) o de 1 a la cabeza (110), y pegan 27.
*/
export const ROUNDS = {
  // Cantidad de zombis de la ronda.
  countBase: 4,
  countPerRound: 1.6,
  countCurve: 0.05, // un poco más rápido en rondas altas (0 = lineal)
  countMax: 150,

  // Vida de un caminante.
  hpBase: 55,
  hpPerRound: 0.2, // +20 % de la vida base por ronda
  hpLate: 1.1, // desde hpLateFrom, además ×1.1 por ronda (para que las rondas altas sigan costando)
  hpLateFrom: 10,

  // Velocidad (multiplicador sobre la del tipo: caminante 1.6 m/s, corredor 4.1…).
  speedBase: 0.75,
  speedPerRound: 0.05,
  speedMax: 1.35,

  // Daño por golpe (multiplicador sobre el del tipo: caminante 45, bruto 80…).
  damageBase: 0.6,
  damagePerRound: 0.06,
  damageMax: 1.4,

  // Cuántos a la vez (y cada cuánto sale uno: s, al azar entre los dos valores).
  aliveBase: 6,
  alivePerRound: 2,
  aliveMax: 24,
  spawnGapStart: [1.8, 2.6],
  spawnGapPerRound: [-0.12, -0.15],
  spawnGapMin: [0.25, 0.45],

  // Mezcla de tipos.
  runnersFrom: 3, // ronda desde la que aparecen corredores
  runnerPerRound: 0.06, // proporción que suma cada ronda (hasta runnerMax)
  runnerMax: 0.4,
  runnerNightEvery: 6, // cada tantas rondas, noche de corredores (70 %)
  crawlersFrom: 4,
  crawlerPerRound: 0.04,
  crawlerMax: 0.2,
  brutesEvery: 3, // un bruto más cada tantas rondas desde que aparecen (dificultad: brutesFrom)

  // Puntos por terminar la ronda: clearBonus × r.
  clearBonus: 100,
};

// Pausas: antes de la primera ronda y entre rondas (con el cartel «Ronda X» y la armería abierta).
export const FIRST_COUNTDOWN = 6;
export const INTERMISSION = 12;

// Tope de zombis vivos a la vez según la calidad gráfica (rendimiento): los que faltan esperan a que
// mueran otros. Se aplica sobre `vivos`.
export const ALIVE_BY_DETAIL = { baja: 14, media: 20, alta: 24 };
