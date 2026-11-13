# Retícula

Aim trainer 3D en el navegador para practicar la puntería de cualquier shooter (CS2, Valorant, Apex,
Fortnite, Call of Duty, Overwatch) y la coordinación ojo-mano.
Vite + Three.js + JavaScript, sin frameworks de UI.

```bash
npm install
npm run dev       # http://localhost:5173
npm test          # pruebas automáticas (Vitest)
npm run build     # versión de producción en dist/
```

Cada PR y cada push a `main` pasan por la CI de GitHub Actions (`.github/workflows/ci.yml`): `npm ci`,
`npm test` y `npm run build`. Fusiona solo PRs en verde y abre cada PR contra `main` (no contra otra
rama de PR), para que lo fusionado llegue siempre a `main`.

Requisitos: navegador con WebGL 2 y Pointer Lock (Chrome o Edge recomendados: son los únicos que dan
raw input), mouse y teclado. Si falta algo, el juego lo avisa al abrir.

## Apps: Windows y Android

Además de en el navegador, Retícula se descarga como app. Las descargas están en la pestaña
**Releases** del repositorio:

| Plataforma | Archivo | Cómo se juega |
|------------|---------|---------------|
| Windows | `Reticula-Setup-x.y.z.exe` (instalador) o `Reticula-Portable-x.y.z.exe` (sin instalar) | Mouse y teclado, con raw input y Pointer Lock igual que en Chrome. `F11`: pantalla completa |
| Android | `Reticula-x.y.z.apk` | **Controles táctiles**: joystick a la izquierda, arrastrar a la derecha para apuntar y botones de disparo, mira, recarga, salto, agacharse, arma y pausa. Siempre en horizontal y a pantalla completa |
| Navegador | https://ju4nk1807.github.io/Reticula/ | En el teléfono, "Agregar a la pantalla de inicio" la instala con su ícono |

Para instalar el APK en Android hay que permitir "Instalar apps de origen desconocido" al abrirlo.

### Controles táctiles
Se activan solos en dispositivos sin mouse, o a mano en *Configuración → Juego → Controles táctiles*.
Ahí también están la sensibilidad táctil (independiente de la del mouse) y el eje Y invertido.

### Compilar las apps
```bash
npm run desktop          # abre la app de escritorio con la versión compilada
npm run desktop:build    # instalador y portable de Windows en release/
npm run android:sync     # compila el juego y lo copia al proyecto Android (android/)
npm run android:build    # APK de depuración (necesita JDK 21 y el SDK de Android)
```



## Estructura

```
src/
  main.js                 Punto de entrada
  style.css
  core/                   Motor: Game (estados), Engine (render/FOV/overlay), Input (mouse y teclado),
                          PlayerController (mirada, movimiento, colisiones), Emitter
  combat/                 Ballistics (hitscan y línea de visión), Weapon, Viewmodel (arma en pantalla),
                          Melee (golpe), Grenades (granadas)
  effects/                Trazadoras, marcas de impacto, partículas, casquillos, chispas, cámara y
                          soldados del menú
  physics/                Cuerpos rígidos (RigidBody) y utilería con física de los mapas (Props)
  gfx/                    Superficies PBR, iluminación, calidad automática, cielo y texturas de canvas
  config/                 defaults, ranks, sensitivity (conversión entre 8 juegos y cm/360)
  storage/                SaveStore (localStorage versionado con migraciones), profile (rango general)
  audio/Sfx.js            Sonidos con Web Audio API: disparos grabados con cuerpo y eco, reverb, voces de zombi
  audio/zombieVoices.js   Perfiles de las voces de zombi (gruñido, chillido, rugido, estertor…)
  audio/HorrorMusic.js    Música de terror generada en vivo para el modo zombi (volumen propio en Ajustes)
  scenes/                 Mapas base (ShootingRange, TrainingYard), la Armería del menú y registry.js
  bots/                   Bots humanoides: hitboxes, strafing, peeks, agachadas, saltos y disparo
  modes/                  Mode.js (interfaz base), registry.js (registro), index.js (descubre los modos)
  modes/evaluation/       Evaluación: dos variantes de 5 fases + scoring → rango
  modes/story/            Historia «ECO»: 8 capítulos con trama, escenas, radio y la prueba de números
  modes/campaign/         Campaña: mapas Bodega/Ciudad/Arena, 12 niveles, misiones, progreso y estrellas
  modes/coordination/     Coordinación ojo-mano: sala Cúpula, 4 ejercicios adaptativos, circuito y récords
  modes/endless/          Modo infinito: mapa Bastión, IA de asalto, oleadas, HUD propio y récords
  modes/zombies/          Modo zombi: Barrio en ruinas, zombis realistas, atmósfera nocturna, campo de flujo y armería
  ui/                     HUD, mira, gráficas y pantallas (menú, editor de retícula, progreso, ajustes, pausa,
                          resultados, compatibilidad)
  stats/                  history.js: series e historial unificado para la pantalla de Progreso
  utils/                  math, format
tests/                    Pruebas de la lógica pura (guardado, rangos, sensibilidad, registros)
```



