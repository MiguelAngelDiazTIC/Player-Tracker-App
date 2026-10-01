# Player Tracker: la idea

Documento de concepto, 2026-10-01. Versión editable: [Player Tracker: la idea](https://claude.ai/code/artifact/1b835bad-aef1-49b0-a9d3-330c13388d57). Hoja de partida: [valorant_daily_checklist.png](valorant_daily_checklist.png).

## El concepto

Un "segundo cerebro" para el jugador competitivo: tu hoja de Valorant convertida en un diario de escritorio que registra en 1 minuto y te devuelve qué hábitos te hacen jugar mejor.

La idea parte de tu hoja "Road to Top 1" tal cual: cada día sigue teniendo juego (rankeds, 10mans/scrims, DMs, Kovaaks), hábitos core (gym/descanso, suplementación, nutrición), sueño (score y horas), K/D, ACS y tus feelings. Se sigue rellenando como una tabla, fila a fila, pero cada fila se abre como una página con espacio para escribir, enlazar y etiquetar, como una base de datos de Notion.

Es una app personal y de escritorio: un jugador, su ordenador, sin cuentas ni datos compartidos con nadie. Para cambiar de equipo o hacer copia de seguridad está la exportación a JSON.

## Cómo se organiza

Todo vive en una carpeta local tuya (un "vault", como en Obsidian), sin cuenta ni servidor: tus datos son archivos que puedes copiar, versionar o sincronizar con Drive.

- **Tabla diaria**: una fila por día con tus columnas de siempre, que rellenas directamente en la tabla como en tu hoja. Al abrir una fila ves su página, con los feelings en un editor con formato, imágenes y enlaces.
- **Campos configurables**: tú decides qué se registra y de qué tipo es (número, check, duración, escala 1-10, etiqueta). Tu hoja actual es la plantilla por defecto.
- **10mans y scrims aparte**: tienen su propio registro, separado del día. Cada entrada guarda fecha, tipo (10mans o scrim), rival, mapa, agente, resultado, K/D, ACS, enlace al VOD y notas. La fila del día solo muestra cuántas jugaste, calculado desde ese registro, y sus estadísticas no se mezclan con las de rankeds.
- **Sesiones de ranked**: opcionalmente, cada bloque de rankeds con mapa, agente, resultado, K/D y ACS, para ver en qué mapas o agentes rindes peor.
- **Notas sueltas enlazadas**: VODs revisados, lineups, notas sobre un rival o un compañero, objetivos de la semana. Se enlazan con `[[ ]]` y desde cualquier día ves qué notas lo mencionan.
- **Etiquetas en el texto**: escribir #tilt, #autopilot o #saturado en los feelings los convierte en datos que luego se pueden contar.

**Exportar e importar**: un botón vuelca todos tus datos a un único archivo JSON (días, sesiones, notas, campos configurados y ajustes) y otro lo carga en una instalación nueva. Así cambiar de ordenador o hacer una copia de seguridad es llevarte un solo archivo. Al importar, la app te avisa si hay días que ya existen y te deja elegir entre sustituirlos o conservarlos.

## Las vistas de la app

La Tabla es la pantalla principal y desde una barra lateral, como la de Notion, se pasa a las demás.

| Vista | Para qué sirve | Ejemplo con tus datos |
| --- | --- | --- |
| Tabla | Rellenar el día en filas y columnas como tu hoja, con filtros, orden y colores por umbral | Escribes 8 rankeds, gym y 6h49min en la fila y la abres para los feelings |
| Scrims y 10mans | Registro aparte por partida, con su propia tabla y estadísticas | Comparar tu ACS medio en scrims con el de rankeds, o por rival |
| Calendario | Un mapa de calor del mes por la métrica que elijas | Ver de un vistazo qué semanas cayó el sueño |
| Dashboard | Gráficas de tendencia y rachas, separando rankeds y scrims | ACS media de 7 días, racha de días cumpliendo los 3 hábitos |
| Revisión semanal | Una nota guiada cada domingo que resume la semana y te pide 3 conclusiones | Semana 14-20/09: 47 rankeds, sueño medio 7h19, K/D medio 1.15 |

Tu hoja actual (CSV o Excel) se importa directamente a la Tabla, así que desde el primer día sigues trabajando como hasta ahora.

Debajo de cada tabla, la diaria y la de scrims, aparece una gráfica por cada estadística, que sigue los filtros y el rango de fechas de la tabla:

- **K/D y ACS**: línea por día con la media de 7 días superpuesta.
- **Sueño**: horas y sleep score en línea, con tu objetivo marcado.
- **Volumen**: rankeds, DMs y Kovaaks en barras por día.
- **Hábitos**: porcentaje de cumplimiento por semana de gym, suplementación y nutrición.
- **Scrims y 10mans**: K/D y ACS por partida y resultados por mapa.

## Lo que la hoja no puede hacer: insights

El valor diferencial es que la app cruza tus hábitos con tu rendimiento y te dice qué te funciona a ti, con tus números, no con consejos genéricos.

- **Comprobar tus intuiciones**: el 22/09 escribiste que dormir mal te quitó precisión. La app compararía tu ACS en días con sleep score por debajo y por encima de 80 y te diría si se repite o fue un día suelto.
- **Detectar saturación**: el 24/09 notaste 2 semanas de demasiado grind. Un aviso podría saltar antes, por ejemplo tras 5 días seguidos con más de 8 rankeds o cuando #saturado aparece 2 veces en una semana.
- **Medir el impacto de los hábitos**: rendimiento medio con los 3 hábitos cumplidos frente a días como el 25/09, cuando fallaron suplementación y nutrición.
- **Volumen frente a calidad**: si más DMs o Kovaaks antes de rankear se traduce en mejor K/D esa sesión (lo que querías probar el 25/09).
- **Preparación del día**: una puntuación por la mañana con sueño, hábitos y carga reciente, que sugiera si hoy es día de grindear o de pocas partidas.

Con tus 13 días actuales los datos son pocos y no se ve un patrón claro: el 17/09 dormiste 9h e hiciste 1.52 de K/D, pero el 14/09 con 3h30 sacaste 1.15. La app mostraría estas comparaciones con aviso de "pocos datos" hasta tener unas semanas registradas.

## Traer K/D y ACS automáticamente

Se puede, pero no con Tracker: la vía realista es la API no oficial de HenrikDev, y la app calcularía el K/D y el ACS del día a partir de tus partidas.

| Opción | ¿Sirve? | Por qué |
| --- | --- | --- |
| [HenrikDev (no oficial)](https://docs.henrikdev.xyz/api-reference/valorant/get-matches-by-name-v4.md) | Sí | Clave que se pide en [su panel](https://docs.henrikdev.xyz/general/auth.md). Devuelve tus partidas con kills, deaths, score, rondas y hora de inicio |
| [Tracker.gg](https://feedback.tracker.gg/t/valorant-not-available-on-trn-api/19936) | No | Tracker no da acceso a sus datos de Valorant en su API pública y remite a Riot |
| [API oficial de Riot](https://developer.riotgames.com/docs/valorant) | No | Las partidas exigen clave de producción y Riot Sign On, y Riot no aprueba apps de uso solo personal |

Cómo funcionaría: en ajustes pones tu Riot ID (nombre#tag), la región y la clave. En la nota del día pulsas "Sincronizar" y la app trae las partidas de ese día, calcula K/D (kills entre deaths) y ACS (score entre rondas) y crea las sesiones por mapa y agente. Las partidas custom, si aparecen, irían al registro de scrims y 10mans, no a la fila del día. Siempre puedes corregir a mano.

El riesgo es que es un servicio de terceros sin respaldo de Riot, que puede cambiar, caerse o limitar el uso. Por eso la entrada manual sigue siendo la base y la sincronización es un extra. Queda por comprobar en el plan si las customs de 10mans aparecen y qué límites tiene la clave gratuita.

## Estilo visual

La app usa glassmorphism siguiendo la skill [Glassmorphism de awesome-design-skills](https://github.com/bergside/awesome-design-skills): paneles translúcidos con desenfoque y bordes luminosos sobre un fondo oscuro con color.

- **Tarjetas tipo bento**: el día, las gráficas y los resúmenes van en tarjetas de cristal de distintos tamaños, como un tablero.
- **Colores de la skill**: azul primario #1856FF, verde #07CA6B para lo cumplido o por encima de tu media, naranja #E89558 para avisos y rojo #EA2143 para lo fallado. Sustituyen al verde y rojo de tu hoja.
- **Tipografía**: Plus Jakarta Sans para el texto y JetBrains Mono para los números (K/D, ACS, horas), que así quedan alineados en las tablas.
- **Legibilidad primero**: la skill pide contraste WCAG AA y uso completo con teclado, así que el texto de las tablas va sobre cristal más opaco y el desenfoque fuerte se reserva para fondos y tarjetas.

## Cómo crecería

La propuesta es empezar por sustituir tu hoja y añadir lo demás cuando ya la uses a diario.

1. **Base**: vista Tabla para rellenar el día, registro aparte de 10mans y scrims, campos configurables, importación de tu hoja actual y exportar/importar todo en JSON.
2. **Ver tu progreso**: gráficas bajo las tablas, Calendario, Dashboard y revisión semanal.
3. **Insights**: comparaciones hábitos frente a rendimiento, avisos de saturación y preparación del día.
4. **Extras**: sesiones por mapa y agente, notas enlazadas, objetivos ("llegar a Radiant antes de X") y sincronización de K/D y ACS con HenrikDev.

Decidido: app personal, solo escritorio de momento, exportar e importar en JSON y explorar la sincronización automática de K/D y ACS.
