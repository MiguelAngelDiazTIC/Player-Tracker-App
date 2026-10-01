import { parseSheetDate, serialToIsoDate } from "./dates";
import type { Day } from "./day";
import { parseDuration } from "./duration";
import {
  matchesFieldName,
  type FieldDefinition,
  type FieldType,
  type FieldValue,
} from "./fields";
import {
  failed,
  isNoData,
  normalizeText,
  parsed,
  parseNumberText,
  type ParseResult,
} from "./parse";
import { extractTags } from "./tags";

/**
 * Celda tal como sale del archivo. Las celdas con formato de fecha u hora
 * llegan con su número de serie además del texto que se ve en la hoja.
 */
export type SheetCell =
  string | number | boolean | null | { serial: number; text: string };

export type SheetMatrix = SheetCell[][];

/** A qué va cada columna: `ignore`, `date`, `feelings` o `field:<key>`. */
export type ColumnTarget = "ignore" | "date" | "feelings" | `field:${string}`;

export interface ImportProblem {
  /** Fila en la hoja, empezando en 1. */
  row: number;
  column: string;
  raw: string;
  reason: string;
}

export interface SkippedRow {
  row: number;
  reason: string;
}

export interface ParsedSheet {
  days: Day[];
  /** Recuento de 10mans/scrims por fecha, para el registro de partidas. */
  scrimCounts: Record<string, number>;
  problems: ImportProblem[];
  skippedRows: SkippedRow[];
}

/** Nombres de la hoja original que no coinciden con la etiqueta del campo. */
const HEADER_ALIASES: Record<string, readonly string[]> = {
  rankeds: ["ranked"],
  scrims: ["10mansoscrims", "10mansscrims", "10mans", "scrims"],
  dms: ["dm", "deathmatch", "deathmatches"],
  gym: ["gym"],
  supplements: ["suplementos"],
  sleep_score: ["sleep", "puntuaciondesueno"],
  sleep_hours: ["horassueno", "sueno", "horasdormidas"],
  kd: ["kda"],
};

const DATE_HEADERS = ["fecha", "date", "dia"];

/** Sufijo invisible que acompaña a emojis como el check verde. */
const VARIATION_SELECTOR = String.fromCharCode(0xfe0f);

const TRUE_TEXTS = new Set(
  ["true", "verdadero", "si", "1", "hecho", "✓", "✔", "✅", "☑"].map(
    normalizeTruthText,
  ),
);
const FALSE_TEXTS = new Set(
  ["false", "falso", "no", "0", "nohecho", "✗", "✘", "❌", "✖", "✕", "☐"].map(
    normalizeTruthText,
  ),
);
const REST_TEXTS = new Set(["descanso", "rest"]);

/** Como `normalizeText`, pero conserva los símbolos de check y cruz. */
function normalizeTruthText(text: string): string {
  const trimmed = text.trim();
  return normalizeText(trimmed) || trimmed.replaceAll(VARIATION_SELECTOR, "");
}

function cellText(cell: SheetCell): string {
  if (cell === null) return "";
  if (typeof cell === "object") return cell.text;
  return String(cell).trim();
}

function isEmptyCell(cell: SheetCell | undefined): boolean {
  return cell === undefined || cellText(cell) === "";
}

/** Primera fila con una columna de fecha; ahí están los nombres de columna. */
export function findHeaderRow(matrix: SheetMatrix): number {
  const withDate = matrix.findIndex((row) =>
    row.some((cell) => DATE_HEADERS.includes(normalizeText(cellText(cell)))),
  );
  if (withDate !== -1) return withDate;
  const firstFilled = matrix.findIndex(
    (row) => row.filter((cell) => !isEmptyCell(cell)).length >= 2,
  );
  return Math.max(firstFilled, 0);
}

export function sheetHeaders(matrix: SheetMatrix, headerRow: number): string[] {
  const width = Math.max(0, ...matrix.map((row) => row.length));
  const row = matrix[headerRow] ?? [];
  return Array.from({ length: width }, (_, index) =>
    cellText(row[index] ?? null).replace(/\s+/g, " "),
  );
}

/** Propone a qué campo va cada columna según su nombre. */
export function guessMapping(
  headers: readonly string[],
  fields: readonly FieldDefinition[],
): ColumnTarget[] {
  const used = new Set<ColumnTarget>();
  return headers.map((header) => {
    const normalized = normalizeText(header);
    let target: ColumnTarget = "ignore";

    if (DATE_HEADERS.includes(normalized)) target = "date";
    else if (normalized.startsWith("feeling") || normalized === "notas") {
      target = "feelings";
    } else {
      const field = fields.find(
        (candidate) =>
          !candidate.archived &&
          (matchesFieldName(candidate, header) ||
            HEADER_ALIASES[candidate.key]?.includes(normalized)),
      );
      if (field) target = `field:${field.key}`;
    }

    if (target === "ignore" || used.has(target)) return "ignore";
    used.add(target);
    return target;
  });
}

