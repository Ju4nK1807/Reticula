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

Requisitos: navegador con WebGL 2 y Pointer Lock (Chrome o Edge recomendados: son los únicos que dan
raw input), mouse y teclado. Si falta algo, el juego lo avisa al abrir.

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
  modes/campaign/         (Fase 2)
  modes/coordination/     (Fase 3)
  modes/endless/          (Fase 4)
  ui/                     HUD, mira, pantallas (menú, ajustes, pausa, resultados, compatibilidad)
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
2. Campaña: bots, un mapa por rango, 3-5 niveles por mapa, desbloqueos, sugerencia de bajar de rango.
3. Coordinación ojo-mano: secuencias, colores, visión periférica, doble tarea.
4. Modo infinito: oleadas, vida del jugador, récords.
5. Pulido: historial de progreso, más opciones de mira, ajustes de rendimiento.

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

## Sensibilidad

Valores de *yaw* por juego en `src/config/sensitivity.js`: Source/KovaaK's/CS2/Apex/Quake 0.022,
Valorant 0.07, Overwatch 2 y Call of Duty 0.0066, Fortnite (%) 0.005555. Se puede escribir la sensibilidad
de cualquiera de esos juegos o directamente los cm/360. En juego: `[` y `]` la ajustan un 3 %.
