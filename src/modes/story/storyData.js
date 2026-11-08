/*
  Historia «ECO» — campaña con trama, inspirada en las campañas de la Guerra Fría de los shooters
  clásicos (historia y personajes propios). Lógica pura, sin Three.js ni DOM: ver tests/story.test.js.

  Estructura de cada capítulo:
    id, number, title, place, date, world (mapa registrado), kind:
      'targets'  · dianas (campo de tiro)        → targets: cuántas
      'mission'  · encuentros con soldados        → encounters (como la campaña: flick | strafe | peek | mixed)
      'numbers'  · secuencias de números (cúpula) → rounds: [[7, 3, 9, 1, 4], …]
    difficulty: 0-11 (perfil de los bots, campaign/campaignData.botProfile)
    loadout: armas disponibles (la primera sale en la mano) · grenades: granadas de fragmentación
    objective: texto del objetivo en pantalla
    intro / outro: escenas (diálogos entre misiones)
    radio: diálogos durante la misión { start, encounters: { índice: [...] }, end }
    setup: ajustes del mapa (openDoors: abrir las puertas del barrio; spawn: [x, z] del jugador)

  Diálogos: { who, text }. who: voz · vera · reyes · ibarra · lang · numeros · narrador.
  Las líneas de `numeros` las lee una voz sintética (como las estaciones de números).
*/

export const SPEAKERS = {
  voz: { name: 'La Voz', color: '#ff5a4a' },
  vera: { name: 'Vera', color: '#36d6ff' },
  reyes: { name: 'Reyes', color: '#7ee787' },
  ibarra: { name: 'Coronel Ibarra', color: '#ffb020' },
  lang: { name: 'Dr. Lang', color: '#c86bff' },
  numeros: { name: 'Transmisión', color: '#ff3b2f' },
  narrador: { name: '', color: '#9aa4b2' },
};

const L = (who, text) => ({ who, text });

export const PROLOGUE = [
  L('narrador', 'Ubicación desconocida. 6 de junio de 1983.'),
  L('voz', 'Despierte, capitán. Despierte.'),
  L('vera', '¿Dónde… dónde estoy?'),
  L('voz', 'En un lugar donde las preguntas las hago yo.'),
  L('numeros', '7 · 3 · 9'),
  L('voz', '¿Qué significan los números, Vera?'),
  L('vera', 'No lo sé. No sé de qué me habla.'),
  L('voz', 'Lo sabe. Está enterrado en su cabeza, debajo de cada disparo que dio. Vamos a desenterrarlo.'),
  L('voz', 'Empiece por el principio. Base Cóndor. La primera vez que la vio a ella.'),
];

