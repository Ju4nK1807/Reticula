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

### Publicar una versión
Crear una etiqueta `v1.0.0` (o lanzar el flujo **Apps** a mano desde *Actions*) compila el APK y el
instalador de Windows en GitHub Actions y los adjunta a un Release. Para que el APK salga **firmado**
(necesario para Google Play), el dueño del repositorio debe añadir estos secretos en
*Settings → Secrets and variables → Actions*: `ANDROID_KEYSTORE_BASE64` (el `.jks` en base64),
`ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` y `ANDROID_KEY_PASSWORD`. Sin ellos se publica el APK
de depuración, que se instala igual.

Los íconos y la pantalla de inicio se generan desde `assets/icon.svg` y `assets/icon-foreground.svg`.

## Gráficos

Estilo semi-realista con optimización fuerte: materiales PBR con texturas reales, iluminación física
con tono neutro (los colores de dianas y enemigos se respetan), sombras del sol y brillo (bloom) en luces
y neón. Todo depende de **Configuración → Video → Calidad**:

| Calidad | Texturas | Sombras | Efectos |
|---------|----------|---------|---------|
| Alta | 1K: color, relieve y ARM (oclusión, rugosidad, metal) | suaves, 2048 | bloom y antialiasing MSAA |
| Media | 512 (4 veces menos memoria) | 1024 | — |
| Baja | 512 solo de color | no | — |

En teléfonos y tabletas el juego arranca en calidad media. En *Personalizada* se elige por separado la
resolución de render y el detalle gráfico.

Cada mapa conserva su paleta: el color medio de cada textura se calibra al color de la paleta, así la
textura solo añade detalle. Las superficies están en `src/gfx/surfaces.json`. Para cambiar o añadir
una, se edita ese archivo y se ejecuta `python tools/textures.py` (necesita Pillow): descarga las
texturas, las convierte a WebP en 1K y 512 y calcula su color medio.

