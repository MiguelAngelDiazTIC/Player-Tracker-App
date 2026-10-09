// @vitest-environment node
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import {
  backupDue,
  backupsToDelete,
  DEFAULT_AUTO_BACKUP,
  lastBackupDate,
  readAutoBackup,
} from "../domain/autoBackup";
import type { Day } from "../domain/day";
import { parseExport } from "../domain/exportFormat";
import { DEFAULT_FIELDS } from "../domain/fields";
import { emptyScrimMatch } from "../domain/scrims";
import {
  daysSheet,
  formatSheetDuration,
  markdownToPlain,
  rankedsSheet,
  reviewsSheet,
  scrimsSheet,
  toCsv,
} from "../domain/sheetExport";
import { readSheetFile } from "../domain/sheetFile";
import {
  findHeaderRow,
  guessMapping,
  parseSheet,
  sheetHeaders,
} from "../domain/sheetImport";
import {
  createMemoryAttachments,
  createMemoryDriver,
} from "../test/memoryDriver";
import { fixtureFile } from "../test/testServices";
import { runAutoBackup, type BackupFolder } from "./autoBackup";
import { createRepository } from "./repository";
import { fileSlug, toCsvBytes, toXlsx } from "./sheetWrite";

/** Lee una hoja exportada con el importador de la fase 1. */
function importBack(bytes: Uint8Array, fileName: string) {
  const matrix = readSheetFile(bytes, fileName);
  const headerRow = findHeaderRow(matrix);
  const mapping = guessMapping(sheetHeaders(matrix, headerRow), DEFAULT_FIELDS);
  return parseSheet(matrix, headerRow, mapping, DEFAULT_FIELDS);
}

function sheetDays(): Day[] {
  const { bytes, name } = fixtureFile("hoja.csv");
  return importBack(bytes, name).days;
}

const scrims = [
  {
    ...emptyScrimMatch("a", "2026-09-14"),
    kind: "scrim" as const,
    opponent: "Team Ñu",
    map: "Ascent",
    agent: "Jett",
    result: "win" as const,
    roundsWon: 13,
    roundsLost: 9,
    kills: 21,
    deaths: 14,
    acs: 268,
    vodUrl: "https://example.com/vod",
    notes: 'Buen "retake"; B flojo',
  },
  emptyScrimMatch("b", "2026-09-14"),
];

