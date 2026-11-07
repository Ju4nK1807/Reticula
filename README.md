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
  audio/Sfx.js            Sonidos procedurales con Web Audio API
  scenes/                 Mapas base (ShootingRange, TrainingYard), la Armería del menú y registry.js
  bots/                   Bots humanoides: hitboxes, strafing, peeks, agachadas, saltos y disparo
  modes/                  Mode.js (interfaz base), registry.js (registro), index.js (descubre los modos)
  modes/evaluation/       Evaluación: dos variantes de 5 fases + scoring → rango
  modes/campaign/         Campaña: mapas Bodega/Ciudad/Arena, 12 niveles, misiones, progreso y estrellas
  modes/coordination/     Coordinación ojo-mano: sala Cúpula, 4 ejercicios adaptativos, circuito y récords
  modes/endless/          Modo infinito: mapa Bastión, IA de asalto, oleadas, HUD propio y récords
  modes/zombies/          Modo zombi: Barrio en ruinas, zombis con campo de flujo, armería y potenciadores
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

Oleadas de zombis en el **Barrio en ruinas**: una plaza nocturna rodeada de edificios, con seis
callejones por donde entra la horda. No requiere evaluación.

- **Tipos**: caminante, corredor (rápido), reptante (bajo, difícil de acertar) y bruto (mucha vida y
  golpe fuerte; desde la oleada 5). Cada 6 oleadas, *noche de corredores*.
- **Puntos y armería**: cada impacto da puntos y matar da más, sobre todo a la cabeza, cuerpo a cuerpo
  o con granadas. Entre oleadas se abre la armería (`E` o botón táctil): subfusil, escopeta, rifle,
  francotirador, munición, granadas, botiquín y mejoras (blindaje, recarga rápida, munición expansiva).
  Se empieza con la pistola, de munición infinita; el resto de armas tiene munición de reserva.
- **Potenciadores** que sueltan los zombis: munición máxima, doble puntos, muerte instantánea, bomba y
  botiquín.
- **IA**: la horda rodea los obstáculos con un campo de flujo compartido (Dijkstra sobre una
  cuadrícula de 1 m, recalculado al moverse el jugador). Los zombis se separan entre sí y atacan con un
  gesto previo: retroceder a tiempo esquiva el golpe.
- La vida se regenera tras unos segundos sin recibir golpes. Flechas rojas junto a la mira avisan de
  zombis cerca y fuera de la vista.
- Igual que con los soldados, los modelos son solo la apariencia: los impactos los deciden hitboxes
  invisibles alineadas al cuerpo (el reptante, a ras del suelo).
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

- **Apuntar con las miras** (clic derecho) en todas las armas: aumento propio de cada arma, menos
  dispersión y caminar más lento. El francotirador conserva su mira telescópica.
- **Golpe cuerpo a cuerpo** (`V`) y **granadas** (`G`) en los modos que lo permiten (campaña, infinito
  y zombi; granadas solo en el modo zombi).
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
- Modo zombi: los zombis lejanos se animan a 20 Hz y solo los cercanos proyectan sombra; la reserva de
  zombis se llena entre oleadas (crear uno en plena oleada daba tirones); la barra de la defensa es una
  malla instanciada por tipo de botella.
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
