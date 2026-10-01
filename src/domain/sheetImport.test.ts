// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { DEFAULT_FIELDS } from "./fields";
import { countScrimsByDate, planScrimPlaceholders } from "./scrims";
import { readSheetFile } from "./sheetFile";
import {
  findHeaderRow,
  guessMapping,
  parseFieldCell,
  parseSheet,
  sheetHeaders,
  type SheetMatrix,
} from "./sheetImport";

const csv = new Uint8Array(
  readFileSync(new URL("../test/fixtures/hoja.csv", import.meta.url)),
);

function importFixture() {
  const matrix = readSheetFile(csv, "hoja.csv");
  const headerRow = findHeaderRow(matrix);
  const headers = sheetHeaders(matrix, headerRow);
  const mapping = guessMapping(headers, DEFAULT_FIELDS);
  return {
    matrix,
    headerRow,
    headers,
    mapping,
    sheet: parseSheet(matrix, headerRow, mapping, DEFAULT_FIELDS),
  };
}

describe("importar la hoja del usuario (CSV)", () => {
  it("encuentra la fila de cabeceras bajo los títulos", () => {
    const { headerRow, headers } = importFixture();
    expect(headerRow).toBe(3);
    expect(headers[0]).toBe("FECHA");
    expect(headers[9]).toBe("Horas de sueño");
  });

  it("asigna cada columna a su campo", () => {
    expect(importFixture().mapping).toEqual([
      "date",
      "field:rankeds",
      "field:scrims",
      "field:dms",
      "field:kovaaks",
      "field:gym",
      "field:supplements",
      "field:nutrition",
      "field:sleep_score",
      "field:sleep_hours",
      "field:kd",
      "field:acs",
      "feelings",
    ]);
  });

  it("importa los 13 días sin problemas", () => {
    const { sheet } = importFixture();
    expect(sheet.problems).toEqual([]);
    expect(sheet.skippedRows).toEqual([]);
    expect(sheet.days).toHaveLength(13);
    expect(sheet.days[0].date).toBe("2026-09-14");
    expect(sheet.days[12].date).toBe("2026-09-26");
  });

  it("interpreta duraciones, hábitos y decimales", () => {
    const { sheet } = importFixture();
    expect(sheet.days[0].values).toEqual({
      rankeds: 6,
      dms: 3,
      kovaaks: 15,
      gym: "done",
      supplements: true,
      nutrition: true,
      sleep_score: 52,
      sleep_hours: 210,
      kd: 1.15,
      acs: 225,
    });
    expect(sheet.days[1].values.kd).toBe(1.08);
    expect(sheet.days[2].values.gym).toBe("rest");
    expect(sheet.days[6].values.sleep_hours).toBe(489);
    expect(sheet.days[3].values.sleep_hours).toBe(540);
    expect(sheet.days[11].values.supplements).toBe(false);
    expect(sheet.days[11].values.nutrition).toBe(false);
  });

  it("deja la X del sleep score como sin dato", () => {
    const { sheet } = importFixture();
    expect(sheet.days[12].values).not.toHaveProperty("sleep_score");
  });

  it("conserva los feelings y extrae sus etiquetas", () => {
    const { sheet } = importFixture();
    expect(sheet.days[11].feelingsMd).toBe(
      'Fui a cenar con colegas y me salté la "dieta".',
    );
    expect(sheet.days[2].tags).toEqual(["autopilot"]);
    expect(sheet.days[9].tags).toEqual(["saturado"]);
  });

  it("cuadra con la revisión a mano de la semana 14-20/09", () => {
    const week = importFixture().sheet.days.slice(0, 7);
    const sum = (key: string) =>
      week.reduce((total, day) => total + (day.values[key] as number), 0);

    expect(sum("rankeds")).toBe(47);
    expect(Math.round(sum("sleep_hours") / 7)).toBe(7 * 60 + 19);
    expect((sum("kd") / 7).toFixed(2)).toBe("1.15");
  });

  it("lleva el recuento de scrims aparte, no a los valores del día", () => {
    const { sheet } = importFixture();
    expect(sheet.days[0].values).not.toHaveProperty("scrims");
    expect(sheet.scrimCounts["2026-09-14"]).toBe(4);
    expect(sheet.scrimCounts["2026-09-16"]).toBe(7);
    expect(sheet.scrimCounts["2026-09-17"]).toBe(0);
  });
});