export const CHAPTERS = [
  {
    id: 'escuela',
    number: 1,
    title: 'Escuela de tiro',
    place: 'Base Cóndor, cordillera norte',
    date: '14 de marzo de 1979',
    world: 'range',
    kind: 'targets',
    targets: 24,
    loadout: ['pistol', 'rifle'],
    objective: 'Destruye las 24 dianas',
    intro: [
      L('narrador', 'Base Cóndor, cordillera norte. 14 de marzo de 1979.'),
      L('vera', 'Yo era cabo. Tiraba mejor que nadie en el regimiento… menos Reyes.'),
      L('reyes', '¡Halcón! Si vuelves a fallar la tercera diana, las cervezas las pagas tú.'),
      L('vera', 'Ese día había alguien mirando desde la torre de control.'),
      L('ibarra', 'Veinticuatro blancos, cabo. Sin errores. Quiero ver si es tan bueno como dicen.'),
    ],
    radio: {
      start: [L('reyes', 'Dale, Halcón. Que la coronel te mire no cambia nada.')],
      kills: { 12: [L('ibarra', 'Buen ritmo. No se distraiga.')], 20: [L('reyes', 'Cuatro más y nos vamos a comer.')] },
      end: [L('reyes', 'Nada mal, Halcón. Presumido.')],
    },
    outro: [
      L('ibarra', 'Cabo Vera. Sargento Reyes. A partir de hoy no pertenecen al regimiento.'),
      L('ibarra', 'Pertenecen a la Unidad Retícula. No existimos, no salimos en ningún papel y no hacemos preguntas.'),
      L('reyes', 'Con todo respeto, coronel… ¿y si las hacemos?'),
      L('ibarra', 'Entonces dejan de existir de verdad.'),
      L('voz', 'Elena Ibarra. Su coronel. Su salvadora. ¿Nunca le pareció raro que lo eligiera justo a usted?'),
    ],
  },
  {
    id: 'patio',
    number: 2,
    title: 'Patio Cero',
    place: 'Base Cóndor, campo de maniobras',
    date: '2 de agosto de 1981',
    world: 'yard',
    kind: 'mission',
    difficulty: 1,
    loadout: ['rifle', 'pistol'],
    grenades: 0,
    objective: 'Defiende Patio Cero de los saboteadores',
    encounters: [
      { type: 'flick', count: 5, concurrent: 1 },
      { type: 'peek', count: 6, concurrent: 2, areas: ['front', 'high'] },
      { type: 'mixed', count: 8, concurrent: 2, areas: ['front', 'high', 'flank'] },
    ],
    intro: [
      L('narrador', 'Base Cóndor, campo de maniobras «Patio Cero». 2 de agosto de 1981.'),
      L('vera', 'Dos años de entrenamiento. Ejercicios con munición real, todas las semanas.'),
      L('vera', 'Aquella noche la radio del arsenal empezó a sonar sola.'),
      L('numeros', '7 · 3 · 9 · 1 · 4'),
      L('reyes', '¿Escuchaste eso? Una voz de mujer leyendo números. En la frecuencia del batallón.'),
      L('ibarra', 'Interferencia, sargento. Concéntrese. Hay intrusos en el patio y no son parte del ejercicio.'),
    ],
    radio: {
      start: [L('ibarra', 'Hostiles en el patio. Fuego a discreción.')],
      encounters: {
        1: [L('reyes', 'Se cubren detrás de los muros. ¡Espera a que asomen!')],
        2: [L('reyes', '¡Por el flanco! Nos están rodeando.')],
      },
      end: [L('ibarra', 'Patio despejado. Buen trabajo, Retícula.')],
    },
    outro: [
      L('reyes', 'Halcón, revisé a uno de los saboteadores. Llevaba una radio sintonizada en la misma frecuencia.'),
      L('reyes', 'Y una etiqueta en la radio: «Lang · Faro».'),
      L('vera', '¿Lang?'),
      L('ibarra', 'Viktor Lang. Un científico que trabajaba para nosotros. Desertó hace un mes y se llevó algo que nos pertenece.'),
      L('ibarra', 'Lo van a encontrar. Y lo van a traer.'),
      L('voz', 'Lang no desertó, Vera. Huyó. Hay una diferencia, y usted va a entenderla.'),
    ],
  },
  {
    id: 'bodega',
    number: 3,
    title: 'Bodega 17',
    place: 'Puerto Ceniza, muelle norte',
    date: '19 de enero de 1982',
    world: 'warehouse',
    kind: 'mission',
    difficulty: 3,
    loadout: ['smg', 'shotgun', 'pistol'],
    grenades: 2,
    objective: 'Limpia la bodega 17 y recupera la cinta',
    encounters: [
      { type: 'strafe', count: 4, concurrent: 1 },
      { type: 'peek', count: 6, concurrent: 2, areas: ['front', 'high'] },
      { type: 'mixed', count: 10, concurrent: 3, areas: ['front', 'high', 'flank'] },
    ],
    intro: [
      L('narrador', 'Puerto Ceniza, muelle norte, almacén 17. 19 de enero de 1982.'),
      L('vera', 'Inteligencia ubicó a la gente de Lang en el puerto. Contrabando, según el informe.'),
      L('ibarra', 'En la bodega 17 hay una cinta magnética. Carrete metálico, etiqueta roja. La quiero intacta.'),
      L('reyes', '¿Y la gente de la bodega?'),
      L('ibarra', 'No es necesaria intacta.'),
    ],
    radio: {
      start: [L('reyes', 'Entramos por el portón sur. Montacargas a la derecha, pasarela arriba.')],
      encounters: {
        1: [L('reyes', '¡Arriba, en la pasarela!')],
        2: [L('ibarra', 'La cinta está en la oficina del fondo. Que no la destruyan.'), L('reyes', 'Son demasiados para ser contrabandistas, Halcón…')],
      },
      end: [L('reyes', 'La tengo. Carrete rojo. Está tibio… alguien la estaba escuchando.')],
    },
    outro: [
      L('narrador', 'Esa noche, en el camión.'),
      L('reyes', 'Puse la cinta en el reproductor. No es música.'),
      L('numeros', '7 · 3 · 9 · 1 · 4 · 0'),
      L('reyes', 'Después de los números dice nombres. El tercero es el tuyo, Andrés.'),
      L('vera', 'Hay muchos Vera.'),
      L('reyes', '¿Y muchos nacieron el mismo día que tú, en el mismo pueblo?'),
      L('voz', 'Esa noche usted sintió miedo. Lo recuerdo… lo recuerda. Siga.'),
    ],
  },
  {
    id: 'toque',
    number: 4,
    title: 'Toque de queda',
    place: 'Puerto Ceniza, barrio alto',
    date: '20 de enero de 1982',
    world: 'city',
    kind: 'mission',
    difficulty: 5,
    loadout: ['rifle', 'dmr', 'pistol'],
    grenades: 2,
    objective: 'Cruza el barrio alto hasta el Relojero',
    encounters: [
      { type: 'peek', count: 6, concurrent: 2, areas: ['high', 'front'] },
      { type: 'peek', count: 5, concurrent: 2, areas: ['flank', 'front'] },
      { type: 'mixed', count: 10, concurrent: 3, areas: ['front', 'high', 'flank', 'back'] },
    ],
    intro: [
      L('narrador', 'Puerto Ceniza, barrio alto. 20 de enero de 1982. Toque de queda.'),
      L('vera', 'Reyes no durmió. Encontró a un informante: un relojero que reparaba los equipos de Lang.'),
      L('reyes', 'El Relojero sabe dónde está el Faro. Nos vemos con él a la una, en la plaza del mercado.'),
      L('ibarra', 'Ese encuentro no está autorizado, sargento.'),
      L('reyes', 'Por eso no se lo pedí, coronel.'),
    ],
    radio: {
      start: [L('reyes', 'Calles vacías. Demasiado vacías. Ojo con los balcones.')],
      encounters: {
        1: [L('reyes', '¡Callejón a la izquierda! Nos quieren cortar el paso.')],
        2: [L('reyes', 'Ya casi… Andrés, ¿por qué hay uniformes de los nuestros entre ellos?')],
      },
      end: [L('reyes', 'Despejado. Voy por el Relojero, cúbreme desde aquí.')],
    },
    outro: [
      L('narrador', 'Plaza del mercado. 1:07 a. m.'),
      L('vera', 'Lo vi caer desde lejos. Un solo disparo, desde la torre del reloj.'),
      L('reyes', 'Andrés… no fueron ellos. Era uno de los nuestros. La coronel…'),
      L('reyes', 'Los números no son mensajes. Son llaves. Y tú… tú eres una puerta.'),
      L('vera', '¡Tomás! ¡Quédate conmigo!'),
      L('narrador', 'Sargento Tomás Reyes. 1951 – 1982.'),
      L('voz', 'Usted culpó a los hombres de Lang. Ibarra le dijo que habían sido ellos. Y usted le creyó.'),
    ],
  },
  {
    id: 'ceniza',
    number: 5,
    title: 'Ceniza',
    place: 'Barrio San Telmo, Puerto Ceniza',
    date: '3 de junio de 1983',
    world: 'ruins',
    kind: 'mission',
    difficulty: 6,
    loadout: ['rifle', 'shotgun', 'pistol'],
    grenades: 3,
    objective: 'Abre paso hasta la antena de San Telmo',
    setup: { openDoors: true, spawn: [0, 6] },
    encounters: [
      { type: 'flick', count: 8, concurrent: 2 },
      { type: 'strafe', count: 6, concurrent: 2 },
      { type: 'mixed', count: 10, concurrent: 3 },
    ],
    intro: [
      L('narrador', 'Barrio San Telmo, Puerto Ceniza. 3 de junio de 1983.'),
      L('vera', 'Un año y medio cazando a la gente de Lang. Con una escuadra nueva. Sin Reyes.'),
      L('vera', 'Pero en la radio… a veces lo oía.'),
      L('reyes', 'Halcón. Te dije que nunca te ibas a librar de mí.'),
      L('vera', 'Tomás… no puede ser.'),
      L('reyes', 'Concéntrate. La antena de Lang está en este barrio. Quemaron todo para esconderla.'),
    ],
    radio: {
      start: [L('reyes', 'El barrio está tomado. Vienen de todos lados: no te quedes quieto.')],
      encounters: {
        1: [L('ibarra', 'Vera, ¿con quién está hablando? Su escuadra no responde.'), L('reyes', 'No le hagas caso. Sigue avanzando.')],
        2: [L('reyes', 'Detrás de los autos, ¡cuidado!')],
      },
      end: [L('reyes', 'La antena apunta al cerro. A la Cúpula. Lang está ahí.')],
    },
    outro: [
      L('ibarra', 'Capitán Vera, repórtese. Se separó de la escuadra hace cuarenta minutos.'),
      L('vera', 'Encontré la antena. Lang está en la Cúpula. Voy a entrar.'),
      L('ibarra', 'Negativo. Espere el apoyo.'),
      L('reyes', 'Si esperas, Andrés, llegan ellos primero. Y te llevan.'),
      L('voz', 'Usted entró solo. Como siempre: obediente cuando le conviene a otro.'),
    ],
  },
  {
    id: 'cupula',
    number: 6,
    title: 'La Cúpula',
    place: 'Instalación Faro-2, bajo el cerro',
    date: '4 de junio de 1983',
    world: 'dome',
    kind: 'numbers',
    loadout: ['pistol'],
    rounds: [
      [7, 3, 9],
      [7, 3, 9, 1],
      [7, 3, 9, 1, 4],
      [7, 3, 9, 1, 4, 0],
    ],
    objective: 'Dispara los números en el orden de la transmisión',
    intro: [
      L('narrador', 'Instalación «Faro-2», bajo el cerro. 4 de junio de 1983.'),
      L('lang', 'Así que llegaste, Andrés. Prototipo número tres. El más estable de todos.'),
      L('vera', '¡Lang! ¿Qué me hicieron?'),
      L('lang', 'Ibarra y yo te enseñamos a obedecer una secuencia. Siete, tres, nueve… y tu dedo se mueve solo.'),
      L('lang', 'Quiero que lo veas con tus propios ojos. Dispara los números en el orden que escuches. Si te equivocas, tu cabeza te lo va a recordar.'),
    ],
    radio: {
      start: [L('lang', 'Escucha. Solo escucha.')],
      end: [L('lang', 'Perfecto. Tal como te diseñamos.')],
    },
    outro: [
      L('lang', 'Yo creé ECO para defender este país. Ibarra lo convirtió en un ejército dormido: cien hombres como tú, en todo el continente.'),
      L('lang', 'El 7 de junio la Torre Faro va a transmitir la secuencia completa. Despiertan todos a la vez.'),
      L('lang', 'Robé la cinta maestra para impedirlo. La escondí donde nadie la iba a buscar.'),
      L('vera', '¿Dónde?'),
      L('lang', 'En ti.'),
      L('narrador', 'La puerta se abrió. Uniformes de Retícula. Un golpe en la nuca. Oscuridad.'),
      L('voz', 'Y así llegó aquí, capitán. A esta silla.'),
    ],
  },
  {
    id: 'fuga',
    number: 7,
    title: 'Fuga',
    place: 'Base Cóndor, sala de interrogatorios',
    date: '6 de junio de 1983 · ahora',
    world: 'yard',
    kind: 'mission',
    difficulty: 8,
    loadout: ['smg', 'pistol'],
    grenades: 2,
    objective: 'Escapa de Base Cóndor',
    encounters: [
      { type: 'peek', count: 6, concurrent: 2, areas: ['front', 'high'] },
      { type: 'mixed', count: 8, concurrent: 3, areas: ['flank', 'back', 'front'] },
      { type: 'mixed', count: 10, concurrent: 3, areas: ['front', 'high', 'flank', 'back'] },
    ],
    intro: [
      L('voz', 'Ahora entiende por qué le pregunto por los números. Lang le grabó la secuencia final en la memoria.'),
      L('vera', 'Usted no es una voz cualquiera. La conozco.'),
      L('ibarra', 'Claro que me conoces, Andrés. Te elegí en aquel campo de tiro. Te cuidé. Te construí.'),
      L('ibarra', 'Dame la secuencia final y todo esto termina. Puedes volver a ser un buen soldado.'),
      L('vera', '¿Como Tomás?'),
      L('reyes', 'Andrés. Ya sabes que yo no estoy aquí. Pero tú sí. Levántate.'),
      L('narrador', 'Base Cóndor. 6 de junio de 1983. Ahora.'),
    ],
    radio: {
      start: [L('ibarra', '¡Cierren el patio! ¡Lo quiero vivo!')],
      encounters: {
        1: [L('reyes', 'Las mismas paredes donde te enseñaron a matar. Úsalas.'), L('ibarra', 'Andrés, piénsalo. Afuera no hay nada para ti.')],
        2: [L('reyes', 'El portón norte. Hay un vehículo esperando… no preguntes quién lo dejó.')],
      },
      end: [L('vera', 'Voy por la torre, coronel. Por todos ellos.')],
    },
    outro: [
      L('ibarra', 'Va hacia el Faro. Inicien la transmisión ahora. Si no la tenemos completa, que despierten los que puedan.'),
      L('narrador', 'Cerro del Faro. 7 de junio de 1983. 04:58.'),
    ],
  },
  {
    id: 'faro',
    number: 8,
    title: 'Torre Faro',
    place: 'Cerro del Faro',
    date: '7 de junio de 1983 · 04:58',
    world: 'arena',
    kind: 'mission',
    difficulty: 10,
    loadout: ['rifle', 'lmg', 'sniper', 'pistol'],
    grenades: 3,
    objective: 'Toma la Torre Faro antes de que termine la transmisión',
    encounters: [
      { type: 'peek', count: 8, concurrent: 2, areas: ['front', 'high'] },
      { type: 'strafe', count: 6, concurrent: 2 },
      { type: 'mixed', count: 14, concurrent: 3, areas: ['front', 'high', 'flank', 'back'] },
    ],
    intro: [
      L('numeros', '7 · 3 · 9 · 1 · 4 · 0'),
      L('vera', 'La transmisión ya empezó. En algún lugar, un hombre como yo está tomando un arma sin saber por qué.'),
      L('reyes', 'Tienes la secuencia, Andrés. Lang no la escondió en ti para que la guardaras. Para que la terminaras.'),
      L('ibarra', 'Todas las unidades a la torre. Que no llegue a la consola.'),
    ],
    radio: {
      start: [L('reyes', 'Última vez, Halcón. Como en el campo de tiro: sin fallar.')],
      encounters: {
        1: [L('ibarra', '¡Soldados! Son sus hermanos los que van a despertar. ¡Deténganlo!')],
        2: [L('reyes', '¡Plataformas altas, están arriba!'), L('ibarra', 'Andrés… por favor.')],
      },
      end: [L('vera', 'Consola. Secuencia final: cero. Cero. Cero.')],
    },
    outro: [
      L('numeros', '0 · 0 · 0'),
      L('narrador', 'La transmisión se cortó a las 05:03. En todo el continente, cien hombres soltaron el arma sin saber por qué.'),
      L('ibarra', '…¿Qué hiciste?'),
      L('vera', 'Lo que usted me enseñó, coronel. Obedecí la secuencia. Solo que esta vez la escribí yo.'),
      L('narrador', 'La coronel Elena Ibarra fue detenida esa misma mañana. La Unidad Retícula nunca existió oficialmente.'),
      L('narrador', 'Del capitán Andrés Vera no quedó ningún registro.'),
      L('reyes', 'Buen tiro, Halcón.'),
      L('narrador', 'FIN'),
    ],
  },
];

