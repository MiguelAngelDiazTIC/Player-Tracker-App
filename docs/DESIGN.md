# Player Tracker: guía de diseño

Reglas de interfaz de la app, escritas con la skill `glassmorphism` de [bergside/awesome-design-skills](https://github.com/bergside/awesome-design-skills) (en Claude Code, `typeui-glassmorphism`). Carga la skill antes de tocar cualquier pantalla y aplica esta guía.

## Contexto y objetivos

Player Tracker es una hoja de registro diario que se rellena en un minuto, así que la interfaz es una tabla densa y legible sobre cristal oscuro, con los números como protagonistas. El cristal da profundidad a paneles y tarjetas; nunca le quita contraste al dato.

## Tokens y fundamentos

Los tokens están en el bloque `@theme` de [src/styles/index.css](../src/styles/index.css). No se usan valores sueltos: si falta un token, se añade ahí.

| Token | Valor | Uso |
| --- | --- | --- |
| `primary` | `#1856FF` | Acción principal y elemento activo. Solo como relleno con texto blanco |
| `secondary` | `#3A344E` | Color del fondo, junto a `primary` |
| `success` | `#07CA6B` | Cumplido o por encima de la media |
| `warning` | `#E89558` | Aviso |
| `danger` | `#EA2143` | Fallado, error o acción destructiva |
| `surface` | `#FFFFFF` | Texto sobre fondo oscuro y base del cristal |
| `ink` | `#141414` | Texto sobre superficies claras (token `text` de la skill) |
| `canvas` | `#0C0A17` | Fondo oscuro de la app |

- **Tipografía**: Plus Jakarta Sans para texto y títulos. JetBrains Mono para números (K/D, ACS, horas, fechas) y para etiquetas en mayúsculas de 12px (`font-mono text-xs uppercase tracking-wide`).
- **Radios**: `rounded-sm` (4px) en chips y celdas; `rounded-md` (8px) en botones, campos, paneles y tarjetas.
- **Espaciado**: 8px (`2`) dentro de un componente y 16px (`4`) entre componentes y como relleno de paneles.
- **Cristal**: `glass` (translúcido, desenfoque de 24px) para barra lateral y tarjetas; `glass-solid` (casi opaco, sin desenfoque) para tablas, diálogos y cualquier bloque de texto denso.
- **Texto**: `text-surface` para contenido, `text-surface/70` para texto secundario. No se baja de 70%.

## Componentes

Todos los componentes interactivos deben tener los estados reposo, hover, `focus-visible`, activo y deshabilitado. El foco es siempre el contorno blanco de 2px definido en la base.

- **Botón** (`Button`): 36px de alto, `rounded-md`, texto de 14px en semibold. Variantes: `primary` (relleno `primary`, una por vista), `secondary` (cristal con borde), `ghost` (sin fondo, para barras de herramientas) y `danger` (tinte y borde `danger` con texto blanco; el relleno rojo con texto blanco no llega a 4.5:1). Deshabilitado: 50% de opacidad y sin eventos.
- **Campo de texto y selector** (`TextInput`, `Select`): 36px de alto, borde `surface/20`, siempre con etiqueta visible o `aria-label`. Un valor que no se entiende marca el campo con borde `danger`, `aria-invalid` y el motivo en texto.
- **Tabla**: contenedor `glass-solid`; cabeceras en mono de 12px en mayúsculas, la fila de grupos encima; celdas de 40px de alto; números en mono y centrados. La cabecera y la columna de fecha se quedan fijas al desplazar. Las cabeceras ordenables son botones y anuncian el orden con `aria-sort`.
- **Celda de valor**: se edita en el sitio. Enter guarda y baja a la fila siguiente, Escape descarta, las flechas arriba y abajo cambian de fila.
- **Celda de hábito**: botón que rota entre los estados (sin dato, sí, no; o sin dato, hecho, descanso, no hecho) con icono y nombre accesible con el estado actual.
- **Color por umbral**: tinte de fondo `success/20`, `warning/25` o `danger/25`. El color nunca es la única señal: los hábitos llevan icono y los números se leen igual sin él.
- **Etiqueta** (`Chip`): `rounded-sm`, mono de 12px, fondo `surface/10`.
- **Tarjeta bento** (`Card`): `glass`, `rounded-md`, relleno de 16px y título en etiqueta mono.
- **Diálogo** (`Dialog`): `glass-solid` sobre un velo `canvas/70`; atrapa el foco, se cierra con Escape y devuelve el foco a quien lo abrió. Las acciones destructivas piden confirmación aquí, nunca con un diálogo nativo.
- **Aviso** (`Notice`): tinte del color de su tono con icono; los errores usan `role="alert"` y el resto `role="status"`.

Casos límite: las etiquetas largas se cortan con puntos suspensivos y muestran el texto completo en `title`; las tablas se desplazan dentro de su panel, no la página; toda vista sin datos explica qué hacer a continuación.

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
- `primary` o `danger` como color de texto pequeño sobre el fondo oscuro: no llegan a 4.5:1.
- Colores, radios o desenfoques escritos a mano en un componente.
- Animaciones decorativas. Solo hay transiciones de color en hover.
- Mezclar otra metáfora visual (sombras duras, relieves, degradados de neón).
- Diálogos nativos (`alert`, `confirm`).

## Lista de comprobación

1. ¿Solo se usan tokens de `index.css`?
2. ¿Texto denso sobre `glass-solid` y desenfoque solo en paneles y tarjetas?
3. ¿Cada control tiene hover, foco visible, activo y deshabilitado?
4. ¿Se puede completar la tarea solo con teclado?
5. ¿Cada control tiene nombre accesible y cada error dice cómo arreglarlo?
6. ¿El estado se entiende sin color (icono o texto)?
7. ¿Hay estado vacío y aguanta etiquetas largas?