### Enemigos — patio con coberturas

Bots humanoides de tamaño real (~1.77 m, cabeza de ~25 cm) con puertas, coberturas y balcón.

| Fase | Duración | Qué mide |
|------|----------|----------|
| Flicks | 30 s | precisión, % headshots, bajas/s, enemigos escapados |
| Tracking | 30 s, automático | % de tiempo sobre el enemigo, % de balas acertadas |
| Peeks y reacción | 10 apariciones | reacción desde que el enemigo es visible, daño recibido |
| Precisión a la cabeza | 30 s | % de tiros a la cabeza (el resto resta) |
| Combate en movimiento | 40 s, automático | bajas, precisión, headshots, vida restante |

Pesos: flicks 22 %, tracking 20 %, peeks 20 %, precisión 20 %, combate 18 %.
Rangos: Bronce 0+, Plata 30+, Oro 48+, Diamante 64+, Élite 80+ (`src/config/ranks.js`).

Cada variante guarda su propio rango. El **rango general** (el del menú, el que desbloquea modos) es el
mejor rango actual entre las dos variantes. Los tiempos de reacción se miden con el reloj real
(`performance.now()` y el instante del clic), así que no dependen de los FPS.

## Historia: ECO

Campaña con historia propia (1979–1983). El capitán Andrés «Halcón» Vera despierta atado a una silla:
una voz le pregunta qué significan los números 7-3-9 que lee una estación de radio. Cada capítulo es un
recuerdo de cómo llegó ahí, desde el campo de tiro de Base Cóndor hasta la Torre Faro.

- 8 capítulos, cada uno en un mapa del juego: campo de tiro, patio, bodega, ciudad, barrio en ruinas
  (con las puertas abiertas), la Cúpula y la arena.
- Escenas entre misiones con texto que se escribe solo (clic o Espacio para avanzar, «Saltar escena»).
- Radio durante la misión según lo que pasa (bajas, encuentros nuevos) y una voz sintética para la
  transmisión de números.
- Tres tipos de capítulo: dianas, misión con soldados (vida que se recupera, granadas, armas del
  capítulo y recarga real) y la Cúpula (dispara los números en el orden de la transmisión).
- Sin límite de tiempo; si caes, se reintenta el capítulo. Cada capítulo terminado abre el siguiente
  (progreso en `records.story`).

## Campaña

Se desbloquea al hacer cualquier evaluación. Un mapa por tramo de rango, con 4 niveles cada uno
(12 en total). Se empieza en el mapa recomendado para tu rango; los inferiores siempre están abiertos y
completar un mapa abre el siguiente aunque tu rango no llegue.

| Mapa | Rangos | Escenario |
|------|--------|-----------|
| Bodega | Bronce · Plata | Almacén con estanterías, palés, montacargas, pasarela alta y portones |
| Ciudad | Oro · Diamante | Calle con coches cruzados, quioscos, balcones, callejones y plaza |
| Arena | Élite | Arena simétrica con torre central, plataformas laterales y pilares |

