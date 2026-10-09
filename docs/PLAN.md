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
- K/D y ACS automáticos: solo serían posibles con la API no oficial de [HenrikDev](https://docs.henrikdev.xyz). Se hizo en la fase 4 y se retiró el 03/10/2026 (ver "Sincronización con HenrikDev"). Tracker.gg no da acceso a Valorant y Riot no aprueba apps de uso personal. La fase 7 usa la API oficial de Riot registrando MikaLog como producto público, con un servidor propio gratuito y RSO. La entrada manual es siempre la base.
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

El usuario cambió el aspecto el 02/10/2026 con una imagen de referencia: cristal claro sobre un degradado malva y verde, acento verde y controles en forma de píldora. Sustituye al cristal oscuro con los colores de la skill que tenían las fases 0 a 4. La guía completa y los valores están en [DESIGN.md](DESIGN.md); en resumen (no uses valores sueltos, define tokens en Tailwind):

- Colores: primary `#0A8158` (acento), fondo en degradado de `#C9A4CB` a `#D8F5BC`, success `#0A8158`, warning `#B4580F`, danger `#D11A3A`, surface `#FFFFFF`, text `#141414`, y `#1856FF` para las series de las gráficas.
- Tipografía: Plus Jakarta Sans para texto, títulos y etiquetas; JetBrains Mono solo para números que se alinean (tablas, ejes, fechas).
- Píldoras en botones, campos y pestañas; tarjetas con radio de 18px; espaciado base 8px y 16px.
- Fondo claro con color; paneles blancos translúcidos con `backdrop-filter: blur`, borde blanco, sombra suave y tarjetas tipo bento.
- Accesibilidad WCAG 2.2 AA: el texto de las tablas va sobre un panel opaco; el desenfoque solo en fondos y tarjetas. Foco visible y todo usable con teclado.
- Verde = cumplido o por encima de la media, rojo = fallado, naranja = aviso.

Dónde viven los tokens: Tailwind 4 se configura en CSS, así que están en el bloque `@theme` de [src/styles/index.css](../src/styles/index.css). El token `text` de la skill se llama `ink` (para no escribir `text-text`) y se añaden `canvas` y `lime` para el fondo, `panel` para el fondo opaco de tablas y diálogos y `chart` para las gráficas. Las utilidades `glass` (translúcido con desenfoque) y `glass-solid` (opaco, para tablas) están en el mismo archivo.

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

### Sincronización con HenrikDev (fase 4, retirada)

**Retirada el 03/10/2026** por decisión del usuario: pedir y guardar una clave era complicar la app de más por ahora. Se quitaron el panel de Ajustes, el botón "Sincronizar" del día, el paso del tutorial, `tauri-plugin-http` y su permiso; la app ya no hace ninguna llamada a internet. El K/D y el ACS se escriben a mano o salen de las partidas apuntadas en Rankeds. Se conserva lo que protege datos ya guardados: las partidas sincronizadas siguen marcadas como `henrikdev` y, si una instalación tenía la clave en sus ajustes, sigue sin exportarse. Lo que sigue describe cómo funcionaba, por si se retoma (el código está en el historial de git, hasta el PR #14).

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

Estado (03/10/2026): las fases 0 a 5 están implementadas. La fase 6 (licencia y avisos legales) también. Antes de publicar la versión 1.0 queda la ronda de pruebas con datos reales y los cambios que salgan de ella. La fase 7 (edición para Saiz y API oficial de Riot) está planificada el 09/10/2026 y sus decisiones están cerradas.

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

### Fase 5: camino a la 1.0

Ideas que el usuario pidió el 03/10/2026: nombre y logo, exportar la información, tutorial al instalar e instalador. Van en este orden, porque el tutorial y el instalador ya muestran el nombre y el logo. Cada bloque en su propia rama, como las fases anteriores.

#### 5.1 Nombre y logo

- **Nombre**: **MikaLog**, elegido por el usuario el 03/10/2026: su nick, MikaEl, y "log" de registro diario. Sin "Valorant", "Riot" ni nombres de rangos, que son marcas de Riot. Vive en `src/app/brand.ts` (`APP_NAME`); los archivos que la app propone al exportar empiezan por `mikalog-`.
- **Logo**: el que eligió el usuario el 03/10/2026: cuadrado blanco con esquinas redondeadas y, en lila `#BB94FA`, una mira (anillo con cuatro marcas) cuyo centro es un check: apuntar y cumplir hábitos en una sola marca. Sustituye al primer logo, de degradado malva y lima con check verde.
- Archivo maestro en `src-tauri/icons/logo.svg` (1024 × 1024). Los PNG, `icon.ico` e `icon.icns` se generan con `npx tauri icon src-tauri/icons/logo.svg`; no se editan a mano.
- Dónde aparece el nombre: `productName` y título de la ventana en `tauri.conf.json`, `<title>` de `index.html`, cabecera de la barra lateral, pantalla de bienvenida y textos de Ajustes. El logo, en la barra lateral, la bienvenida, el icono de la ventana y el instalador.
- **Lo que no cambia** al renombrar, para no romper instalaciones ni copias: el `identifier` (`com.playertracker.desktop`, de él depende dónde está `config.json`), el `"format": "player-tracker"` del JSON y las carpetas de datos que ya existen. Solo la carpeta propuesta en el primer arranque pasa a `Documentos/MikaLog`.
- **Terminada cuando**: el nombre y el logo se ven en la ventana, la barra de tareas y el instalador, y una instalación anterior abre sus datos sin preguntar de nuevo.

#### 5.2 Exportar la información

El JSON (fase 1) sigue siendo la copia completa para cambiar de ordenador. Esta parte añade exportar para **mirar y compartir** los datos fuera de la app, y copias automáticas.

- **Excel (.xlsx)** en Ajustes > Exportar, con SheetJS (ya está en el proyecto). Una hoja por registro: Días (columnas como la hoja del usuario: fecha `DD/MM/YYYY`, duraciones `7H19min`, gimnasio `Descanso`, checks como ✓ y ✗, celdas vacías sin dato), Scrims y 10mans, Rankeds y Revisiones semanales. Los feelings van como texto plano.
- **Ida y vuelta**: la hoja Días tiene el mismo formato que la hoja original, así que el importador de la fase 1 la vuelve a leer sin perder nada. Hay prueba de ello.
- **CSV** como alternativa: un archivo por registro (UTF-8 con BOM y `;` como separador, para que Excel en español lo abra bien).
- **Exportar lo que ves**: botón en la barra de la Tabla, Scrims y Rankeds que exporta las filas con los filtros y el rango de fechas actuales, en Excel o CSV.
- **Copias automáticas**: al abrir la app, si la última copia tiene 7 días o más, se guarda un JSON completo en `<carpeta de datos>/copias/` y se conservan las 8 últimas. Se puede desactivar o cambiar la frecuencia en Ajustes. La copia nunca lleva la clave de HenrikDev.
- La lógica de formato va en `src/domain/` (puro, con pruebas) y la escritura de archivos en `src/data/`.
- Para después de la 1.0, si el usuario lo pide: la revisión semanal o el Dashboard como PDF o imagen para compartir.
- **Terminada cuando**: el Excel exportado se abre en Excel y en Google Sheets con los mismos números que la app, y reimportarlo da los mismos días.

Cómo quedó hecho:

- `src/domain/sheetExport.ts` monta las hojas (filas de texto y números) y el CSV; `src/data/sheetWrite.ts` las pasa a bytes de Excel o CSV; `src/app/exportFiles.ts` pone el nombre (`mikalog-<registro>-<fecha>`) y abre el diálogo de guardar.
- En Ajustes hay dos tarjetas: «Exportar a Excel o CSV» y «Copias automáticas» (activar, frecuencia, última copia y «Hacer una copia ahora»). El botón «Exportar lo que ves» (`ExportButton`) está en la Tabla, Scrims y Rankeds y respeta filtros y orden.
- Las copias automáticas se llaman `copia-YYYY-MM-DD.json` y viven en `copias/`; `backups/` sigue siendo la carpeta de las copias de `tracker.db` previas a una importación. La configuración es el ajuste `backup.auto`. Si la copia falla, la app lo dice en el aviso de error general.
- `Platform` gana `saveFile` (archivos binarios) y `backupFolder` (listar, escribir y borrar en `copias/`); por eso las capacidades de Tauri incluyen ahora `fs:allow-remove`.
- Pendiente de la ronda de pruebas: abrir el Excel exportado en Excel y en Google Sheets, y pasar por el diálogo nativo de guardar (las pruebas automáticas llegan hasta los bytes del archivo).

#### 5.3 Tutorial al instalar

Se muestra la primera vez, justo después de elegir la carpeta de datos, y solo si la carpeta no tiene días. Se puede saltar en cualquier paso y repetir desde Ajustes > "Ver el tutorial".

1. **Bienvenida**: logo, nombre y una frase de qué hace la app.
2. **Cómo empezar**: tres opciones en tarjetas. Importar la hoja (abre el importador de Excel/CSV), cargar una copia JSON (abre la importación) o empezar de cero (crea el día de hoy).
3. ~~**Sincronización (opcional)**~~: retirado junto con la sincronización; el tutorial queda en bienvenida, cómo empezar y recorrido.
4. **Recorrido guiado**: globos de cristal que señalan, uno a uno, la Tabla (rellenar el día), la página del día (feelings y #etiquetas), Scrims y 10mans, Dashboard, Insights y Ajustes > Exportar.

- Hecho sin librerías: un componente propio de globos sobre los elementos reales, con el estilo de [DESIGN.md](DESIGN.md), usable con teclado (flechas, Esc para salir) y con el foco dentro del globo.
- Que ya se ha visto se guarda en `config.json` (por equipo), no en la base de datos: una carpeta importada de otro ordenador no lo vuelve a mostrar, porque ya tiene días.
- Pruebas de interfaz con la app entera: aparece con una carpeta vacía, no aparece con datos, saltar funciona y Ajustes lo repite.
- **Terminada cuando**: una persona que no conoce la app la instala, sigue el tutorial y rellena su primer día sin ayuda.

Cómo quedó hecho:

- `src/views/tutorial/Tutorial.tsx`: dos pasos en un diálogo (bienvenida y cómo empezar) y un recorrido de seis globos. Los globos buscan su elemento por el atributo `data-tour` (`nav-<sección>` en la barra lateral y `add-day` en el botón de añadir día).
- La opción de «cómo empezar» se recuerda y se ejecuta al terminar el recorrido: importar la hoja y cargar una copia llevan a Ajustes; empezar de cero crea el día de hoy y abre su página. Saltar o salir no hace nada de eso.
- `config.json` guarda `tutorialSeen` junto a `dataFolder`; `Platform` lo expone como `tutorialSeen` y `markTutorialSeen()`. El archivo ya no se reescribe en cada arranque si no cambia nada: una escritura cortada a medias lo dejaba vacío y la app volvía a preguntar por la carpeta.
- Ajustes > «Primeros pasos» > «Ver el tutorial» lo repite.

#### 5.4 Instalador y versión 1.0

Ya existe: `npm run tauri build` genera un instalador NSIS en español y el CI lo sube como artefacto en cada push. Falta dejarlo listo para instalar y actualizar.

- **Versión única**: `version` de `tauri.conf.json` apunta a `../package.json`, para no mantener dos números. La 1.0 sale como `1.0.0`.
- **Instalación sin permisos de administrador**: `installMode: "currentUser"` (el valor por defecto de Tauri, que se deja escrito para que no cambie), con acceso directo en el menú Inicio y opción de acceso en el escritorio.
- **Imágenes del instalador** con el logo y el degradado (cabecera 150 × 57 y lateral 164 × 314, en BMP), e icono del instalador.
- **WebView2**: se mantiene el descargador por defecto (Windows 10 y 11 ya lo traen). El instalador sin conexión (`offlineInstaller`) solo si el usuario lo pide, porque añade unos 130 MB.
- **Desinstalar no borra los datos**: la carpeta de datos está en Documentos, fuera de la carpeta de la app. Se dice en el último paso del desinstalador.
- **Publicar versiones**: workflow nuevo que, al subir una etiqueta `v*` (por ejemplo `v1.0.0`), compila el instalador y crea una Release de GitHub con el `.exe` y las notas de la versión. El CI actual sigue igual.
- **Actualizar**: se instala la versión nueva encima de la anterior y los datos se conservan. Sin actualizador automático en la 1.0, porque comprobar versiones es una llamada a internet que las reglas de trabajo no permiten; si el usuario lo quiere, `tauri-plugin-updater` con un botón "Buscar actualizaciones" que solo se usa al pulsarlo.
- **Firma de código**: el instalador va sin firmar, así que Windows SmartScreen avisa la primera vez ("Windows protegió tu PC" > "Más información" > "Ejecutar de todas formas"). Se explica en el README. Firmarlo cuesta dinero (por ejemplo Azure Trusted Signing, de pago mensual) y solo compensa si la app se reparte a otras personas.
- README: sección "Instalar" con el enlace a la última Release y el aviso de SmartScreen.
- Cómo quedó hecho: la versión es `1.0.0` en `package.json` (de ahí la lee `tauri.conf.json`) y en `Cargo.toml`; las imágenes del instalador se generan con `scripts/installer-images.ps1` en `src-tauri/installer/`; el aviso de que desinstalar no borra los datos es un gancho de NSIS (`src-tauri/installer/hooks.nsh`), que no sale al actualizar; `.github/workflows/release.yml` publica la Release al subir una etiqueta `v*` y falla si la etiqueta no coincide con `package.json`.
- **Terminada cuando**: en un Windows limpio, el `.exe` de la Release instala la app sin pedir administrador, la abre con el tutorial, instalar la versión siguiente encima conserva los datos y desinstalar no borra la carpeta de datos.

### Fase 6: licencia y avisos legales para publicar la 1.0

El usuario decidió el 03/10/2026 publicar la app para cualquiera. El repositorio ya es público, pero no tiene licencia, así que hoy nadie puede usar ni copiar el código legalmente. Esta fase añade la licencia y los avisos, sin "términos y condiciones": la app es gratuita, no tiene cuentas ni pagos y no se conecta a internet, y la cláusula "sin garantía" de la licencia cubre lo que cubrirían.

Decisiones cerradas:

- **Licencia del código**: GPL-3.0-or-later (copyleft: quien reparta una versión modificada debe publicar su código con la misma licencia).
- **Créditos obligatorios**: la GPL ya obliga a conservar los avisos de copyright. Además se añade un término adicional de los que permite su sección 7(b): toda versión, modificada o no, debe conservar en su pantalla "Acerca de" la atribución al autor original y el enlace al repositorio.
- **Autor**: Miguel Ángel Díaz Gutiérrez (MikaEl). Aviso: `Copyright (C) 2026 Miguel Ángel Díaz Gutiérrez (MikaEl)`.
- **Contacto**: `miguelangeldiaztic@gmail.com` y las incidencias de GitHub (`https://github.com/MiguelAngelDiazTIC/Player-Tracker-App/issues`).
- **Nombre y logo**: quedan fuera de la licencia, con todos los derechos reservados. Otros pueden reutilizar el código, pero no publicar otra app llamada MikaLog ni con su logo.
- Las licencias Creative Commons (CC BY y similares) no se usan: no están pensadas para software.

#### 6.1 Licencia y avisos en el repositorio

- `LICENSE`: el texto oficial de la GPL-3.0, sin cambios.
- `NOTICE.md`: el aviso de copyright, el término adicional de atribución (sección 7(b)), la reserva del nombre y el logo, el aviso de Riot y la nota de privacidad. Es el texto del que salen los de la app.
- `THIRD-PARTY-NOTICES.md`: licencias y avisos de copyright de lo que se distribuye con la app (paquetes de npm que entran en el instalador, las dos fuentes y los crates de Rust). Lo genera `scripts/third-party-notices.mjs` (`npm run notices`); no se edita a mano. El script falla si aparece una licencia que no esté en la lista de compatibles con GPL-3.0 (MIT, ISC, BSD, Apache-2.0, OFL-1.1, MPL-2.0, Zlib, Unicode, CC0, 0BSD), para enterarse al añadir una dependencia.
- `package.json` y `Cargo.toml`: `license` = `GPL-3.0-or-later`, autor y repositorio. `tauri.conf.json`: `publisher` y `copyright`.
- README: sección "Licencia y avisos" con un resumen de la licencia en dos frases, los créditos que hay que conservar, el aviso de Riot, la privacidad y el contacto.
- **Terminada cuando**: GitHub reconoce la licencia del repositorio como GPL-3.0 y `npm run notices` no deja cambios sin confirmar.

#### 6.2 "Acerca de" dentro de la app

- Tarjeta nueva en Ajustes, "Acerca de MikaLog": logo, nombre, versión (leída de `package.json` al compilar), autor, y cuatro textos breves:
  - **Licencia**: "Software libre bajo la GPL-3.0. Puedes usarlo, estudiarlo, modificarlo y compartirlo; si repartes una versión modificada, debe tener la misma licencia y conservar estos créditos. Sin garantía de ningún tipo."
  - **Privacidad**: "MikaLog no recoge ni envía ningún dato. Todo lo que apuntas se queda en la carpeta de datos de tu ordenador."
  - **Riot Games**: "MikaLog no está avalado por Riot Games ni refleja sus opiniones. Valorant y Riot Games son marcas de Riot Games, Inc."
  - **Contacto**: el correo y las incidencias de GitHub, como texto que se puede copiar. No se abren enlaces desde la app: no tiene permiso para abrir el navegador y no se le añade.
- Botones "Ver la licencia" y "Licencias de terceros": abren un diálogo con el texto completo, que se incluye en la app al compilar (`LICENSE` y `THIRD-PARTY-NOTICES.md`), con desplazamiento y cierre con Escape.
- Bienvenida del tutorial: una línea más, "Tus datos no salen de tu ordenador". Sin casilla de aceptar.
- Los textos viven en un solo módulo (`src/app/legal.ts`) para que la app, y las pruebas, usen los mismos.
- Diseño según [DESIGN.md](DESIGN.md): tarjeta bento y `Dialog` ancho; el texto legal en la fuente mono a 12px.
- Pruebas de interfaz: la tarjeta muestra la versión, el autor y los cuatro avisos; los dos diálogos abren el texto y se cierran; el tutorial muestra la línea de privacidad.
- **Terminada cuando**: desde la app instalada se pueden leer la licencia, los créditos, el aviso de Riot y las licencias de terceros sin conexión.

#### 6.3 Instalador y publicación

- Instalador: página de licencia de NSIS (`licenseFile`) con el texto de la GPL, antes de elegir la carpeta. Editor y copyright visibles en las propiedades del `.exe` y en "Aplicaciones instaladas".
- Release: las notas llevan, además de las generadas, el aviso de SmartScreen, el de Riot y el enlace a la licencia (`.github/release-notes.md`). El CI, en el trabajo del instalador, comprueba en cada push que `THIRD-PARTY-NOTICES.md` está al día, para enterarse antes de etiquetar.
- Antes de etiquetar `v1.0.0`: ronda de pruebas del instalador (instalar, actualizar encima, desinstalar) y de la exportación, que sigue pendiente de la fase 5.
- **Terminada cuando**: la Release `v1.0.0` está publicada con el instalador, y una persona ajena puede instalar la app, leer sus condiciones y saber a quién escribir.

Cómo quedó hecho: los textos de la app están en `src/app/legal.ts` y la tarjeta en `src/views/ajustes/AboutPanel.tsx`; la licencia y las licencias de terceros se incluyen al compilar (`?raw`) y solo se cargan al abrir su diálogo. `THIRD-PARTY-NOTICES.md` lista 427 paquetes (110 de npm y 317 crates de Rust para Windows) y agrupa los textos de licencia repetidos. En `tauri.conf.json` están `publisher`, `copyright`, `license` y `licenseFile`.

Pendiente de revisar por el usuario, porque no es algo que la app pueda garantizar: esto sigue las prácticas habituales de software libre y la política de Riot para proyectos de fans, pero no es asesoramiento legal. Si la app llegara a tener ingresos o a usar la API de Riot, habría que revisarlo.

### Fase 7: edición para Saiz y sincronización con la API oficial de Riot 

Pedida por el usuario el 09/10/2026: una versión paralela para Saiz, jugador profesional, **sin el registro de praccs y 10mans** (se quedan sus columnas en la Tabla) y con **ACS, K/D, agente y mapa automáticos** desde la API oficial de Riot. Las decisiones del usuario están en «Decisiones cerradas de la fase 7», al final de la fase.

#### Qué pide Riot de verdad (revisado el 09/10/2026)

Fuentes: [política de VALORANT](https://support-developer.riotgames.com/hc/en-us/articles/22698769097107-VALORANT), [documentación de VALORANT](https://developer.riotgames.com/docs/valorant), [tipos de clave](https://developer.riotgames.com/docs/portal), [preguntas frecuentes](https://developer.riotgames.com/docs/faqs) y [políticas generales](https://developer.riotgames.com/policies/general).

- **Clave de producción, sí o sí.** Para VALORANT no hay claves personales ("personal key applications requesting VALORANT access will not be approved"). La clave de desarrollo caduca cada 24 horas y no sirve para un producto que se usa de verdad. Hay que registrar un producto en el portal y pedir la clave de producción (500 peticiones cada 10 s y 30.000 cada 10 min, por región).
- **Tiene que ser público.** Riot rechaza "apps that are not public and are designed for personal use only". Una app hecha solo para Saiz es justo eso, así que **no se aprobaría**. Lo que sí aprueba es "training tools that allow players to view their own match histories and aggregate stats", que es lo que hace MikaLog. Por tanto el producto que se registra es **MikaLog, pública y gratuita**, y la edición de Saiz es una variante de ese mismo producto.
- **Que el usuario sea profesional no cambia nada**: la política es la misma para cualquier jugador. Ayuda como argumento en la solicitud (hay un usuario real que lo usa), pero no es un permiso aparte. Tener varios usuarios tampoco cambia la aprobación; al contrario, es lo que Riot espera de un producto público. Una clave es para un solo producto, así que las dos ediciones van en la misma solicitud y cualquier función nueva debe pasar por la auditoría del producto en el portal.
- **Consentimiento con Riot Sign On (RSO).** Toda app de VALORANT debe pedir al jugador que acepte compartir sus datos, iniciando sesión con su cuenta de Riot (OAuth, alcances `openid offline_access`). RSO solo se concede a quien ya tiene clave de producción; Riot da el cliente de RSO por mensaje en el portal. La app debe mostrar el aviso de que vincular la cuenta hace públicos los datos del jugador y el aviso de "no avalado por Riot".
- **La clave no puede ir dentro de la app.** "Do not include your API key in your code, especially if you plan on distributing a binary." Lo mismo vale para el secreto del cliente de RSO. Como MikaLog es un instalador, hace falta **un servidor pequeño** que guarde la clave y el secreto y haga las llamadas a Riot. Es la consecuencia más grande de esta fase: hasta ahora la app no tenía servidor ni llamadas a internet.
- **Para la solicitud basta un prototipo o maqueta** que enseñe el flujo ("a working site, mockup, prototype, or rendering"). La revisión va por lotes semanales y puede tardar hasta tres semanas, sin garantía de aprobación.
- **Endpoints** (VAL-MATCH-V1 y VAL-CONTENT-V1, host de la región del jugador, por ejemplo `eu.api.riotgames.com`):
  - `GET /val/match/v1/matchlists/by-puuid/{puuid}`: lista de partidas (`matchId`, `gameStartTimeMillis`, `queueId`).
  - `GET /val/match/v1/matches/{matchId}`: la partida. De `matchInfo`: `mapId`, `gameStartMillis`, `queueId`. Del jugador en `players`: `characterId` (agente) y `stats` (`kills`, `deaths`, `score`, `roundsPlayed`).
  - `GET /val/content/v1/contents?locale=es-ES`: nombres de agentes y mapas a partir de `characterId` y `mapId`.
  - `GET /riot/account/v1/accounts/me` (host `europe.api.riotgames.com`) con el token de RSO: el `puuid` y el Riot ID del jugador que ha iniciado sesión.
  - Los nombres exactos de los campos y si las customs salen en la lista se comprueban contra la referencia del portal al tener la clave. La clave de desarrollo probablemente no tenga acceso a VAL-MATCH, así que la primera prueba real llegará con la de producción.

#### Cómo se organiza la versión paralela: misma base de código, dos ediciones

No se hace un fork. Motivos: Riot solo aprueba un producto público por clave, así que la versión de Saiz tiene que ser parte de MikaLog y no una app suelta; los arreglos y las fases futuras llegan a las dos sin copiar código; y la diferencia entre ediciones es pequeña (secciones que se ven, plantilla de campos, sincronización activada). Un fork solo tendría sentido si la versión de Saiz fuese a crecer por su cuenta con otro rumbo, y aun así perdería la aprobación de Riot.

- **Edición elegida al compilar**: variable `VITE_EDITION` (`base` por defecto, `saiz`). Un módulo `src/app/edition.ts` describe cada edición: nombre que se muestra, secciones visibles, plantilla de campos y si la sincronización con Riot viene activada. La edición llega a la app por los servicios (como `Platform`), no por una importación global, para poder probar las dos en Vitest.
- **Instalación aparte**: `src-tauri/tauri.saiz.conf.json` se mezcla con la configuración base (`tauri build --config src-tauri/tauri.saiz.conf.json`) y cambia `productName`, el título de la ventana y el `identifier` (`com.playertracker.saiz`). Con otro `identifier`, las dos ediciones se pueden tener instaladas a la vez sin compartir `config.json` ni carpeta de datos. La carpeta propuesta en el primer arranque es `Documentos/<nombre de la edición>`.
- **Scripts**: `npm run tauri:dev:saiz` y `npm run tauri:build:saiz`. El CI prueba las dos ediciones y genera los dos instaladores; la Release sube los dos `.exe`.
- **Mismos formatos**: el JSON sigue siendo `"format": "player-tracker"`, así que una copia de una edición se abre en la otra.

#### 7.1 Edición sin registro de praccs y 10mans

Interpretación de "eliminar la parte de praccs y 10mans (no las columnas)": se quita el registro aparte (una entrada por partida) y todo lo que se apoya en él, y la columna de la Tabla se queda como un número que se escribe a mano.

- **Fuera en la edición `saiz`**: la sección "Scrims y 10mans" de la barra lateral, `ScrimCharts`, las tarjetas de scrims del Dashboard, el resumen de scrims de la Revisión semanal, la hoja "Scrims y 10mans" de la exportación a Excel/CSV, el botón "Exportar lo que ves" de esa sección y su globo del tutorial.
- **La columna se queda**: en la plantilla de la edición, `scrims` ("10mans / scrims") pasa de `scrim_count` a `number`, en el grupo Juego y en el mismo sitio. Sigue contando como volumen (se suma, barras por día) en gráficas, Calendario, Insights y saturación.
- **La tabla `scrim_matches` no se borra** (las migraciones son iguales en las dos ediciones); simplemente no se usa. Al importar en la edición `saiz` un JSON o la hoja con partidas de scrims, el recuento de cada día se pasa al campo `scrims` y las partidas se conservan en la base sin mostrarse, para no perder nada si luego se abre la copia en la edición base.
- La edición base no cambia.
- Pruebas de interfaz con la app entera en las dos ediciones: en `saiz` no aparece la sección ni sus gráficas, la columna se edita a mano y la importación pasa el recuento al día; en `base` todo sigue como antes.
- **Terminada cuando**: el instalador de la edición `saiz` se instala junto al de la base, abre su propia carpeta y no muestra nada del registro de scrims salvo la columna.

Esta parte no depende de Riot y se puede hacer ya.

#### 7.2 Partidas de Riot a filas de la app (lógica pura)

Se construye antes que el servidor y con datos de ejemplo, para que la app y la maqueta de la solicitud estén listas aunque Riot tarde.

- `src/domain/riotMatches.ts`: convierte la respuesta de una partida (ya reducida por el servidor, ver 7.3) en una fila de `ranked_sessions` con `source = 'riot'` y `external_match_id = 'riot:<matchId>'`: fecha local de inicio, mapa, agente, resultado, kills, muertes, `score` y rondas.
- Resumen del día, con las mismas reglas que Rankeds (sobre los totales, como el juego): recuento de rankeds, K/D = kills totales entre muertes totales, ACS = puntuación total entre rondas totales.
- **Agente y mapa en la fila del día**: dos campos nuevos de tipo `text` en el grupo Rendimiento, "Agentes" (`agents`) y "Mapas" (`maps`), con lo jugado ese día de más a menos partidas, por ejemplo `Jett ×3, Raze ×1`. Cada partida con su mapa y agente está en Rankeds, que ya tiene gráficas por mapa y agente.
- **Qué colas cuentan**: por defecto solo competitivo (`queueId = competitive`). En Ajustes se pueden añadir otras (por ejemplo Premier). Las customs no se traen: no hay registro de 10mans en esta edición y la columna es manual.
- Una interfaz `MatchSource` (`fetchDay(fecha)`) aísla de dónde salen las partidas, para que el plan B solo cambie la fuente.
- Pruebas: conversión de una partida, día con varias partidas y agentes, partida que empieza antes de medianoche, colas filtradas, sin duplicados al repetir.

#### 7.3 Servidor de sincronización

Pequeño, sin base de datos de usuarios y en el mismo repositorio (`server/`, TypeScript, licencia GPL, con sus pruebas).

- **Dónde**: Cloudflare Workers (el plan gratuito sobra para esto) con un almacén KV solo para datos de vida corta. La clave de producción y el cliente de RSO se guardan como secretos del Worker, nunca en el repositorio. Coste cero: el subdominio gratuito `workers.dev` (`https://mikalog-sync.miguelangeldiaztic.workers.dev`, reservado el 09/10/2026 con un Worker de ejemplo que la 7.3 sustituye) para el servidor y las URL de RSO, y GitHub Pages para la web del producto y la política de privacidad. Un dominio propio (unos 10 € al año) solo si Riot lo pide al revisar.
- **Inicio de sesión**:
  1. La app crea un `state` aleatorio y abre el navegador en `GET /rso/login?state=…`, que redirige a la página de inicio de sesión de Riot.
  2. Riot vuelve a `GET /rso/callback`. El servidor cambia el código por los tokens con el secreto, pide `accounts/me` y guarda en KV, durante 5 minutos y bajo ese `state`, el `puuid`, el Riot ID y el token de refresco. Muestra "Ya puedes volver a MikaLog".
  3. La app pregunta `GET /rso/result?state=…` cada pocos segundos; al recibirlo, el servidor lo borra de KV.
- **Sincronizar** `POST /sync` con el token de refresco y la fecha: el servidor renueva el token, comprueba con `accounts/me` que el `puuid` es de quien pregunta (así solo se leen datos de jugadores que han dado su consentimiento), pide la lista de partidas y cada partida de esa fecha, resuelve agente y mapa con VAL-CONTENT (en caché un día) y devuelve solo lo que la app usa. Devuelve también el token de refresco nuevo si Riot lo cambia.
- Las partidas no cambian, así que el servidor puede guardarlas en caché para gastar menos peticiones. Respeta `Retry-After` cuando Riot devuelve 429.
- El servidor no guarda nada de forma permanente: ni cuentas, ni partidas asociadas a nadie, ni registros con datos del jugador.

#### 7.4 Conectar la cuenta y sincronizar en la app

- **Ajustes > "Cuenta de Riot"**: botón "Conectar con Riot", el texto de consentimiento (qué se lee, que solo se usa en tu ordenador, el aviso de Riot de que vincular la cuenta hace públicos tus datos) y, ya conectada, el Riot ID con "Desconectar".
- **Token de refresco** en el almacén de credenciales de Windows (crate `keyring`, dos comandos de Tauri: guardar y leer), nunca en la base de datos ni en el JSON exportado ni en las copias automáticas.
- **"Sincronizar"** en la página del día y "Sincronizar los últimos 7 días" en Rankeds. Guarda las partidas nuevas en `ranked_sessions` sin tocar las que ya estaban (para respetar lo corregido a mano) y escribe en el día `rankeds`, `kd`, `acs`, `agents` y `maps`. Todo sigue siendo editable. Sin sincronizar en segundo plano: solo al pulsar.
- **Red**: vuelve `tauri-plugin-http`, con permiso solo para el dominio del servidor, y `connect-src` de la CSP se amplía solo a ese dominio. Para abrir el navegador, `tauri-plugin-opener` limitado a la URL de inicio de sesión del servidor.
- **Edición**: la tarjeta y los botones existen en las dos ediciones (es la misma función del producto que se registra en Riot); en la edición base la tarjeta está en Ajustes y la sincronización se activa al conectar la cuenta; en `saiz` viene a la vista y el tutorial añade el paso "Conecta tu cuenta de Riot (opcional)".
- **Textos legales** (`src/app/legal.ts`, `NOTICE.md`, README): la privacidad pasa de "no envía ningún dato" a "solo se conecta a internet si conectas tu cuenta de Riot, y solo al pulsar Sincronizar; las peticiones pasan por el servidor de MikaLog, que no guarda tus datos". Política de privacidad en una página web (GitHub Pages) para la solicitud de Riot. La regla "Nada de llamadas a internet" de este plan ya recoge esta excepción.
- Pruebas de interfaz con un servidor simulado: conectar, sincronizar un día, repetir sin duplicar, desconectar borra el token, error de red con aviso claro.
- **Terminada cuando**: Saiz conecta su cuenta, sincroniza un día y la app da el mismo K/D, ACS, agentes y mapas que su historial del juego, y repetirlo no duplica partidas.

#### 7.5 Solicitud a Riot (la hace el usuario)

La web del producto y la política de privacidad están en `site/` (HTML estático, en español e inglés) y se publican con `.github/workflows/pages.yml` en `https://miguelangeldiaztic.github.io/Player-Tracker-App/` (privacidad en `privacidad.html` y maqueta del flujo para Riot en `maqueta.html`). Si cambia el flujo de la sincronización, la política se actualiza a la vez.

1. Crear en el [portal de desarrolladores](https://developer.riotgames.com/) el producto **MikaLog** (VALORANT, uso: herramienta de entrenamiento para ver tu propio historial y estadísticas). Descripción: app de escritorio gratuita y de código abierto (enlace al repositorio y a la Release), RSO con consentimiento, servidor propio que guarda la clave, sin anuncios ni pagos, sin datos de otros jugadores, sin superposiciones en partida ni MMR.
2. Adjuntar la maqueta o vídeo del flujo (7.2 y 7.4 con datos de ejemplo), la política de privacidad y la mención de que un jugador profesional ya la usa.
3. Esperar la respuesta (hasta tres semanas). Si aprueban, pedir el cliente de RSO por el portal, configurar los secretos del servidor y hacer la prueba real con la cuenta de Saiz.

Orden recomendado: 7.1 ya; 7.2 y la maqueta a la vez, y enviar la solicitud; 7.3 y 7.4 mientras Riot responde.

#### Plan B si Riot no lo aprueba o no contesta

- **B1, HenrikDev** (API no oficial). Funcionó en la fase 4 con la cuenta del usuario y se retiró el 03/10/2026; el código está en el historial (hasta el PR #14). Se reactivaría solo como otra `MatchSource`, con la clave gratuita del propio Saiz, sin servidor. Trae lo mismo (mapa, agente, kills, muertes, puntuación y rondas), pero depende de un tercero y de su clave.
- **B2, a mano**: como hoy. Rankeds por partida con "Usar estas cifras en el día" y los campos de agentes y mapas escritos a mano. La entrada manual sigue siendo la base en cualquier caso.
- Recomendación: si Riot rechaza la solicitud, B1 solo en la edición `saiz`, con aviso de que es una fuente no oficial.

#### Decisiones cerradas de la fase 7 (09/10/2026)

1. **Nombre de la edición**: **MikaLog Saiz Edition** (`productName` y título de la ventana en `tauri.saiz.conf.json`; carpeta propuesta `Documentos/MikaLog Saiz Edition`).
2. **Columna**: se queda una sola, "10mans / scrims", como número a mano.
3. **Servidor**: sí, pero gratuito: Cloudflare Workers en `workers.dev` y GitHub Pages, sin dominio de pago salvo que Riot lo exija.
4. **Riot en la edición general**: sí. La sincronización forma parte de MikaLog para cualquier jugador, que es lo que hace que el producto sea público ante Riot.

## Reglas de trabajo

- TypeScript estricto, sin `any`. Lógica de cálculo en funciones puras con pruebas.
- Nada de telemetría ni llamadas a internet, salvo la sincronización con Riot de la fase 7: solo hacia el servidor de MikaLog, solo con la cuenta conectada y solo al pulsar Sincronizar. HenrikDev se retiró el 03/10/2026.
- Ante una decisión que cambie lo que el usuario ve o sus datos, pregunta antes.
- Mantén este plan actualizado si algo cambia.