describe("formato de la hoja", () => {
  it("escribe las duraciones como en la hoja original", () => {
    expect(formatSheetDuration(439)).toBe("7H19min");
    expect(formatSheetDuration(540)).toBe("9H");
    expect(formatSheetDuration(489)).toBe("8H9min");
  });

  it("pasa los feelings a texto plano conservando párrafos y etiquetas", () => {
    expect(
      markdownToPlain(
        "## Resumen\n\nDía **muy** _bueno_ con #tilt.\n\n- Aim fino\n- [vod](https://x.y)",
      ),
    ).toBe("Resumen\n\nDía muy bueno con #tilt.\n\nAim fino\nvod");
  });

  it("monta la hoja de días con las columnas de la tabla", () => {
    const days = sheetDays();
    const sheet = daysSheet(DEFAULT_FIELDS, days, { "2026-09-14": 4 });

    expect(sheet.rows[0]).toEqual([
      "Fecha",
      "Rankeds",
      "10mans / scrims",
      "DMs",
      "Kovaaks",
      "Gimnasio",
      "Suplementación",
      "Nutrición",
      "Sleep score",
      "Horas de sueño",
      "K/D",
      "ACS",
      "Agentes",
      "Mapas",
      "Feelings del día",
    ]);
    expect(sheet.rows[1].slice(0, 12)).toEqual([
      "14/09/2026",
      6,
      4,
      3,
      15,
      "✓",
      "✓",
      "✓",
      52,
      "3H30min",
      1.15,
      225,
    ]);
    // 16/09: descanso de gimnasio. 25/09: hábitos fallados. 26/09: sin sleep score.
    expect(sheet.rows[3][5]).toBe("Descanso");
    expect(sheet.rows[12].slice(6, 8)).toEqual(["✗", "✗"]);
    expect(sheet.rows[13][8]).toBeNull();
  });

  it("deja fuera los campos archivados", () => {
    const fields = DEFAULT_FIELDS.map((field) =>
      field.key === "dms" ? { ...field, archived: true } : field,
    );
    expect(daysSheet(fields, [], {}).rows[0]).not.toContain("DMs");
  });

  it("monta las hojas de scrims, rankeds y revisiones", () => {
    expect(scrimsSheet(scrims).rows[1]).toEqual([
      "14/09/2026",
      "Scrim",
      "Team Ñu",
      "Ascent",
      "Jett",
      "Victoria",
      13,
      9,
      21,
      14,
      1.5,
      268,
      "https://example.com/vod",
      'Buen "retake"; B flojo',
    ]);
    expect(scrimsSheet(scrims).rows[2].slice(1, 6)).toEqual([
      "10mans",
      null,
      null,
      null,
      null,
    ]);

    expect(
      rankedsSheet([
        {
          id: "r",
          date: "2026-09-20",
          map: "Lotus",
          agent: "Fade",
          result: "loss",
          kills: 15,
          deaths: 11,
          score: 3931,
          rounds: 18,
          source: "henrikdev",
          externalMatchId: "m",
        },
      ]).rows[1],
    ).toEqual([
      "20/09/2026",
      "Lotus",
      "Fade",
      "Derrota",
      15,
      11,
      1.36,
      18,
      218,
      "Sincronizada",
    ]);

    expect(
      reviewsSheet([
        { weekStart: "2026-09-14", conclusions: ["Dormir", "", "Parar"] },
      ]).rows,
    ).toEqual([
      ["Semana del", "Conclusión 1", "Conclusión 2", "Conclusión 3"],
      ["14/09/2026", "Dormir", null, "Parar"],
    ]);
  });
});

describe("ida y vuelta", () => {
  const days = sheetDays();
  const counts = { "2026-09-14": 4, "2026-09-16": 7 };

  it("el Excel exportado se reimporta dando los mismos días", () => {
    const bytes = toXlsx([
      daysSheet(DEFAULT_FIELDS, days, counts),
      scrimsSheet(scrims),
    ]);
    const back = importBack(bytes, "mikalog.xlsx");

    expect(back.problems).toEqual([]);
    expect(back.skippedRows).toEqual([]);
    expect(back.days).toEqual(days);
    expect(back.scrimCounts["2026-09-14"]).toBe(4);
  });

  it("el Excel tiene una pestaña por registro, con números de verdad", () => {
    const workbook = XLSX.read(
      toXlsx([
        daysSheet(DEFAULT_FIELDS, days, counts),
        scrimsSheet(scrims),
        rankedsSheet([]),
        reviewsSheet([]),
      ]),
      { type: "array" },
    );
    expect(workbook.SheetNames).toEqual([
      "Días",
      "Scrims y 10mans",
      "Rankeds",
      "Revisiones",
    ]);
    const sheet = workbook.Sheets["Días"];
    expect(sheet.B2).toMatchObject({ t: "n", v: 6 });
    expect(sheet.K2).toMatchObject({ t: "n", v: 1.15 });
    expect(sheet.J2).toMatchObject({ t: "s", v: "3H30min" });
  });

  it("el CSV exportado también se reimporta igual", () => {
    const bytes = toCsvBytes(daysSheet(DEFAULT_FIELDS, days, counts));
    // BOM de UTF-8, para que Excel lea bien los acentos.
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);

    const back = importBack(bytes, "dias.csv");
    expect(back.problems).toEqual([]);
    expect(back.days).toEqual(days);
  });

  it("el CSV usa punto y coma, coma decimal y comillas donde hacen falta", () => {
    expect(
      toCsv([
        ["Fecha", "K/D", "Notas"],
        ["14/09/2026", 1.15, 'Buen "retake"; B flojo'],
        ["15/09/2026", null, "dos\nlíneas"],
      ]),
    ).toBe(
      'Fecha;K/D;Notas\r\n14/09/2026;1,15;"Buen ""retake""; B flojo"\r\n15/09/2026;;"dos\nlíneas"',
    );
  });

  it("genera nombres de archivo sin acentos ni espacios", () => {
    expect(fileSlug("Scrims y 10mans")).toBe("scrims-y-10mans");
    expect(fileSlug("Días")).toBe("dias");
  });
});