- **Niveles**: Reconocimiento (flicks y duelos), Asomadas (peeks desde coberturas y alturas), Fuego
  cruzado (varios a la vez y por los flancos) y Asalto final (todo mezclado, también por detrás).
- **Dificultad continua 0-11** (`botProfile` en `src/modes/campaign/campaignData.js`): los bots pasan del
  100 % al 72 % de tamaño, se mueven más rápido, cambian de dirección más seguido, amagan, se agachan y
  saltan más, y reaccionan antes (0.75 s → 0.31 s). Su daño por segundo va de ~3.6 a ~14.
- **Nota 0-100 y estrellas**: 45 % enemigos eliminados, 20 % precisión, 15 % cabeza, 12 % vida y 8 %
  rapidez; morir multiplica por 0.6 y deja el nivel sin estrellas. La 1ª estrella es la meta que
  desbloquea el siguiente nivel; la 2ª y la 3ª son para rejugar.
- **Sugerencia de bajar de mapa**: tras 3 intentos seguidos sin estrellas y con nota media 10 puntos o
  más bajo la meta del primer nivel del mapa, se recomienda practicar en el mapa inferior.
- **Auditoría de mapas** (`tests/campaignMaps.test.js`): con raycasts reales verifica que cada asomada se
  vea desde la zona del jugador, que cada escondite oculte, que los bots quepan, que las posiciones altas
  tengan piso y que haya terreno abierto suficiente. Si un mapa cambia y deja un enemigo imposible,
  la prueba falla y dice cuál.
- Progreso en `store.data.campaign` (`best`, `unlocked`, `recent`). `B` cambia el modo de disparo.

## Coordinación ojo-mano

Disponible desde el inicio (no requiere evaluación). Se juega en la **Cúpula**, una sala circular oscura y
neutra sin obstáculos, con una línea de horizonte a la altura de los ojos como referencia. Cada
ejercicio dura 45 s, da una puntuación de 0 a 100 y se puede jugar suelto o en **circuito completo** (los
cuatro seguidos, con un índice de coordinación y niveles Inicial → Élite). Munición ilimitada: aquí solo
cuenta la coordinación.

| Ejercicio | Qué hay que hacer | Se adapta | Mide |
|-----------|-------------------|-----------|------|
| Secuencia | Destruir dianas numeradas en orden | Serie limpia → +1 diana; 2 errores → −1 (4 a 9) | dianas/s, errores de orden, precisión |
| Color objetivo | Disparar solo a la figura indicada; la regla cambia cada 5-9 s | — | aciertos/s, figuras prohibidas, reacción al cambio |
| Periferia | Con la mira en el aro central, acertar objetivos en los bordes del FOV real | Escalera que converge al 75 % de aciertos | ventana final, aciertos por zona, reacción |
| Doble tarea | Seguir una esfera y disparar a dianas que aparecen | — | % sobre la esfera, reacción, vuelta a la esfera |

En **Color objetivo** cada color tiene su forma (azul esfera, amarillo cubo, magenta pirámide, verde
diamante), así que se puede jugar con daltonismo. Las fórmulas están en
`src/modes/coordination/coordScoring.js` y los récords en `records.coordination`.

## Modo infinito

Se desbloquea al hacer cualquier evaluación. Oleadas sin fin en el **Bastión**, un patio de 48 m con
8 puertas: los enemigos pueden llegar por cualquier lado.

- **Enemigos**: entran por las puertas, combaten en el sitio (strafing, se agachan, saltan, disparan)
  y avanzan hacia ti flanqueando, sin acercarse a menos de 6 m.
- **Avisos**: la lámpara de la puerta se pone roja y suena un aviso en estéreo 0.9 s antes de cada
  entrada. Las flechas alrededor de la mira señalan enemigos fuera de la vista; se ponen rojas si
  te están apuntando.
- **Dificultad** (`src/modes/endless/waves.js`):