describe("filas y celdas que no se entienden", () => {
  const matrix: SheetMatrix = [
    ["FECHA", "RANKEDS", "Horas de sueño", "NUTRICION"],
    ["14/09/2026", "seis", "mucho", "quizá"],
    ["ayer", "3", "8H", "TRUE"],
    [null, null, null, null],
    ["14/09/2026", "9", "8H", "TRUE"],
    ["", "4", "7H", "TRUE"],
    ["15/09/2026", "4", "7H", "FALSE"],
  ];
  const mapping = guessMapping(sheetHeaders(matrix, 0), DEFAULT_FIELDS);
  const sheet = parseSheet(matrix, 0, mapping, DEFAULT_FIELDS);

  it("apunta cada celda rara con su fila, columna y motivo", () => {
    expect(sheet.problems).toEqual([
      {
        row: 2,
        column: "RANKEDS",
        raw: "seis",
        reason: "No es un número entero",
      },
      {
        row: 2,
        column: "Horas de sueño",
        raw: "mucho",
        reason: "No es una duración (ejemplos: 6h49, 9h, 6:49)",
      },
      {
        row: 2,
        column: "NUTRICION",
        raw: "quizá",
        reason: "No es un sí o un no",
      },
    ]);
  });

  it("importa la fila dejando sin dato lo que no entendió", () => {
    expect(sheet.days.map((day) => day.date)).toEqual([
      "2026-09-14",
      "2026-09-15",
    ]);
    expect(sheet.days[0].values).toEqual({});
  });

  it("salta filas sin fecha válida o repetida y dice por qué", () => {
    expect(sheet.skippedRows).toEqual([
      { row: 3, reason: '"ayer" no es una fecha' },
      { row: 5, reason: "La fecha ya aparece en una fila anterior" },
      { row: 6, reason: "No tiene fecha" },
    ]);
  });
});

describe("parseFieldCell", () => {
  it("entiende checks, cruces y casillas", () => {
    for (const cell of [true, "TRUE", "✅", "✓", "Sí", "si"]) {
      expect(parseFieldCell("bool", cell)).toEqual({ ok: true, value: true });
    }
    for (const cell of [false, "FALSE", "❌", "✗", "No"]) {
      expect(parseFieldCell("bool", cell)).toEqual({ ok: true, value: false });
    }
  });

  it("distingue la X de sin dato de la cruz de fallado", () => {
    expect(parseFieldCell("bool", "X")).toEqual({ ok: true, value: null });
    expect(parseFieldCell("bool", "✗")).toEqual({ ok: true, value: false });
  });

  it("lee Descanso en gimnasio como tristate", () => {
    expect(parseFieldCell("tristate", "Descanso")).toEqual({
      ok: true,
      value: "rest",
    });
    expect(parseFieldCell("tristate", "✅")).toEqual({
      ok: true,
      value: "done",
    });
    expect(parseFieldCell("tristate", false)).toEqual({
      ok: true,
      value: "missed",
    });
  });

  it("lee duraciones guardadas como hora de Excel", () => {
    expect(
      parseFieldCell("duration", { serial: 409 / 1440, text: "6:49" }),
    ).toEqual({ ok: true, value: 409 });
  });
});

describe("leer Excel", () => {
  it("conserva fechas reales, números y casillas", () => {
    const sheet = XLSX.utils.aoa_to_sheet([
      ["FECHA", "RANKEDS", "NUTRICION", "Horas de sueño", "K/D"],
      [46279, 6, true, "3H30min", 1.15],
      ["15/09/2026", 8, false, "8H40min", 1.08],
    ]);
    sheet.A2.z = "dd/mm/yyyy";
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Hoja 1");
    const bytes = new Uint8Array(
      XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer,
    );

    const matrix = readSheetFile(bytes, "hoja.xlsx");
    const mapping = guessMapping(sheetHeaders(matrix, 0), DEFAULT_FIELDS);
    const result = parseSheet(matrix, 0, mapping, DEFAULT_FIELDS);

    expect(result.problems).toEqual([]);
    expect(result.days).toEqual([
      {
        date: "2026-09-14",
        values: { rankeds: 6, nutrition: true, sleep_hours: 210, kd: 1.15 },
        feelingsMd: "",
        tags: [],
      },
      {
        date: "2026-09-15",
        values: { rankeds: 8, nutrition: false, sleep_hours: 520, kd: 1.08 },
        feelingsMd: "",
        tags: [],
      },
    ]);
  });
});

describe("recuento de scrims", () => {
  it("cuenta partidas por fecha", () => {
    expect(
      countScrimsByDate([
        { date: "2026-09-14" },
        { date: "2026-09-14" },
        { date: "2026-09-16" },
      ]),
    ).toEqual({ "2026-09-14": 2, "2026-09-16": 1 });
  });

  it("crea solo las partidas que faltan para igualar la hoja", () => {
    let next = 0;
    const placeholders = planScrimPlaceholders(
      { "2026-09-14": 4, "2026-09-16": 1, "2026-09-17": 0 },
      [{ date: "2026-09-14" }, { date: "2026-09-16" }, { date: "2026-09-16" }],
      () => `id-${(next += 1)}`,
    );

    expect(placeholders.map((match) => [match.id, match.date])).toEqual([
      ["id-1", "2026-09-14"],
      ["id-2", "2026-09-14"],
      ["id-3", "2026-09-14"],
    ]);
    expect(placeholders[0].kind).toBe("10mans");
    expect(placeholders[0].notes).toBe("Importada de la hoja");
  });
});
