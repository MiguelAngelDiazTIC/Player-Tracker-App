/**
 * Colores y medidas de las gráficas, siempre desde los tokens de `index.css`.
 * Recharts pinta SVG, así que los colores van como variables CSS.
 */
export const CHART = {
  /** Serie principal. */
  series: "var(--color-chart)",
  /** Serie de contexto (el dato diario bajo su media móvil). */
  muted: "color-mix(in srgb, var(--color-surface) 35%, transparent)",
  /** Rejilla y ejes: un paso por encima del panel, sin llamar la atención. */
  grid: "color-mix(in srgb, var(--color-surface) 10%, transparent)",
  /** Línea de objetivo. */
  goal: "color-mix(in srgb, var(--color-surface) 55%, transparent)",
  /** Fondo del panel: separa marcas que se tocan. */
  surface: "var(--color-panel)",
  good: "var(--color-success)",
  bad: "var(--color-danger)",
  neutral: "color-mix(in srgb, var(--color-surface) 40%, transparent)",
} as const;

export const AXIS_TICK = {
  fill: "color-mix(in srgb, var(--color-surface) 70%, transparent)",
  fontSize: 12,
  fontFamily: "var(--font-mono)",
} as const;

export const CHART_MARGIN = { top: 8, right: 8, bottom: 0, left: 0 } as const;

/** Ancho máximo de una barra: el hueco sobrante de su franja se queda vacío. */
export const MAX_BAR_SIZE = 24;