| Oleada | Bots (simultáneos) | Tamaño | Reacción | Precisión | Daño |
|-------:|-------------------:|-------:|---------:|----------:|-----:|
| 1      | 4 (2)              | 100 %  | 0.80 s   | 20 %      | 7    |
| 5      | 12 (4)             | 90 %   | 0.66 s   | 28 %      | 9    |
| 10     | 22 (6)             | 78 %   | 0.49 s   | 38 %      | 12   |
| 15     | 32 (8)             | 65 %   | 0.31 s   | 48 %      | 14   |
| 16+    | 34 → 40 (8)        | 63 → 62 % | 0.28 s | 50 %      | 14   |

- **Supervivencia**: 100 de vida; +25 al superar una oleada; botiquines (+20) que caen con un 12 % de
  probabilidad (30 % si tienes menos de 40 de vida).
- **Puntos**: impactos y bajas × multiplicador de oleada (+10 % por oleada), +50 por baja a la cabeza,
  racha (bajas sin recibir daño) y bonificación por oleada superada (×2.5 si fue perfecta).
- **Controles extra**: `B` cambia entre disparo automático y semiautomático.
- **Récords** en `records.endless`: mejor oleada, puntaje, bajas y racha, y las últimas 20 partidas.

## Modo zombi

Oleadas de zombis en el **Barrio en ruinas**, al estilo de los modos de supervivencia clásicos: el
mapa se abre a medida que se gana y hay que devolverle la luz al barrio. No requiere evaluación.

- **Zombis realistas**: un modelo con anatomía real, texturas PBR y 13 animaciones (arrastrar los pies,
  caminata rápida, correr, gatear, arrastrarse sin piernas, dos zarpazos, cabezazo, golpe, grito y dos
  muertes). Cada zombi tiene su tono de piel, su ropa y su cantidad de sangre (sangre seca en la boca, el
  pecho y las manos), ojos que brillan en la oscuridad y un borde frío de luz de luna. Las balas dejan
  **heridas** donde entran (pegadas al cuerpo aunque se mueva), sueltan una neblina de sangre y manchan
  el suelo; los muertos dejan un charco. Una granada cerca puede **arrancarles las piernas**: siguen
  arrastrándose con los brazos. La caja de la cabeza sigue al hueso de la cabeza: los tiros a la cabeza
  se deciden por lo que se ve.
- **Noche con atmósfera**: farolas, fuego y fluorescentes con luz real (un puñado de luces que se
  reparten entre las fuentes más cercanas a la cámara), conos y charcos de luz, bruma baja pegada al
  suelo, fuego y humo animados, charcos que reflejan, ventanas con interior y cortinas, fachadas con
  cornisas, balcones, persianas de tiendas y bajantes, y en calidad alta un etalonaje de color con
  viñeta y grano. Texturas PBR nuevas (adoquines, calle rota, revoque, pared descascarada, metal y chapa
  oxidados, barro con hojas, piedra y azulejos sucios).
- **Niebla espesa** al estilo de los mapas de zombis clásicos: a unos 30 m ya casi no se ve, bruma baja que
  brilla bajo las farolas y bancos de niebla que flotan y se mueven con el viento alrededor del jugador
  (menos en calidad media y baja). **Más barreras y chatarra**: barreras de concreto, muros de sacos,
  autos quemados, pilas de neumáticos, palés, escombros y vallas de obra en todas las zonas.
- **Noche de terror**: el barrio está casi a oscuras y con una niebla negra densa (a unos 20 m no se ve
  nada). La cámara del modo es más cerrada (más aumento).
- **Linterna**: se prende y apaga con F (reasignable) o con el botón táctil, con un clic.
  - Es un foco que sigue la mirada y atraviesa la niebla: dentro de su círculo se ve mucho más lejos.
  - En calidad alta proyecta sombras. Apagada, solo se ven los ojos de los zombis.
  - Abajo a la izquierda, un ícono muestra si está prendida, apagada o sin batería, y cuánta carga queda.
  - **Batería**: dura 150 s prendida y se recarga apagada en 45 s. Con menos del 20 % la luz se debilita
    y titila. Vacía, se apaga sola y no vuelve a prender hasta recargar un poco. Los valores están en
    `BATTERY` (`src/modes/zombies/flashlight.js`).