export function parseDateCell(cell: SheetCell): string | null {
  if (cell === null || typeof cell === "boolean") return null;
  if (typeof cell === "object") {
    return serialToIsoDate(cell.serial) ?? parseSheetDate(cell.text);
  }
  if (typeof cell === "number") return serialToIsoDate(cell);
  return parseSheetDate(cell);
}

function parseTruth(cell: SheetCell): "true" | "false" | "rest" | null {
  if (typeof cell === "boolean") return cell ? "true" : "false";
  const text = normalizeTruthText(cellText(cell));
  if (TRUE_TEXTS.has(text)) return "true";
  if (FALSE_TEXTS.has(text)) return "false";
  if (REST_TEXTS.has(text)) return "rest";
  return null;
}

function parseNumberCell(cell: SheetCell): number | null {
  if (typeof cell === "number") return cell;
  if (typeof cell === "string") return parseNumberText(cell);
  return null;
}

/** Interpreta una celda de la hoja según el tipo del campo de destino. */
export function parseFieldCell(
  type: FieldType,
  cell: SheetCell,
): ParseResult<FieldValue> {
  if (typeof cell !== "boolean" && isNoData(cellText(cell))) {
    return parsed(null);
  }

  switch (type) {
    case "number":
    case "scrim_count": {
      const value = parseNumberCell(cell);
      if (value === null || !Number.isInteger(value)) {
        return failed("No es un número entero");
      }
      if (type === "scrim_count" && value < 0) {
        return failed("No puede ser negativo");
      }
      return parsed(value);
    }
    case "decimal": {
      const value = parseNumberCell(cell);
      return value === null ? failed("No es un número") : parsed(value);
    }
    case "scale": {
      const value = parseNumberCell(cell);
      if (value === null || value < 0 || value > 100) {
        return failed("Debe ser un número entre 0 y 100");
      }
      return parsed(value);
    }
    case "duration": {
      // Una celda con formato de hora guarda la duración como fracción de día.
      if (typeof cell === "object" && cell !== null) {
        return parsed(Math.round(cell.serial * 24 * 60));
      }
      if (typeof cell === "number") return parsed(Math.round(cell * 60));
      return parseDuration(cellText(cell));
    }
    case "bool": {
      const truth = parseTruth(cell);
      if (truth === "true") return parsed(true);
      if (truth === "false") return parsed(false);
      return failed("No es un sí o un no");
    }
    case "tristate": {
      const truth = parseTruth(cell);
      if (truth === "true") return parsed("done");
      if (truth === "rest") return parsed("rest");
      if (truth === "false") return parsed("missed");
      return failed("No es hecho, descanso o no hecho");
    }
    case "text":
    case "tag":
      return parsed(cellText(cell));
  }
}

/**
 * Convierte las filas de la hoja en días. Una celda que no se entiende deja
 * ese campo sin dato y se apunta en `problems`; una fila sin fecha válida o
 * con la fecha repetida no se importa y se apunta en `skippedRows`.
 */
export function parseSheet(
  matrix: SheetMatrix,
  headerRow: number,
  mapping: readonly ColumnTarget[],
  fields: readonly FieldDefinition[],
): ParsedSheet {
  const headers = sheetHeaders(matrix, headerRow);
  const fieldByKey = new Map(fields.map((field) => [field.key, field]));
  const dateColumn = mapping.indexOf("date");
  const result: ParsedSheet = {
    days: [],
    scrimCounts: {},
    problems: [],
    skippedRows: [],
  };
  const seen = new Set<string>();

  matrix.slice(headerRow + 1).forEach((row, offset) => {
    const rowNumber = headerRow + offset + 2;
    if (row.every((cell) => isEmptyCell(cell))) return;

    const dateCell = dateColumn === -1 ? null : (row[dateColumn] ?? null);
    const date = parseDateCell(dateCell);
    if (date === null) {
      const raw = cellText(dateCell);
      result.skippedRows.push({
        row: rowNumber,
        reason: raw === "" ? "No tiene fecha" : `"${raw}" no es una fecha`,
      });
      return;
    }
    if (seen.has(date)) {
      result.skippedRows.push({
        row: rowNumber,
        reason: "La fecha ya aparece en una fila anterior",
      });
      return;
    }
    seen.add(date);

    const day: Day = { date, values: {}, feelingsMd: "", tags: [] };

    mapping.forEach((target, column) => {
      const cell = row[column] ?? null;
      if (target === "feelings") {
        day.feelingsMd = cellText(cell);
        day.tags = extractTags(day.feelingsMd);
        return;
      }
      if (!target.startsWith("field:")) return;

      const field = fieldByKey.get(target.slice("field:".length));
      if (!field) return;

      const value = parseFieldCell(field.type, cell);
      if (!value.ok) {
        result.problems.push({
          row: rowNumber,
          column: headers[column] || field.label,
          raw: cellText(cell),
          reason: value.reason,
        });
        return;
      }
      if (value.value === null) return;

      if (field.type === "scrim_count") {
        result.scrimCounts[date] = value.value as number;
      } else {
        day.values[field.key] = value.value;
      }
    });

    result.days.push(day);
  });

  return result;
}