export const STORY_TITLE = 'ECO';
export const CHAPTER_KINDS = ['targets', 'mission', 'numbers'];

export const getChapter = (id) => CHAPTERS.find((c) => c.id === id) ?? null;
export const chapterIndex = (id) => CHAPTERS.findIndex((c) => c.id === id);

// Total de enemigos de una misión.
export const missionTotal = (ch) => (ch.encounters ?? []).reduce((s, e) => s + e.count, 0);

// --- Progreso (store.records.story) ---------------------------------------------------------------

export function emptyStoryRecord() {
  return { completed: {}, prologueSeen: false, finished: false };
}

export function normalizeStory(rec = {}) {
  return { ...emptyStoryRecord(), ...rec, completed: { ...(rec.completed ?? {}) } };
}

/** ¿Se puede jugar el capítulo? El primero siempre; los demás, al terminar el anterior. */
export function isUnlocked(rec, id) {
  const i = chapterIndex(id);
  if (i <= 0) return i === 0;
  return !!rec.completed[CHAPTERS[i - 1].id];
}

/** Capítulo que toca jugar: el primero sin terminar (o el último si ya se terminó todo). */
export function nextChapter(rec) {
  return CHAPTERS.find((c) => !rec.completed[c.id]) ?? CHAPTERS[CHAPTERS.length - 1];
}

/** Guarda un capítulo terminado (con el mejor tiempo). Devuelve true si es la primera vez. */
export function completeChapter(rec, id, { time = 0, kills = 0, accuracy = null } = {}) {
  const prev = rec.completed[id];
  rec.completed[id] = prev
    ? { ...prev, time: Math.min(prev.time, time), kills: Math.max(prev.kills, kills), accuracy: Math.max(prev.accuracy ?? 0, accuracy ?? 0), plays: (prev.plays ?? 1) + 1 }
    : { time, kills, accuracy, plays: 1, date: new Date().toISOString() };
  if (CHAPTERS.every((c) => rec.completed[c.id])) rec.finished = true;
  return !prev;
}

/** Segundos que dura una línea en pantalla (subtítulos durante la misión). */
export const lineDuration = (line) => Math.min(7, 1.8 + line.text.length * 0.045);
