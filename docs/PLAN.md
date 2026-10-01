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

Dónde viven los tokens: Tailwind 4 se configura en CSS, así que están en el bloque `@theme` de [src/styles/index.css](../src/styles/index.css). El token `text` de la skill se llama `ink` (para no escribir `text-text`) y se añade `canvas` para el fondo oscuro. Las utilidades `glass` (translúcido con desenfoque) y `glass-solid` (casi opaco, para tablas) están en el mismo archivo.

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

Tipos de campo: `number`, `decimal`, `duration` (minutos), `scale` (0-100), `tristate` (hecho / descanso / no hecho), `bool`, `text`, `tag`.

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
  "rankedSessions": [],
  "notes": [],
  "settings": {}
}
```

- La clave de la API de HenrikDev **no** se exporta.
- Al importar: validar todo con Zod antes de escribir, copiar `tracker.db` como respaldo, y si hay fechas repetidas preguntar si sustituir o conservar.
- Las imágenes de `attachments/` van incrustadas en base64 o en un `.zip` junto al JSON (elige una opción y documéntala).

## Fases

Trabaja una fase cada vez. Al acabar cada fase: pruebas en verde, un commit por bloque lógico, y para a que el usuario la revise antes de empezar la siguiente.

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