- **Zombis payaso**: trajes de colores con lunares, rayas o rombos, cara pintada de blanco descascarado,
  rombos negros en los ojos, sonrisa roja, nariz, pelo de colores, sombrerito y gola (piezas pegadas a
  los huesos de la cabeza y el cuello). Mucha más sangre: salpicaduras en el traje, heridas más grandes,
  más neblina de sangre y más charcos.

- **El Circo y las barricadas**: se empieza encerrado en una carpa de circo abandonada (lona a
  rayas, pista con aserrín, banderines y focos de colores) con cuatro ventanas tapiadas. Los zombis
  salen de la tierra, arrancan los tablones uno a uno y recién entonces entran; mantener `E` junto a
  una ventana la repara (+10 puntos por tablón, hasta 500 por ronda). Todas las entradas del mapa
  tienen su barricada.
- **Secciones**: las puertas tapiadas se compran con puntos (`E`, desde cualquiera de sus lados).
  Cada una lleva un cartel con el precio. Al acercarte aparece «Presiona [E] para abrir ($precio)»,
  o «Dinero insuficiente» si no alcanza. Cuanto más lejos del Circo, más caras: la **Plaza** (500),
  la **Iglesia** (750; se llega desde el Circo), el **Mercado** y la **Estación** (1000), la
  **Subestación** (1250, al oeste), el **Hospital** (1500; por la Subestación o por un pasillo desde el
  Mercado) y la **Feria** (2000; por la Estación o por la Iglesia). Cada sección trae armas y bebidas
  nuevas, pero también sus propias entradas. La horda solo sale de las entradas de las secciones
  abiertas, de las más cercanas al jugador.
- **La Feria y el segundo piso**: un parque de diversiones abandonado con carrusel, rueda de la
  fortuna y puestos de juegos. La **Casa de la Risa** tiene una terraza a 3.6 m que se sube por dos
  escaleras, con una ametralladora en la pared. Los zombis también suben por las escaleras: desde abajo
  no te alcanzan, pero arriba solo hay dos salidas.
- **Electricidad**: el barrio empieza sin luz (farolas apagadas, una baliza roja girando). En la
  caseta de la Subestación está el **generador**: su palanca enciende las farolas, los focos, los
  fluorescentes del hospital, las máquinas de bebidas y la Forja. Sin luz solo funciona Segundo Aire.
- **Forja** (quirófano del Hospital, con electricidad): 5000 puntos forjan el arma que llevas — doble
  de daño, cargador y reserva ×1.5 y un brillo violeta y cian que recorre el arma.
- **Caja misteriosa** (el haz de luz azul): 950 puntos por un arma al azar. Empieza en la plaza y cada
  4 a 7 tiradas se muda a otro de seis lugares del mapa.
- **Armas**: se cargan hasta **3**. Con las manos llenas, comprar en la pared o sacar de la caja
  cambia el arma que tienes en la mano; el aviso de compra dice cuál. Se cambia de arma con `1`-`3`
  o con la rueda del mouse. El HUD muestra solo tus armas, con su ícono y su munición
  (cargador / reserva), y resalta la equipada.

  Precios en la pared: Revólver 900, Subfusil 1000, Escopeta 1500, Rifle 1600, Rifle de ráfaga 1800,
  Fusil de tirador 2000, Ametralladora 2500 y Francotirador 2750. El **Desintegrador** es el arma
  especial: rayos de energía que deshacen a casi cualquier zombi de un tiro. Cuesta 6000 en la terraza
  de la Feria y también sale, poco, de la caja.

  Los íconos son siluetas en SVG (`src/ui/weaponIcons.js`). Para usar imágenes, pon el archivo en
  `public/icons/weapons/` y su ruta en `ICON_IMAGES`.
