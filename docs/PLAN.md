# Player Tracker: plan de desarrollo

Este documento es el plan que debe seguir quien desarrolle la app (una persona o un agente de IA en el IDE). El concepto completo está en [IDEA.md](IDEA.md) y la hoja de partida del usuario en [valorant_daily_checklist.png](valorant_daily_checklist.png). Léelos antes de empezar.

## Contexto

App de escritorio personal para que un jugador de Valorant se registre a sí mismo cada día: partidas, hábitos, sueño, K/D, ACS y "feelings del día". Sustituye una hoja de cálculo ("VALORANT DAILY CHECKLIST · Road to Top 1") y añade gráficas e insights que crucen hábitos con rendimiento.

## Decisiones cerradas

No las cambies sin preguntar al usuario.

- App personal de un solo jugador, sin cuentas ni servidor. Solo escritorio (Windows es el objetivo principal).
- Exportar e importar **todos** los datos en un único archivo JSON, para cambiar de ordenador o hacer copia de seguridad.
- La **vista Tabla** es la pantalla principal: el día se rellena en filas y columnas, como en la hoja. Cada fila se abre como una página con el editor de feelings.
- **10mans y scrims** van en un registro aparte, una entrada por partida. Sus estadísticas no se mezclan con las de rankeds; la fila del día solo muestra el recuento.
- **Una gráfica por estadística** debajo de cada tabla (la diaria y la de scrims), siguiendo los filtros y el rango de fechas de la tabla.
- Estilo **glassmorphism** según la skill `glassmorphism` de [bergside/awesome-design-skills](https://github.com/bergside/awesome-design-skills) (archivos `skills/glassmorphism/SKILL.md` y `DESIGN.md`).
- K/D y ACS automáticos solo mediante la API no oficial de [HenrikDev](https://docs.henrikdev.xyz). Tracker.gg y la API oficial de Riot no sirven (Tracker no da acceso a Valorant; Riot no aprueba apps personales). La entrada manual es siempre la base.
- Interfaz en español.

## Tecnologías

| Parte | Elección |
| --- | --- |
| Escritorio | Tauri 2 |
| Interfaz | React + TypeScript (modo estricto) + Vite |
| Estilos | Tailwind CSS con los tokens de la skill de glassmorphism |
| Tabla editable | TanStack Table |
| Gráficas | Recharts |
| Editor de feelings | TipTap (guarda Markdown) |
| Base de datos | SQLite con `tauri-plugin-sql`, migraciones versionadas |
| Validación | Zod (importación JSON y CSV/Excel) |
| Lectura de Excel | SheetJS (`xlsx`) |
| Pruebas | Vitest + Testing Library |
| Calidad | ESLint + Prettier |
| CI | GitHub Actions: lint, pruebas y build del instalador de Windows |
| Peticiones HTTP (fase 4) | `tauri-plugin-http`, para evitar CORS |

Mantén el código Rust al mínimo: configuración de Tauri y plugins. La lógica va en TypeScript.

## Estilo visual

Tokens de la skill (no uses valores sueltos, define tokens en Tailwind):

- Colores: primary `#1856FF`, secondary `#3A344E`, success `#07CA6B`, warning `#E89558`, danger `#EA2143`, surface `#FFFFFF`, text `#141414`.
- Tipografía: Plus Jakarta Sans para texto y títulos, JetBrains Mono para números (K/D, ACS, horas) y etiquetas.
- Radios 4px y 8px; espaciado base 8px y 16px.
- Fondo oscuro con color; paneles translúcidos con `backdrop-filter: blur`, borde claro semitransparente y tarjetas tipo bento.
- Accesibilidad WCAG 2.2 AA: el texto de las tablas va sobre cristal casi opaco; el desenfoque fuerte solo en fondos y tarjetas. Foco visible y todo usable con teclado.
- Verde = cumplido o por encima de la media, rojo = fallado, naranja = aviso.

Dónde viven los tokens: Tailwind 4 se configura en CSS, así que están en el bloque `@theme` de [src/styles/index.css](../src/styles/index.css). El token `text` de la skill se llama `ink` (para no escribir `text-text`) y se añaden `canvas` para el fondo oscuro y `panel` para el fondo opaco de tablas y diálogos. Las utilidades `glass` (translúcido con desenfoque) y `glass-solid` (opaco, para tablas) están en el mismo archivo.

Las reglas de componentes, accesibilidad y tono están en [DESIGN.md](DESIGN.md). Antes de cualquier trabajo visual, carga la skill de glassmorphism (`typeui-glassmorphism` en Claude Code) y aplica esa guía.

## Datos

Una carpeta de datos elegida por el usuario contiene `tracker.db` (SQLite) y `attachments/` (imágenes del editor).

| Tabla | Campos | Fase |
| --- | --- | --- |
| `field_definitions` | `id`, `key`, `label`, `type`, `group`, `order`, `thresholds` (JSON), `archived` | 1 |
| `days` | `date` (PK, `YYYY-MM-DD`), `values` (JSON por `key`), `feelings_md`, `tags` | 1 |
| `scrim_matches` | `id`, `date`, `kind` (`10mans` o `scrim`), `opponent`, `map`, `agent`, `result`, `rounds_won`, `rounds_lost`, `kills`, `deaths`, `acs`, `vod_url`, `notes` | 1 |
| `settings` | `key`, `value` (carpeta de datos, objetivos, Riot ID, región) | 1 |
| `ranked_sessions` | `id`, `date`, `map`, `agent`, `result`, `kills`, `deaths`, `score`, `rounds`, `source` (`manual` o `henrikdev`), `external_match_id` (único) | 4 |
| `notes` | `id`, `title`, `body_md`, `links` | 4 |

Tipos de campo: `number`, `decimal`, `duration` (minutos), `scale` (0-100), `tristate` (hecho / descanso / no hecho), `bool`, `text`, `tag`. Hay un noveno tipo interno, `scrim_count`, para la columna de 10mans/scrims: no guarda nada en el día, muestra el recuento de `scrim_matches` y el usuario no puede crear campos de ese tipo.

Detalles de implementación (fase 1):

- La ruta de la carpeta de datos no se guarda en `settings` (esa tabla está dentro de la carpeta), sino en `config.json` de la carpeta de configuración de la app. En el primer arranque la app pregunta dónde crearla y propone `Documentos/Player Tracker`.
- Las migraciones están en [src/data/migrations.ts](../src/data/migrations.ts) y se aplican desde TypeScript al abrir la base de datos; las aplicadas se apuntan en la tabla `schema_migrations`.
- En `days.values`, "sin dato" es la ausencia de la clave. `tristate` se guarda como `done`, `rest` o `missed`.
- `thresholds` es `null` (sin color), `{ "mode": "average" }` (verde si iguala o supera la media del jugador) o `{ "mode": "fixed", "direction": "higher" | "lower", "good": n, "warn": n | null }`. Por defecto: sleep score verde desde 80 y naranja desde 70; horas de sueño verde desde 7h y naranja desde 6h; K/D y ACS respecto a la media. Se editan en Ajustes.
- Las copias de `tracker.db` (respaldo antes de importar, cambio de carpeta) se hacen con `VACUUM INTO`, porque SQLite mantiene los últimos cambios en `tracker.db-wal`.

Plantilla por defecto = la hoja del usuario, por grupos:

- Juego: Rankeds (`number`), 10mans/scrims (calculado desde `scrim_matches`), DMs (`number`), Kovaaks (`number`).
- Hábitos core: Gimnasio (`tristate`), Suplementación (`bool`), Nutrición (`bool`).
- Sueño: Sleep score (`scale`), Horas de sueño (`duration`).
- Rendimiento: K/D (`decimal`), ACS (`number`).
- Feelings del día: editor de la página del día.

Valores vacíos o `X` = "sin dato": no cuentan en medias ni gráficas.

### JSON de exportación

```json
{
  "format": "player-tracker",
  "version": 1,
  "exportedAt": "2026-10-01T22:00:00Z",
  "fieldDefinitions": [],
  "days": [],
  "scrimMatches": [],
  "weeklyReviews": [{ "weekStart": "2026-09-14", "conclusions": ["", "", ""] }],
  "rankedSessions": [],
  "notes": [],
  "settings": {},
  "attachments": [{ "name": "captura.png", "dataBase64": "..." }]
}
```

- La clave de la API de HenrikDev **no** se exporta.
- Al importar: validar todo con Zod antes de escribir, copiar `tracker.db` como respaldo, y si hay fechas repetidas preguntar si sustituir o conservar.
- Las imágenes de `attachments/` van incrustadas en base64 en la lista `attachments`, para que la copia siga siendo un único archivo. Un JSON sin esa lista también es válido.
- La elección de sustituir o conservar se aplica a los días, las partidas y las revisiones semanales que ya existen. Los campos (emparejados por `key`) y los ajustes del archivo siempre sustituyen a los actuales.
- `weeklyReviews` (fase 2) es opcional: un archivo anterior que no la traiga sigue siendo válido.

### Gráficas y resúmenes (fase 2)

Las reglas viven en [src/domain/stats.ts](../src/domain/stats.ts) y son las mismas en las gráficas, el Calendario, el Dashboard y la Revisión semanal:

- **Total o media**: un campo `number` sin umbrales es volumen (rankeds, DMs, Kovaaks) y se suma; el resto de campos numéricos (sueño, K/D, ACS) se promedia. Los días sin dato no cuentan.
- **Qué gráfica lleva cada campo**: volumen y recuento de scrims, barras por día; campos con umbrales fijos, línea con su objetivo (el umbral verde); el resto de numéricos, línea por día con la media móvil de 7 días naturales; hábitos, porcentaje de cumplimiento por semana. Los campos de texto no tienen gráfica.
- **Cumplimiento de un hábito**: días cumplidos entre días con dato. En un `tristate`, el descanso cuenta como cumplido.
- **Semanas**: de lunes a domingo.
- **Rachas**: días naturales seguidos; un día sin registrar la rompe, salvo hoy mientras no se haya rellenado.
- **Dashboard**: compara los últimos 7 o 30 días (acabando hoy) con el periodo anterior de la misma longitud.
- **Revisión semanal**: las tres conclusiones se guardan en la tabla `weekly_reviews` (`week_start`, `conclusions`), creada por la migración 2.

### Insights (fase 3)

Tienen su propia sección en la barra lateral, entre Dashboard y Revisión semanal. Las reglas están en [src/domain/insights.ts](../src/domain/insights.ts):

- **Métricas de rendimiento**: los campos numéricos coloreados respecto a la media del jugador (K/D y ACS en la plantilla). El usuario elige cuál mirar.
- **Comparaciones**: media de la métrica en dos grupos de días. Por hábito (hecho frente a no hecho; en un `tristate`, el descanso va con "no hecho"), con todos los hábitos cumplidos frente a alguno sin cumplir, por objetivo (campos con umbral fijo, como el sueño: llega o no llega al umbral verde) y por volumen (campos que se suman: por encima o no de su mediana). Solo cuentan los días que tienen el factor y la métrica.
- **Pocos datos**: aviso cuando algún grupo tiene menos de 10 días.
- **Saturación**: reglas guardadas en el ajuste `saturation.rules` y editables en la propia vista. Por defecto, 5 días naturales seguidos con más de 8 rankeds, o `#saturado` 2 veces en 7 días. Un aviso está activo si su último día es de anteayer en adelante; los demás quedan como historial.
- **Etiquetas**: días con cada etiqueta y media de la métrica esos días frente al resto.
- **Preparación de hoy** (0 a 100): 40 % el descanso de hoy (lo cerca que queda cada campo con objetivo de su umbral verde), 30 % los hábitos cumplidos en los 3 días anteriores y 30 % la carga de esos días (100 si no supera lo habitual, 0 si llega al límite de la regla de saturación). Las partes sin datos no cuentan y el resto se reparte su peso. Desde 75, "día para grindear"; desde 50, "día normal"; por debajo, "día de pocas partidas".
- **Comprobar un insight**: cada uno tiene un botón "Ver días" que abre la Tabla mostrando solo los días en los que se basa.

### Rankeds, notas y objetivos (fase 4, sin la sincronización)

- **Rankeds** (sección propia, tras la Tabla): una fila por partida en `ranked_sessions`, con gráficas de resultados, K/D y ACS por mapa y por agente. El K/D y el ACS de un grupo se calculan sobre los totales (kills entre muertes, puntuación entre rondas), como hace el juego. Al apuntar a mano se escribe el ACS y las rondas; se guarda la puntuación total (`score` = ACS × rondas).
- **Del registro al día**: la página del día resume sus partidas y el botón "Usar estas cifras en el día" copia el recuento, el K/D y el ACS a los campos `rankeds`, `kd` y `acs`. No se copian solas: los campos del día siguen siendo manuales.
- **Notas** (sección propia): título y texto en Markdown. `[[Título]]` enlaza a otra nota (sin distinguir mayúsculas ni acentos) y `[[14/09/2026]]` o `[[2026-09-14]]` a un día. Los destinos se guardan en `notes.links`. Cada nota muestra a qué enlaza y quién la menciona (otras notas y los feelings de los días); la página del día muestra las notas que lo mencionan o que menciona.
- **Objetivos**: lista en el ajuste `goals` (`id`, `title`, `deadline`, `done`), editable en el Dashboard, con los días que faltan. Al estar en los ajustes, viajan en la exportación.
- La migración 3 crea `ranked_sessions` (con `external_match_id` único) y `notes`. Al importar un JSON, una partida con el mismo `external_match_id` que una local se trata como la misma, aunque su `id` sea otro.

### Sincronización con HenrikDev (fase 4)

Resultado de la prueba aislada del 02/10/2026 con la cuenta del jugador:

- La clave gratuita permite 30 puntos por minuto, y cada petición a Riot que HenrikDev hace por detrás también cuenta. `GET /valorant/v4/matches` devuelve 10 partidas por llamada y gasta unos 11 puntos, así que traer un día de hace una semana costaría varios minutos de espera.
- `GET /valorant/v1/stored-matches/{region}/{name}/{tag}` devuelve hasta 60 partidas por unos 2 puntos, con todo lo necesario: id, mapa, agente, kills, muertes, puntuación total y rondas de cada equipo. Sus cifras por día coinciden con las de `v4/matches` en los 9 días comparados, así que la app usa este endpoint en vez del que proponía el plan.
- Las cifras coinciden con la hoja: el 26/09 da 8 rankeds, K/D 1.16 y ACS 202 (la hoja tiene 8, 1.2 y 202).
- Las customs sí aparecen (`mode=custom`), pero la cuenta no tiene ninguna desde abril de 2026: los 10mans de septiembre que hay en la hoja no llegan por esta vía.

Cómo funciona:

- En Ajustes se guardan el Riot ID (`riot.id`), la región (`riot.region`) y la clave (`henrikdev.apiKey`, que nunca se exporta). "Probar conexión" pide la cuenta.
- El botón "Sincronizar" de la página del día pide las rankeds y las customs de esa fecha, pasando páginas hasta dejar atrás el día. La fecha de una partida es la fecha local en la que empezó.
- Cada ranked nueva se guarda en `ranked_sessions` con su `external_match_id`. Las que ya estaban no se tocan, para respetar lo corregido a mano; por eso repetir la sincronización no duplica.
- Las customs nuevas van a `scrim_matches` como `10mans`, con id `henrikdev:<id de la partida>`. Los duelos de práctica (mapas "Skirmish") se descartan.
- Tras sincronizar, el recuento, el K/D (kills totales entre muertes totales) y el ACS (puntuación total entre rondas totales) del día se escriben en los campos `rankeds`, `kd` y `acs`. Siguen siendo editables.
- Las peticiones salen por `tauri-plugin-http`, con permiso solo para `https://api.henrikdev.xyz`, y únicamente al pulsar "Sincronizar" o "Probar conexión".

### Importar la hoja

- La columna de 10mans/scrims de la hoja solo tiene un número por día. Al importarla se crean partidas vacías en `scrim_matches` (tipo `10mans`, nota "Importada de la hoja") hasta igualar ese número, para que el recuento del día coincida y el usuario pueda rellenarlas después.
- Una celda que no se entiende deja ese campo sin dato; una fila sin fecha válida o con la fecha repetida no se importa. Ambas cosas se muestran antes de guardar.

## Fases

Trabaja una fase cada vez. Al acabar cada fase: pruebas en verde y un commit por bloque lógico en su propia rama. El usuario decidió el 02/10/2026 encadenar las fases sin parar a probar entre una y otra: las pruebas con datos reales y los cambios se harán cuando haya una versión 1.0. Los criterios "Terminada cuando" que dependen del uso real quedan para entonces.

Estado: las cinco fases (0 a 4) están implementadas. Queda la ronda de pruebas con datos reales y los cambios que salgan de ella, antes de la versión 1.0.

### Fase 0: cimientos

- Crear el proyecto Tauri 2 + React + TypeScript + Vite en la raíz del repositorio.
- Configurar Tailwind con los tokens del estilo visual, fuentes incluidas en el proyecto (no desde internet).
- Layout base: fondo, barra lateral de cristal con las secciones (Tabla, Scrims y 10mans, Calendario, Dashboard, Revisión semanal, Ajustes) y área de contenido vacía.
- ESLint, Prettier, Vitest y scripts `npm run lint`, `npm test`, `npm run tauri dev`, `npm run tauri build`.
- GitHub Actions: lint y pruebas en cada push; build del instalador de Windows.
- **Terminada cuando**: `npm run tauri dev` abre la ventana con el estilo de cristal y la barra lateral, y el CI pasa.

### Fase 1: sustituir la hoja

- Base de datos y migraciones con las tablas de la fase 1; sembrar la plantilla de campos por defecto.
- Vista Tabla: una fila por día, columnas agrupadas como en la hoja, celdas editables según el tipo, filtros, orden, rango de fechas y colores por umbral. Crear el día de hoy con un clic.
- Página del día: los mismos campos en formulario y el editor TipTap de feelings; las `#etiquetas` se extraen a `tags`.
- Registro de Scrims y 10mans: su propia tabla editable; el recuento del día se calcula.
- Ajustes: carpeta de datos, edición de campos (añadir, renombrar, reordenar, archivar).
- Importar la hoja en CSV o Excel con vista previa: mapear columnas, entender `6H49min`, `8H9min`, `9H` como duraciones, `Descanso` en gimnasio como `tristate`, checks y cruces como `bool`, `X` como sin dato, fechas `DD/MM/YYYY`. Mostrar las filas que no se entiendan antes de guardar.
- Exportar e importar JSON según el formato de arriba.
- Pruebas de: parseo de duraciones y fechas, importador de la hoja, ida y vuelta del JSON (exportar e importar da los mismos datos), cálculos de recuentos.
- **Terminada cuando**: el usuario importa sus días desde el 14/09/2026, rellena una semana solo con la app, exporta e importa en otro equipo sin perder nada.

### Fase 2: ver el progreso

- Bajo cada tabla, una gráfica por estadística que sigue filtros y fechas: K/D y ACS en línea con media móvil de 7 días; sueño (horas y score) en línea con el objetivo marcado; rankeds, DMs y Kovaaks en barras por día; hábitos como porcentaje de cumplimiento semanal; scrims con K/D y ACS por partida y resultados por mapa.
- Calendario: mapa de calor mensual de la métrica elegida.
- Dashboard: tarjetas bento con tendencias y rachas, rankeds y scrims separados.
- Revisión semanal: nota guiada con el resumen de la semana y 3 conclusiones del usuario.
- **Terminada cuando**: cada columna numérica tiene su gráfica y la revisión de la semana 14-20/09 coincide con un cálculo a mano (47 rankeds, sueño medio 7h19, K/D medio 1.15).

### Fase 3: insights

- Comparar rendimiento (K/D, ACS) con y sin cada hábito, y por tramos de sleep score (por ejemplo, menos de 80 frente a 80 o más). Aviso de "pocos datos" con menos de 10 días por grupo.
- Avisos de saturación con reglas configurables (por defecto: 5 días seguidos con más de 8 rankeds, o `#saturado` 2 veces en una semana).
- Conteo de `#etiquetas` y su relación con el rendimiento.
- Puntuación de preparación del día a partir de sueño, hábitos y carga reciente.
- Cada insight enlaza a los días en los que se basa.
- **Terminada cuando**: cada insight se puede comprobar contra la tabla.

### Fase 4: extras

- Empezar con una prueba aislada de HenrikDev con la cuenta del usuario: que lleguen sus partidas, límites de la clave y si aparecen las customs de 10mans. Informar al usuario antes de construir encima.
- Sincronización: en Ajustes, Riot ID (`nombre#tag`), región y clave (guardada fuera del JSON exportable). Botón "Sincronizar" en el día: trae las partidas de esa fecha (endpoint `GET /valorant/v4/matches/{region}/{platform}/{name}/{tag}`, campos `stats.kills`, `stats.deaths`, `stats.score`, rondas y `started_at`), calcula K/D = kills / deaths y ACS = score / rondas, crea `ranked_sessions` sin duplicar (`external_match_id` único). Las customs van a `scrim_matches`. Todo editable a mano.
- Sesiones de ranked por mapa y agente, notas sueltas con enlaces `[[ ]]` y backlinks, y objetivos.
- **Terminada cuando**: sincronizar un día real da el mismo K/D y ACS que el juego y repetirlo no duplica partidas.

## Reglas de trabajo

- TypeScript estricto, sin `any`. Lógica de cálculo en funciones puras con pruebas.
- Nada de telemetría ni llamadas a internet salvo HenrikDev en la fase 4, y solo cuando el usuario pulsa "Sincronizar".
- Ante una decisión que cambie lo que el usuario ve o sus datos, pregunta antes.
- Mantén este plan actualizado si algo cambia.
