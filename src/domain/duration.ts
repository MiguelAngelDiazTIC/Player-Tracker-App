import { failed, isNoData, parsed, type ParseResult } from "./parse";

const NOT_A_DURATION = "No es una duración (ejemplos: 6h49, 9h, 6:49)";

function fromParts(hours: number, minutes: number): ParseResult<number> {
  if (minutes >= 60) return failed(NOT_A_DURATION);
  return parsed(hours * 60 + minutes);
}

/**
 * Duraciones en minutos. Entiende el formato de la hoja (`6H49min`, `8H9min`,
 * `9H`) y variantes cómodas de teclear: `6h49`, `6:49`, `45min` y un número
 * suelto como horas (`7,5` = 7h30).
 */
export function parseDuration(text: string): ParseResult<number> {
  if (isNoData(text)) return parsed(null);
  const trimmed = text.trim().toLowerCase();

  const hoursMinutes = /^(\d+)\s*h\s*(?:(\d+)\s*(?:min|m)?)?$/.exec(trimmed);
  if (hoursMinutes) {
    return fromParts(Number(hoursMinutes[1]), Number(hoursMinutes[2] ?? 0));
  }

  const clock = /^(\d+):(\d{1,2})$/.exec(trimmed);
  if (clock) return fromParts(Number(clock[1]), Number(clock[2]));

  const minutesOnly = /^(\d+)\s*(?:min|m)$/.exec(trimmed);
  if (minutesOnly) return parsed(Number(minutesOnly[1]));

  const hoursOnly = /^\d+(?:[.,]\d+)?$/.exec(trimmed);
  if (hoursOnly)
    return parsed(Math.round(Number(trimmed.replace(",", ".")) * 60));

  return failed(NOT_A_DURATION);
}

/** 409 → `6h49`, 540 → `9h`, 365 → `6h05`. */
export function formatDuration(minutes: number): string {
  const rounded = Math.round(minutes);
  const hours = Math.floor(rounded / 60);
  const rest = rounded % 60;
  return rest === 0 ? `${hours}h` : `${hours}h${String(rest).padStart(2, "0")}`;
}