- **Rondas**: la ronda 1 trae 6 caminantes lentos que mueren de 2 tiros de pistola (o 1 a la cabeza).
  En cada ronda aumentan la cantidad, la vida, la velocidad y el daño. Las fórmulas y todos los
  valores de balance están en `src/modes/zombies/roundConfig.js`:
  - cantidad = 4 + 1.6 × ronda (+ una curva suave)
  - vida = 55 × (1 + 0.2 × (ronda − 1)), y ×1.1 por ronda desde la 10
  - velocidad ×0.75 → ×1.35
  - daño ×0.6 → ×1.4

  En pantalla se ven la ronda y los zombis que faltan. Entre rondas hay 12 s de pausa con el cartel
  «Ronda X» y la armería abierta. Vivos a la vez: hasta 24, con un tope según la calidad gráfica
  (baja 14, media 20, alta 24). El cuchillo hace 150.
- **Vida y golpes**: la vida se regenera tras 5 s sin recibir golpes. Un tiro a la cabeza la hace
  volar, y algunos zombis siguen caminando sin ella hasta desangrarse.
- **Armas en la pared**: se empieza con la pistola (munición infinita). Las demás están colgadas en las
  paredes de cada sección (revólver, subfusil, rifle, escopeta, ráfaga, tirador, ametralladora,
  francotirador); con el arma ya comprada, el mismo puesto vende su munición a mitad de precio.
- **Bebidas** (máquinas del mapa, duran hasta caer): Coraza (vida 250), Doble Plomo (+50 % de daño,
  +25 % de cadencia), Mano Rápida (recarga al doble), Pies Ligeros (+15 % de velocidad), Segundo Aire
  (regenera antes y más rápido) y Último Aliento (si caes, te levantas una vez con toda la vida).
- **Armería** entre rondas (`E` o botón táctil): munición, botiquín y cuatro granadas —
  fragmentación, incendiaria (deja fuego), aturdidora (frena a la horda) y señuelo (atrae a los zombis
  y explota). `G` lanza y `Q` cambia de tipo.
- **Tipos**: caminante, corredor (rápido), reptante (bajo, difícil de acertar) y bruto (mucha vida y
  golpe fuerte; desde la oleada 5). Cada 6 oleadas, *noche de corredores*.
- **Potenciadores** que sueltan los zombis: munición máxima, doble puntos, muerte instantánea, bomba y
  botiquín.
- **IA**: los zombis van en línea recta si nada se interpone y, si no, siguen un campo de flujo
  compartido (Dijkstra sobre una cuadrícula de 1 m). El rumbo y la velocidad cambian de forma gradual
  y la animación sigue la velocidad real: se mueven fluidos, sin zigzag. Se separan entre sí y atacan
  con un gesto previo: retroceder a tiempo esquiva el golpe.
- La vida se regenera tras unos segundos sin recibir golpes. Flechas rojas junto a la mira avisan de
  zombis cerca y fuera de la vista.
- Igual que con los soldados, los modelos son solo la apariencia: los impactos los deciden hitboxes
  invisibles alineadas al cuerpo (el reptante, a ras del suelo).
- Créditos: zombi de medicinestorm (OpenGameArt, CC0); animaciones extra de bachosoftdesign (Poly Pizza,
  CC-BY 3.0); texturas de Poly Haven (CC0). Detalle en `public/models/characters/credits.json`.
- **Dificultad** (se elige en la pantalla del modo y se recuerda; récords por dificultad):

  | Dificultad | Zombis |
  |---|---|
  | Fácil | más lentos y frágiles, pegan la mitad, menos y más espaciados; más regeneración |
  | Normal | la horda tal como fue pensada |
  | Difícil | más vida, velocidad y daño (×1.4), más zombis y menos respiro |
  | Locura | vida ×1.7, daño ×2, corredores desde la primera oleada, brutos desde la 3 y casi sin pausa |

  Más puntos cuanto más difícil.
- **Colisiones**: barreras y autos girados chocan con su forma real (antes, con la caja que los
  envolvía: había paredes invisibles), y después de moverse la horda se separa con una corrección
  firme: ningún zombi queda dentro de otro ni del jugador.

## Defensa de la barra