### Créditos
- Texturas: [Poly Haven](https://polyhaven.com) (CC0, dominio público).
- Disparos: grabaciones reales de [The Free Firearm Sound Library](https://opengameart.org/content/the-free-firearm-sound-library)
  (CC0): 1911, PPSh, AR-15, Benelli Nova y Mosin-Nagant, más un disparo a media distancia para los
  enemigos (`public/sounds/credits.json`). Si no cargan, suenan los disparos procedurales.
- Armas en primera persona: modelos de **Pichuliru** en [Poly Pizza](https://poly.pizza) (CC0). Fuentes y
  comando de optimización en `public/models/weapons/credits.json`. Se cargan bajo demanda; mientras
  llegan (o si fallan) se ve la versión de cajas.
- Enemigos: soldado animado de **Quaternius** en [Poly Pizza](https://poly.pizza) (CC0). Es solo la
  apariencia: los impactos los siguen decidiendo las hitboxes de siempre (invisibles), así la puntería y
  los rangos no cambian. Se une en una sola malla por color de enemigo (1 llamada de dibujo por soldado).

## Estructura

```
src/
  main.js                 Punto de entrada
  style.css
  core/                   Motor: Game (estados), Engine (render/FOV/overlay), Input (mouse y teclado),
                          PlayerController (mirada, movimiento, colisiones), Emitter
  combat/                 Ballistics (hitscan y línea de visión), Weapon, Viewmodel (arma en pantalla)
  effects/                Trazadoras, marcas de impacto y partículas
  config/                 defaults, ranks, sensitivity (conversión entre 8 juegos y cm/360)
  storage/                SaveStore (localStorage versionado con migraciones), profile (rango general)
  audio/Sfx.js            Sonidos procedurales con Web Audio API
  scenes/                 Mapas low-poly (ShootingRange, TrainingYard) y registry.js (registro de mapas)
  bots/                   Bots humanoides: hitboxes, strafing, peeks, agachadas, saltos y disparo
  modes/                  Mode.js (interfaz base), registry.js (registro), index.js (descubre los modos)
  modes/evaluation/       Evaluación: dos variantes de 5 fases + scoring → rango
  modes/campaign/         Campaña: mapas Bodega/Ciudad/Arena, 12 niveles, misiones, progreso y estrellas
  modes/coordination/     Coordinación ojo-mano: sala Cúpula, 4 ejercicios adaptativos, circuito y récords
  modes/endless/          Modo infinito: mapa Bastión, IA de asalto, oleadas, HUD propio y récords
  ui/                     HUD, mira, gráficas y pantallas (menú, progreso, ajustes, pausa, resultados, compatibilidad)
  stats/                  history.js: series e historial unificado para la pantalla de Progreso
  utils/                  math, format
tests/                    Pruebas de la lógica pura (guardado, rangos, sensibilidad, registros)
```

## Añadir un modo

Un modo nuevo vive en su propia carpeta y **no necesita editar Game.js ni el menú**:

1. Crea `src/modes/<modo>/` con una clase que extienda `Mode` (`src/modes/Mode.js` documenta el ciclo de
   vida: `start`, `update`, `onShoot`, `onLock`, `onPause`, `wantsLock`, `weaponEnabled`, `hitMeshes`,
   `bodyColliders`, `restartStage`, `dispose`). Sus fases pueden extender `modes/evaluation/Phase.js`
   para reutilizar estadísticas, puntos, vida, bots, dianas y spawns.
2. Si trae mapas propios, regístralos con `registerWorld('clave', () => new MiMapa())`
   (`src/scenes/registry.js`) y actívalos con `game.useWorld('clave')`.
3. Crea `src/modes/<modo>/index.js` y llama a `registerMode({ id, title, desc, order, locked, create })`.
   `modes/index.js` lo descubre solo. Si el `id` coincide con uno de `PLANNED_MODES`
   (`campaign`, `coordination`, `endless`), el botón "Próximamente" del menú se reemplaza solo.
4. Para récords y progreso usa `game.store.modeRecord('<id>')` y luego `game.store.persist()`.
   Si cambias la forma del guardado, sube `DEFAULT_SAVE.version` y añade el paso en
   `MIGRATIONS` (`src/storage/SaveStore.js`).

Bots más pequeños: `spawnBot({ scale: 0.8, ... })` escala modelo, hitboxes, línea de visión y colisión;
pasa el mismo `scale` a `randomOpenSpot` y `pickCoverSpot`.

## Fases

1. **Motor base + control FPS + evaluación inicial** ✅
2. **Campaña** ✅: un mapa por rango, 4 niveles por mapa con estrellas, desbloqueos, sugerencia de bajar de mapa.
3. **Coordinación ojo-mano** ✅: secuencias, colores, visión periférica, doble tarea.
4. **Modo infinito** ✅: oleadas, vida del jugador, botiquines, récords.
5. **Pulido** ✅: progreso e historial con gráficas, copia de seguridad, mira avanzada, calidad gráfica, rendimiento y publicación.

## Evaluación

Hay dos evaluaciones independientes, cada una con su propio rango. En ambas el jugador se mueve
(WASD, Shift caminar, C agacharse, Espacio saltar), las balas son visibles (trazadoras, impactos y
partículas), **cada fallo resta puntos** y el rifle tiene **cargador de 25 balas**: hay que recargar
con R (o se recarga solo al disparar con el cargador vacío, desactivable). Retroceso reinicia la fase.

### Dianas (clásica) — campo de tiro

| Fase | Duración | Qué mide |
|------|----------|----------|
| Flicking | 30 s | precisión, objetivos/s, tiempo por objetivo, escapados |
| Tracking | 30 s, automático | % sobre la diana, % de balas acertadas |
| Reacción | 8 intentos | reacción promedio y mejor, disparos anticipados |
| Multi-objetivo | 30 s | objetivos/s y precisión con 3 dianas a la vez |
| Precisión | 30 s | precisión con dianas pequeñas (fallar resta más que acertar) |

Pesos: flicking 22 %, tracking 20 %, reacción 18 %, multi-objetivo 20 %, precisión 20 %.

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

- **Mira**: cruz, cruz + punto, punto, círculo o T; color, largo, grosor, separación, opacidad, punto
  central independiente, contorno (grosor y color) y **mira dinámica**, que se abre exactamente lo que se
  desvían las balas al moverse, saltar o disparar en ráfaga. Incluye 7 presets y **códigos para
  compartir** (`RTC1;s=cross;c=00ffa3;…`).
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
