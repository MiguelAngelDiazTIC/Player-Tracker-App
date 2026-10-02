import { formatDuration } from "./duration";
import type { FieldType } from "./fields";

/** Total o media de un campo, redondeado para leerlo de un vistazo. */
export function formatStat(type: FieldType, value: number | null): string {
  if (value === null) return "—";
  switch (type) {
    case "duration":
      return formatDuration(Math.round(value));
    case "decimal":
      return value.toFixed(2);
    default:
      return Number.isInteger(value) ? String(value) : value.toFixed(1);
  }
}

/** Marca de un eje: como `formatStat`, pero sin decimales que sobren. */
export function formatTick(type: FieldType, value: number): string {
  if (type === "duration") return formatDuration(Math.round(value));
  return String(Math.round(value * 100) / 100);
}

/** `2026-09-14` → `14/09`. */
export function formatShortDate(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

export function formatPercent(value: number | null): string {
  return value === null ? "—" : `${Math.round(value)} %`;
}

/** Texto de una diferencia que no llega a notarse. */
export const NO_CHANGE = "igual";

/** Diferencia con signo respecto a otro periodo: `+0.12`, `−1h05`, `+3`. */
export function formatDelta(type: FieldType, delta: number): string {
  if (type === "duration" && Math.round(delta) === 0) return NO_CHANGE;
  if (type !== "duration" && Math.abs(delta) < 0.005) return NO_CHANGE;
  const sign = delta > 0 ? "+" : "−";
  return `${sign}${formatStat(type, Math.abs(delta))}`;
}