La misma plaza, otro objetivo: la fuente del centro es una **barra con 46 botellas de licor** (vino,
whisky, vodka, ron, ginebra y tequila) bajo una guirnalda de bombillas y un letrero «BAR».

- Los zombis van **primero por la barra** (con su propio campo de flujo hacia el contorno de la fuente):
  cada golpe rompe la botella más cercana. Si se rompe la última, se pierde la partida.
- Un zombi deja la barra y persigue al jugador si se acerca a menos de 3.2 m o si le dispara (unos
  segundos): sirve para sacarlos de la barra.
- Las botellas también se rompen con tus balas: hay que tener cuidado al disparar cerca de la barra.
- Armería, potenciadores, granadas y dificultades como en el modo zombi, más **«Reponer licor»** (8
  botellas). Récords propios.

## Mecánicas

- **Nueve armas** (teclas 1-9 o rueda del mouse): pistola, subfusil, rifle, escopeta, francotirador,
  revólver, rifle de ráfaga, ametralladora y fusil de tirador. Las automáticas (subfusil, rifle,
  ametralladora) disparan manteniendo el clic; la ráfaga, tres balas por clic; el resto, una por clic.
- **Munición infinita al entrenar**: en la evaluación, la coordinación y la campaña no hay que
  recargar. El modo zombi y el infinito sí administran la munición.
- **Brazos y manos** en primera persona sujetando cada arma; **cuchillo** (`V`) con su corte y
  **granadas** (`G`) que se ven en la mano antes de lanzarlas.
- **Apuntar con las miras** (clic derecho) en todas las armas: aumento propio de cada arma, menos
  dispersión y caminar más lento. El francotirador y el fusil de tirador usan mira telescópica.
- **Controles reasignables** en Configuración → Controles y datos (clic en una tecla y pulsar la
  nueva; si choca con otra acción, se intercambian). **Sombras** en Video: según el detalle,
  siempre o nunca.
- La evaluación no tiene ADS ni golpe: los rangos siguen siendo comparables.

## Física

- **Casquillos**: cada disparo expulsa la vaina del calibre del arma por la derecha (la escopeta al
  accionar la corredera, el francotirador al abrir el cerrojo); rebotan con su tintineo y quedan un rato en
  el piso. Se desactivan en *Configuración → Juego*.
- **Utilería con física** en el modo zombi y en el infinito: cajas, barriles, botes de basura, latas,
  conos y cajas de munición. El balazo los empuja desde el punto del impacto según el daño del arma (una
  lata sale volando, una caja apenas se mueve), las granadas los lanzan y el jugador, los bots y los
  zombis los empujan al pasar. Frenan las balas como cualquier cobertura y vuelven a su lugar en cada
  partida.
- Motor propio (`src/physics/`): cuerpos rígidos con puntos de contacto, rebote y rozamiento, cilindros
  que ruedan, choques entre objetos y reposo (lo que está quieto no gasta CPU). La evaluación y la campaña
  no tienen utilería, para que los rangos sigan siendo comparables.

## Rendimiento

- **Calidad automática** (por defecto): ajusta la resolución (hasta el 50 %) para mantener 60 FPS, también
  en la pantalla de título. Solo baja el detalle si sigue lento varias ventanas seguidas en la resolución
  mínima (bajarlo recompila los sombreadores: no se hace por un momento de carga). Parte de un nivel
  según la GPU.
- Modo zombi: tres niveles de detalle por zombi (24 mil, 7.7 mil y 2.4 mil triángulos sobre el mismo
  esqueleto; en GPUs integradas el costo de la horda era deformar vértices: con 24 zombis pasó de ~5 ms
  a menos de 1 ms). Los lejanos se animan a 20 Hz y solo los cercanos proyectan sombra. La sombra de la
  luna dibuja todo lo estático en una sola malla; los tablones de las barricadas son una malla
  instanciada; la navegación marca solo las celdas de cada colisionador (de 177 ms a 4 ms al abrir una
  puerta) y el campo de flujo tarda ~1 ms. Durante la pantalla del modo se dibuja todo el mapa una vez
  (en Windows, ANGLE termina de compilar cada sombreador en su primer dibujo real). La reserva de zombis
  se llena entre oleadas; la barra de la defensa es una malla instanciada por tipo de botella.