describe("copias automáticas", () => {
  const names = ["copia-2026-09-20.json", "copia-2026-09-27.json", "notas.txt"];

  it("sabe cuándo fue la última copia", () => {
    expect(lastBackupDate(names)).toBe("2026-09-27");
    expect(lastBackupDate(["notas.txt"])).toBeNull();
  });

  it("toca copia si no hay ninguna o la última tiene 7 días o más", () => {
    expect(backupDue([], DEFAULT_AUTO_BACKUP, "2026-10-03")).toBe(true);
    expect(backupDue(names, DEFAULT_AUTO_BACKUP, "2026-10-03")).toBe(false);
    expect(backupDue(names, DEFAULT_AUTO_BACKUP, "2026-10-04")).toBe(true);
    expect(
      backupDue(names, { enabled: true, everyDays: 3 }, "2026-09-30"),
    ).toBe(true);
    expect(backupDue([], { enabled: false, everyDays: 7 }, "2026-10-03")).toBe(
      false,
    );
  });

  it("conserva las 8 más recientes", () => {
    const many = Array.from(
      { length: 10 },
      (_, index) => `copia-2026-08-${String(index + 1).padStart(2, "0")}.json`,
    );
    expect(backupsToDelete([...many, "notas.txt"])).toEqual([
      "copia-2026-08-01.json",
      "copia-2026-08-02.json",
    ]);
    expect(backupsToDelete(names)).toEqual([]);
  });

  it("usa la configuración por defecto si lo guardado no vale", () => {
    expect(readAutoBackup(undefined)).toEqual(DEFAULT_AUTO_BACKUP);
    expect(readAutoBackup({ enabled: true, everyDays: 0 })).toEqual(
      DEFAULT_AUTO_BACKUP,
    );
    expect(readAutoBackup({ enabled: false, everyDays: 14 })).toEqual({
      enabled: false,
      everyDays: 14,
    });
  });

  function memoryFolder(files: Map<string, string>) {
    const folder: BackupFolder = {
      async list() {
        return [...files.keys()];
      },
      async write(name, text) {
        files.set(name, text);
      },
      async remove(name) {
        files.delete(name);
      },
    };
    return { folder, files };
  }

  it("al abrir la app hace la copia si toca, sin la clave de HenrikDev", async () => {
    const repository = createRepository(createMemoryDriver());
    await repository.init();
    await repository.saveDays(sheetDays());
    await repository.setSetting("henrikdev.apiKey", "secreto");
    const { folder, files } = memoryFolder(
      new Map([["copia-2026-09-20.json", "{}"]]),
    );

    const first = await runAutoBackup(
      repository,
      createMemoryAttachments(),
      folder,
      DEFAULT_AUTO_BACKUP,
      "2026-10-03",
    );
    expect(first).toBe("copia-2026-10-03.json");
    expect(files.get(first ?? "")).not.toContain("secreto");

    const copy = parseExport(files.get("copia-2026-10-03.json") ?? "");
    expect(copy.ok && copy.data.days).toHaveLength(13);

    // El mismo día, o a los pocos días, no repite la copia.
    expect(
      await runAutoBackup(
        repository,
        createMemoryAttachments(),
        folder,
        DEFAULT_AUTO_BACKUP,
        "2026-10-05",
      ),
    ).toBeNull();
    expect(files.size).toBe(2);
  });
});
