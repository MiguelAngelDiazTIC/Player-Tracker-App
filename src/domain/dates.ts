const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function toIso(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  const isReal =
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
  return isReal ? `${year}-${pad(month)}-${pad(day)}` : null;
}

export function isIsoDate(text: string): boolean {
  const match = ISO_DATE.exec(text);
  if (!match) return false;
  return toIso(Number(match[1]), Number(match[2]), Number(match[3])) !== null;
}

/**
 * Fechas de la hoja: `DD/MM/YYYY` (también con `-` o `.`, día y mes de una
 * cifra, y año de dos cifras) o ya en ISO `YYYY-MM-DD`.
 */
export function parseSheetDate(text: string): string | null {
  const trimmed = text.trim();
  if (isIsoDate(trimmed)) return trimmed;

  const match = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(trimmed);
  if (!match) return null;
  const year =
    match[3].length === 2 ? 2000 + Number(match[3]) : Number(match[3]);
  return toIso(year, Number(match[2]), Number(match[1]));
}

/** Número de serie de Excel o Google Sheets (días desde el 30/12/1899). */
export function serialToIsoDate(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 1) return null;
  const date = new Date(
    Date.UTC(1899, 11, 30) + Math.floor(serial) * 86_400_000,
  );
  return toIso(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
  );
}

/** `2026-09-14` → `14/09/2026`. */
export function formatDate(iso: string): string {
  const match = ISO_DATE.exec(iso);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : iso;
}

/** `2026-09-14` → `lunes, 14 de septiembre de 2026`. */
export function formatLongDate(iso: string): string {
  const match = ISO_DATE.exec(iso);
  if (!match) return iso;
  const date = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
  );
  return new Intl.DateTimeFormat("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

/** Fecha local de hoy en ISO. */
export function todayIso(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function addDays(iso: string, days: number): string {
  const match = ISO_DATE.exec(iso);
  if (!match) return iso;
  const date = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days),
  );
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}