- Geometría estática unida por material y zona (pocas llamadas de dibujo), sombreadores precompilados
  y texturas subidas al cargar cada mapa, soldados y zombis reutilizados de una reserva: sin tirones al
  aparecer enemigos.
- Con un menú encima la escena no se dibuja (menos GPU y batería).
- El motor 3D (Three.js) va en un archivo aparte del código del juego: entre versiones queda en la
  caché del navegador y solo se descarga lo que cambió.
- En portátiles con dos tarjetas gráficas, la app de Windows pide la dedicada a Windows. En el
  navegador hay que asignarla en *Configuración de Windows → Sistema → Pantalla → Gráficos*.

## Progreso

La pantalla **Progreso** del menú reúne todo lo jugado:

- **Evaluaciones**: puntuación total de dianas y enemigos a lo largo del tiempo y una gráfica por fase.
- **Modos**: estrellas por mapa de campaña, oleada alcanzada en el modo infinito, índice del circuito y
  puntuación de cada ejercicio de coordinación.
- **Historial**: todas las sesiones de los cuatro modos, filtrables por modo.
- **Datos**: exportar todo (progreso y configuración) a un archivo `.json` e importarlo en otro navegador
  o computador. El progreso vive solo en el navegador (`localStorage`), así que conviene guardar una copia.

Las gráficas (`src/ui/charts.js`) son SVG sin librerías: paleta validada para daltonismo sobre la
superficie del juego, un solo eje, línea vertical y tooltip al pasar el puntero (también con teclado) y
una tabla de datos por gráfica.

## Mira y video

- **Retícula** (opción del menú principal, también desde el Arsenal y Configuración): editor de la mira
  pieza por pieza, con vista previa en vivo sobre cuatro fondos, zoom y *Simular disparo*:
  - líneas interiores (largo, grosor, separación, en forma de T) y líneas exteriores;
  - punto central (tamaño, opacidad, redondo o cuadrado) y anillo (radio, grosor, opacidad);
  - contorno (grosor, color, opacidad), color (muestras rápidas o a elección), opacidad general y
    rotación hasta 45° (cruz en X);
  - **mira dinámica**, que se abre exactamente lo que se desvían las balas al moverse, saltar o disparar
    en ráfaga;
  - una retícula por arma o la misma para todas, 12 presets, *Mis retículas* (guardar con nombre) y
    **códigos para compartir** (`RTC2;c=00ffa3;…`; los `RTC1` anteriores se siguen leyendo).
- **Calidad gráfica**: Alta, Media, Baja o Personalizada (resolución de render del 50 % al 100 %). Es lo
  que más FPS gana en equipos modestos.
- **Contador de FPS**: FPS promedio, ms por cuadro y *1 % low* (los cuadros más lentos, que se sienten
  como tirones), medidos con el reloj real.

## Publicación

`.github/workflows/deploy.yml` prueba, compila y publica el juego en **GitHub Pages** en cada push a `main`
(o a mano desde la pestaña *Actions*). Para activarlo, el dueño del repositorio debe ir una vez a
*Settings → Pages → Build and deployment → Source* y elegir **GitHub Actions**. Mientras no esté activado,
el flujo deja un aviso y no falla. Una vez activo, el juego queda en
`https://ju4nk1807.github.io/Reticula/`.

La versión compilada usa rutas relativas (`base: './'` en `vite.config.js`), así que también funciona en
cualquier subcarpeta o servidor estático.

## Sensibilidad

Valores de *yaw* por juego en `src/config/sensitivity.js`: Source/KovaaK's/CS2/Apex/Quake 0.022,
Valorant 0.07, Overwatch 2 y Call of Duty 0.0066, Fortnite (%) 0.005555. Se puede escribir la sensibilidad
de cualquiera de esos juegos o directamente los cm/360. En juego: `[` y `]` la ajustan un 3 %.
