/** Resultado de interpretar un texto: `value: null` significa "sin dato". */
export type ParseResult<T> =
  { ok: true; value: T | null } | { ok: false; reason: string };

export function parsed<T>(value: T | null): ParseResult<T> {
  return { ok: true, value };
}

export function failed<T>(reason: string): ParseResult<T> {
  return { ok: false, reason };
}

/** Textos que la hoja usa para "sin dato". */
const NO_DATA = new Set(["", "x", "-", "—"]);

export function isNoData(text: string): boolean {
  return NO_DATA.has(text.trim().toLowerCase());
}

/** Minúsculas, sin acentos y sin nada que no sea letra o número. */
export function normalizeText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** Acepta coma o punto decimal: "1,15", "01.08", "225". */
export function parseNumberText(text: string): number | null {
  const trimmed = text.trim().replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) return null;
  return Number(trimmed);
}
