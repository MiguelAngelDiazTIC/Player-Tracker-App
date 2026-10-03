# MikaLog: guía de diseño

Reglas de interfaz de la app, escritas con la skill `glassmorphism` de [bergside/awesome-design-skills](https://github.com/bergside/awesome-design-skills) (en Claude Code, `typeui-glassmorphism`). Carga la skill antes de tocar cualquier pantalla y aplica esta guía.

El aspecto sigue la referencia que dio el usuario el 02/10/2026 (un panel de cristal claro sobre un degradado malva y verde, con controles en forma de píldora). Sus colores sustituyen a los de la skill; el método de la skill se mantiene.

## Contexto y objetivos

MikaLog es una hoja de registro diario que se rellena en un minuto, así que la interfaz es una tabla legible sobre cristal claro, con los números como protagonistas. El cristal da profundidad a paneles y tarjetas; nunca le quita contraste al dato.

## Tokens y fundamentos

Los tokens están en el bloque `@theme` de [src/styles/index.css](../src/styles/index.css). No se usan valores sueltos: si falta un token, se añade ahí.

| Token | Claro | Oscuro | Uso |
| --- | --- | --- | --- |
| `primary` | `#0A8158` | `#3ECF95` | Acento: acción principal y elemento activo |
| `on-accent` | `#FFFFFF` | `#10231B` | Texto e iconos sobre un relleno `primary` o `chart` |
| `secondary` | `#C9A4CB` | `#3D2542` | Extremo malva del degradado de fondo |
| `lime` | `#D8F5BC` | `#17301F` | Extremo verde del degradado de fondo |
| `success` | `#0A8158` | `#3ECF95` | Cumplido o por encima de la media |
| `warning` | `#B4580F` | `#F0A35E` | Aviso |
| `danger` | `#D11A3A` | `#FF8496` | Fallado, error o acción destructiva |
| `surface` | `#FFFFFF` | `#3B3446` | Base del cristal y de los controles |
| `ink` | `#141414` | `#F4F0F6` | Texto (token `text` de la skill), bordes y tintes de hover |
| `canvas` | `#F3EAF2` | `#15111C` | Base del fondo, bajo el degradado |
| `panel` | `#FCF9FC` | `#221D2B` | Fondo opaco de tablas, diálogos y gráficas (`glass-solid`) |
| `chart` | `#1856FF` | `#5C86FF` | Series de las gráficas: un azul que no se confunde con los estados |
| `shadow` | `#141414` | `#000000` | Sombras y velo de los diálogos |

- **Dos modos, los mismos tokens**: el modo oscuro solo cambia los valores, en el bloque `[data-theme="dark"]` de `index.css`. Los componentes no saben en qué modo están: nada de clases `dark:` ni de colores por modo en un componente. El modo se elige en la barra lateral o en Ajustes (claro, oscuro o como el sistema), se guarda en el equipo y por defecto es claro.
- **Cambio de modo**: fundido de toda la ventana en 400ms (transición de vista), para que el salto no sea brusco. Es solo opacidad, sin movimiento, así que se mantiene aunque el sistema pida menos movimiento.
- **Por qué cambian el acento y los estados**: en oscuro tienen que leerse como texto e icono sobre cristal oscuro, así que se aclaran, y lo que va encima del acento pasa a ser oscuro (`on-accent`).

- **Fondo**: degradado de `secondary` a `lime` pasando por `canvas`, fijo.
- **Tipografía**: Plus Jakarta Sans para texto, títulos y etiquetas en mayúsculas de 12px (`text-xs font-semibold tracking-wide uppercase`). JetBrains Mono solo para números que se alinean: celdas de tabla, ejes y fechas.
- **Radios**: `rounded-full` en botones, campos, pestañas y chips (píldoras); `rounded-md` (18px) en tarjetas y paneles; `rounded-sm` (8px) en celdas y marcas pequeñas.
- **Sombras**: `shadow-glass` (suave y amplia) bajo el cristal; `shadow-pill` (corta) bajo píldoras y controles blancos.
- **Espaciado**: 8px (`2`) dentro de un componente y 16px (`4`) entre componentes y como relleno de paneles.
- **Cristal**: `glass` (blanco al 58%, borde blanco, desenfoque de 24px) para barra lateral y tarjetas; `glass-solid` (opaco, sin desenfoque) para tablas, diálogos, gráficas y cualquier bloque de texto denso.
- **Texto**: `text-ink` para contenido, `text-ink/70` para texto secundario. No se baja de 70%.

## Componentes

Todos los componentes interactivos deben tener los estados reposo, hover, `focus-visible`, activo y deshabilitado. El foco es siempre el contorno `ink` de 2px definido en la base.

- **Botón** (`Button`): píldora de 36px de alto, texto de 14px en semibold. Variantes: `primary` (relleno `primary` con texto `on-accent`, una por vista), `secondary` (píldora blanca con borde y sombra corta), `ghost` (sin fondo, para acciones secundarias) y `danger` (tinte y texto `danger`). Deshabilitado: 50% de opacidad y sin eventos.
- **Campo de texto y selector** (`TextInput`, `Select`): píldora blanca de 36px de alto, borde `ink/10`, siempre con etiqueta visible o `aria-label`. Un valor que no se entiende marca el campo con borde `danger`, `aria-invalid` y el motivo en texto.
- **Selector de pocas opciones** (`Segmented`): cápsula blanca con las opciones a la vista; la elegida es una píldora `primary`. Para dos a cuatro opciones (periodo, métrica); con más, `Select`.
- **Navegación** (`Sidebar`): cada sección es una píldora; la activa es blanca con texto e icono `primary` y sombra corta.
- **Tabla**: contenedor `glass-solid`; cabeceras de 12px en mayúsculas, la fila de grupos encima; celdas de 40px de alto; números en mono y centrados. La cabecera y la columna de fecha se quedan fijas al desplazar. Las cabeceras ordenables son botones y anuncian el orden con `aria-sort`.
- **Celda de valor**: se edita en el sitio. Enter guarda y baja a la fila siguiente, Escape descarta, las flechas arriba y abajo cambian de fila.
- **Celda de hábito**: botón que rota entre los estados (sin dato, sí, no; o sin dato, hecho, descanso, no hecho) con icono y nombre accesible con el estado actual.
- **Color por umbral**: tinte de fondo `success/20`, `warning/25` o `danger/25`. El color nunca es la única señal: los hábitos llevan icono y los números se leen igual sin él.
- **Etiqueta** (`Chip`): píldora de 12px con fondo `ink/5` y borde `ink/10`.
- **Tarjeta bento** (`Card`): `glass`, `rounded-md`, relleno de 16px y título en etiqueta en mayúsculas.
- **Diálogo** (`Dialog`): `glass-solid` sobre un velo `shadow/40`; atrapa el foco, se cierra con Escape y devuelve el foco a quien lo abrió. Las acciones destructivas piden confirmación aquí, nunca con un diálogo nativo.
- **Menú de botón** (`ExportButton`): un botón `secondary` con `aria-haspopup="menu"` abre debajo un panel `glass-solid` con las opciones como píldoras de 36px. El foco entra en la primera opción; Escape o un clic fuera lo cierran y devuelven el foco al botón. El resultado (ruta guardada o error) sale en el mismo sitio como `Notice`.
- **Aviso** (`Notice`): tinte suave del color de su tono con icono; los errores usan `role="alert"` y el resto `role="status"`.

Casos límite: las etiquetas largas se cortan con puntos suspensivos y muestran el texto completo en `title`; las tablas se desplazan dentro de su panel, no la página; toda vista sin datos explica qué hacer a continuación.

## Gráficas

Hechas con la skill `dataviz`: primero la forma, el color al final y comprobado con su validador en los dos modos (`chart` sobre `panel` pasa luminosidad, croma y contraste 3:1; verde, gris y rojo de los resultados se distinguen también con daltonismo).

- **Una gráfica, una medida y un solo eje.** Cada columna tiene la suya; nunca dos escalas en el mismo dibujo.
- **Una serie, un color**: `chart`. El dato de contexto (el valor diario bajo su media móvil, el periodo anterior en una tendencia) va en gris (`ink/35`). Con dos series hay leyenda; con una basta el título.
- **Estado, no identidad**: `success`, `danger` y gris solo para victorias, derrotas y empates, siempre con leyenda en texto. El azul de los datos nunca significa bueno o malo.
- **Marcas finas**: líneas de 2px, puntos con anillo del color del panel, barras de 24px como mucho con la punta redondeada 4px, y 2px de panel entre segmentos apilados. Rejilla y ejes en `ink/10`, continuos.
- **Texto en color de texto**, nunca en el de la serie. Los números de los ejes van en mono de 12px.
- **Un día sin dato es un hueco**: las líneas no lo cruzan.
- **Mapa de calor**: un solo tono en cinco pasos; más valor, más intenso. En el paso más intenso el texto pasa a `on-accent`.
- **Medidor** (`Gauge`): semicírculo `primary` sobre una pista `ink/10` para la cifra con la que abre una vista (la preparación de hoy), con la cifra en grande dentro.
- **Lectura sin ratón**: cada gráfica tiene una cifra de resumen junto al título y una descripción para lectores de pantalla; la tabla de encima es su versión en datos. Al pasar el ratón, el valor manda y el nombre acompaña.
- **Sin animaciones** al cargar ni al filtrar.
- **Cifras** (`StatTile`): etiqueta, valor grande sin `tabular-nums`, de qué es la cifra, chip con el cambio respecto al periodo anterior (tinte e icono verdes o rojos solo si se sabe si subir es bueno; el texto del chip sigue en `ink`) y tendencia en miniatura.

## Accesibilidad

Criterios comprobables (WCAG 2.2 AA):

- Todo el texto alcanza 4.5:1 contra el fondo sobre el que se pinta; iconos y bordes de controles, 3:1.
- Todo se puede hacer solo con teclado, en un orden de tabulación que sigue el orden visual.
- Cada control tiene nombre accesible; los iconos decorativos llevan `aria-hidden`.
- El foco siempre se ve y nunca queda tapado por la cabecera fija de la tabla.
- Los errores se anuncian (`role="alert"`) y dicen cómo arreglarlo.
- Con `prefers-reduced-transparency`, el cristal pasa a ser opaco.

## Contenido y tono

Español, de tú, conciso y directo. Los botones son verbos ("Añadir día", "Importar hoja", "Exportar JSON"). Los errores dicen qué pasó y qué hacer ("No es una duración (ejemplos: 6h49, 9h, 6:49)"). Nada de "¡Ups!" ni de etiquetas ambiguas como "Aceptar" cuando se puede nombrar la acción.

## Antipatrones

- Texto de tabla sobre cristal translúcido con desenfoque: usa `glass-solid`.
- `success` o `warning` como color de texto pequeño sobre un tinte de su mismo color: no llegan a 4.5:1. El texto va en `ink` y el tono lo dan el tinte y el icono.
- Texto `on-accent` fuera de un relleno `primary` o `chart`.
- Clases `dark:` o colores distintos por modo dentro de un componente: el modo se resuelve en los tokens.
- Colores, radios, sombras o desenfoques escritos a mano en un componente.
- Animaciones decorativas. Solo hay transiciones de color en hover y el fundido al cambiar de modo.
- Mezclar otra metáfora visual (sombras duras, relieves, degradados de neón).
- Diálogos nativos (`alert`, `confirm`).

## Lista de comprobación

1. ¿Solo se usan tokens de `index.css`, y se ve bien en claro y en oscuro?
2. ¿Texto denso sobre `glass-solid` y desenfoque solo en paneles y tarjetas?
3. ¿Cada control tiene hover, foco visible, activo y deshabilitado?
4. ¿Se puede completar la tarea solo con teclado?
5. ¿Cada control tiene nombre accesible y cada error dice cómo arreglarlo?
6. ¿El estado se entiende sin color (icono o texto)?
7. ¿Hay estado vacío y aguanta etiquetas largas?
