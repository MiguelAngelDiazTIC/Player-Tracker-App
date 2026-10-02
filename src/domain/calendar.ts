import { addDays } from "./dates";
import type { DateRange } from "./filters";
import { weekStart } from "./stats";

/** Mes como `YYYY-MM`. */
export function monthOf(iso: string): string {
  return iso.slice(0, 7);
}

export function addMonths(month: string, delta: number): string {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** `2026-09` → `septiembre de 2026`. */
export function monthLabel(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("es-ES", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, monthNumber - 1, 1)));
}

export function monthRange(month: string): DateRange {
  return {
    from: `${month}-01`,
    to: addDays(`${addMonths(month, 1)}-01`, -1),
  };
}

/**
 * Semanas del mes, de lunes a domingo. Los huecos de antes del día 1 y de
 * después del último son `null`.
 */
export function monthGrid(month: string): (string | null)[][] {
  const { from, to } = monthRange(month);
  if (from === null || to === null) return [];

  const weeks: (string | null)[][] = [];
  for (
    let monday = weekStart(from);
    monday <= to;
    monday = addDays(monday, 7)
  ) {
    weeks.push(
      Array.from({ length: 7 }, (_, index) => {
        const date = addDays(monday, index);
        return monthOf(date) === month ? date : null;
      }),
    );
  }
  return weeks;
}

export const WEEKDAY_LABELS = [
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
  "Domingo",
] as const;

/** Número de pasos de la escala de color del mapa de calor. */
export const HEAT_STEPS = 5;

/** Paso de 0 (mínimo) a `HEAT_STEPS - 1` (máximo) de un valor en su rango. */
export function heatStep(value: number, min: number, max: number): number {
  if (max <= min) return HEAT_STEPS - 1;
  const position = (value - min) / (max - min);
  return Math.min(
    HEAT_STEPS - 1,
    Math.max(0, Math.floor(position * HEAT_STEPS)),
  );
}
