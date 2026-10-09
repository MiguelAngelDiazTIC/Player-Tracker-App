import { formatDate } from "./dates";
import type { Day } from "./day";
import { sortFields, type FieldDefinition, type FieldValue } from "./fields";
import { isSyncedSession, sessionAcs, type RankedSession } from "./ranked";
import type { WeeklyReview } from "./review";
import {
  kdRatio,
  SCRIM_KIND_LABELS,
  SCRIM_RESULT_LABELS,
  type ScrimMatch,
} from "./scrims";

/** Celda de una hoja exportada. `null` es una celda vacía (sin dato). */
export type ExportCell = string | number | null;

export interface ExportSheet {
  /** Nombre de la pestaña en Excel y del archivo en CSV. */
  name: string;
  rows: ExportCell[][];
}

const CHECK = "✓";
const CROSS = "✗";

/** 439 → `7H19min`, 540 → `9H`: el formato de la hoja original. */
export function formatSheetDuration(minutes: number): string {
  const rounded = Math.round(minutes);
  const hours = Math.floor(rounded / 60);
  const rest = rounded % 60;
  return rest === 0 ? `${hours}H` : `${hours}H${rest}min`;
}

/** Markdown a texto plano, conservando los saltos de línea. */
export function markdownToPlain(markdown: string): string {
  return markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "[imagen]")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^[ \t]{0,3}(#{1,6}|>|[-*+]|\d+\.)[ \t]+/gm, "")
    .replace(/(\*\*|__|\*|_|`|~~)/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Un valor del día tal como lo escribía el usuario en su hoja. */
export function exportFieldValue(
  field: Pick<FieldDefinition, "type">,
  value: FieldValue | undefined,
): ExportCell {
  if (value === undefined || value === null) return null;
  switch (field.type) {
    case "duration":
      return typeof value === "number" ? formatSheetDuration(value) : null;
    case "bool":
      return value === true ? CHECK : CROSS;
    case "tristate":
      if (value === "done") return CHECK;
      return value === "rest" ? "Descanso" : CROSS;
    default:
      return typeof value === "boolean" ? null : value;
  }
}

/**
 * La hoja de días con el mismo formato que la hoja original del usuario, así
 * que el importador la vuelve a leer sin perder nada.
 */
export function daysSheet(
  fields: readonly FieldDefinition[],
  days: readonly Day[],
  scrimCounts: Readonly<Record<string, number>>,
): ExportSheet {
  const columns = sortFields(fields.filter((field) => !field.archived));
  return {
    name: "Días",
    rows: [
      ["Fecha", ...columns.map((field) => field.label), "Feelings del día"],
      ...days.map((day) => [
        formatDate(day.date),
        ...columns.map((field) =>
          field.type === "scrim_count"
            ? (scrimCounts[day.date] ?? 0)
            : exportFieldValue(field, day.values[field.key]),
        ),
        markdownToPlain(day.feelingsMd) || null,
      ]),
    ],
  };
}

const round2 = (value: number | null) =>
  value === null ? null : Math.round(value * 100) / 100;
const text = (value: string) => (value === "" ? null : value);

export function scrimsSheet(matches: readonly ScrimMatch[]): ExportSheet {
  return {
    name: "Scrims y 10mans",
    rows: [
      [
        "Fecha",
        "Tipo",
        "Rival",
        "Mapa",
        "Agente",
        "Resultado",
        "Rondas ganadas",
        "Rondas perdidas",
        "Kills",
        "Muertes",
        "K/D",
        "ACS",
        "VOD",
        "Notas",
      ],
      ...matches.map((match) => [
        formatDate(match.date),
        SCRIM_KIND_LABELS[match.kind],
        text(match.opponent),
        text(match.map),
        text(match.agent),
        match.result === null ? null : SCRIM_RESULT_LABELS[match.result],
        match.roundsWon,
        match.roundsLost,
        match.kills,
        match.deaths,
        round2(kdRatio(match.kills, match.deaths)),
        match.acs,
        text(match.vodUrl),
        text(match.notes),
      ]),
    ],
  };
}

export function rankedsSheet(sessions: readonly RankedSession[]): ExportSheet {
  return {
    name: "Rankeds",
    rows: [
      [
        "Fecha",
        "Mapa",
        "Agente",
        "Resultado",
        "Kills",
        "Muertes",
        "K/D",
        "Rondas",
        "ACS",
        "Origen",
      ],
      ...sessions.map((session) => {
        const acs = sessionAcs(session);
        return [
          formatDate(session.date),
          text(session.map),
          text(session.agent),
          session.result === null ? null : SCRIM_RESULT_LABELS[session.result],
          session.kills,
          session.deaths,
          round2(kdRatio(session.kills, session.deaths)),
          session.rounds,
          acs === null ? null : Math.round(acs),
          isSyncedSession(session) ? "Sincronizada" : "Manual",
        ];
      }),
    ],
  };
}

export function reviewsSheet(reviews: readonly WeeklyReview[]): ExportSheet {
  const width = Math.max(3, ...reviews.map((item) => item.conclusions.length));
  return {
    name: "Revisiones",
    rows: [
      [
        "Semana del",
        ...Array.from(
          { length: width },
          (_, index) => `Conclusión ${index + 1}`,
        ),
      ],
      ...reviews.map((review) => [
        formatDate(review.weekStart),
        ...Array.from({ length: width }, (_, index) =>
          text(review.conclusions[index] ?? ""),
        ),
      ]),
    ],
  };
}

/** Separador que Excel en español entiende al abrir un CSV con doble clic. */
const CSV_SEPARATOR = ";";

function csvCell(cell: ExportCell): string {
  if (cell === null) return "";
  // Los decimales con coma, como los espera Excel en español.
  const value =
    typeof cell === "number" ? String(cell).replace(".", ",") : cell;
  return /[";\n\r]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

/** Texto CSV de una hoja; quien lo guarde le pone delante la marca BOM. */
export function toCsv(rows: readonly ExportCell[][]): string {
  return rows.map((row) => row.map(csvCell).join(CSV_SEPARATOR)).join("\r\n");
}
