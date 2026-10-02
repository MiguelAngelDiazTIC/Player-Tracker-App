// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseExport } from "../domain/exportFormat";
import { DEFAULT_FIELDS, type FieldDefinition } from "../domain/fields";
import { emptyScrimMatch, planScrimPlaceholders } from "../domain/scrims";
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
import { applyImport, buildExport, findImportConflicts } from "./backup";
import { migrate, MIGRATIONS } from "./migrations";
import { createRepository } from "./repository";

async function newRepository() {
  const driver = createMemoryDriver();
  const repository = createRepository(driver);
  await repository.init();
  return { driver, repository };
}

/** Una instalación con la hoja del usuario importada y algo de todo. */
async function filledInstall() {
  const { repository } = await newRepository();

  const csv = new Uint8Array(
    readFileSync(new URL("../test/fixtures/hoja.csv", import.meta.url)),
  );
  const matrix = readSheetFile(csv, "hoja.csv");
  const headerRow = findHeaderRow(matrix);
  const mapping = guessMapping(sheetHeaders(matrix, headerRow), DEFAULT_FIELDS);
  const sheet = parseSheet(matrix, headerRow, mapping, DEFAULT_FIELDS);
  await repository.saveDays(sheet.days);

  let next = 0;
  await repository.saveScrims([
    ...planScrimPlaceholders(
      sheet.scrimCounts,
      [],
      () => `scrim-${(next += 1)}`,
    ),
    {
      ...emptyScrimMatch("scrim-completa", "2026-09-27"),
      kind: "scrim",
      opponent: "Team Ñu",
      map: "Ascent",
      agent: "Jett",
      result: "win",
      roundsWon: 13,
      roundsLost: 9,
      kills: 21,
      deaths: 14,
      acs: 268,
      vodUrl: "https://example.com/vod",
      notes: 'Buen "retake" en B',
    },
  ]);

  const custom: FieldDefinition = {
    id: "campo-cafe",
    key: "cafe",
    label: "Cafés",
    type: "number",
    group: "Hábitos core",
    order: 20,
    thresholds: { mode: "fixed", direction: "lower", good: 2, warn: 3 },
    archived: false,
  };
  const renamed = { ...DEFAULT_FIELDS[0], label: "Rankeds jugadas" };
  await repository.saveFields([custom, renamed]);

  await repository.saveReviews([
    {
      weekStart: "2026-09-14",
      conclusions: ["Dormir más", "Menos grind", ""],
    },
  ]);

  await repository.saveRankedSessions([
    {
      id: "ranked-1",
      date: "2026-09-20",
      map: "Ascent",
      agent: "Jett",
      result: "win",
      kills: 20,
      deaths: 10,
      score: 5200,
      rounds: 20,
      source: "henrikdev",
      externalMatchId: "match-abc",
    },
    {
      id: "ranked-2",
      date: "2026-09-20",
      map: "",
      agent: "",
      result: null,
      kills: null,
      deaths: null,
      score: null,
      rounds: null,
      source: "manual",
      externalMatchId: null,
    },
  ]);
  await repository.saveNotes([
    {
      id: "nota-1",
      title: "Team Ñu",
      bodyMd: "Revisar [[Lineups Ascent]] antes del [[20/09/2026]]",
      links: ["Lineups Ascent", "20/09/2026"],
    },
  ]);

  await repository.setSetting("goals.sleepHours", 480);
  await repository.setSetting("riot.id", "jugador#EUW");
  await repository.setSetting("henrikdev.apiKey", "secreto");

  const attachments = createMemoryAttachments({
    "captura.png": new Uint8Array([137, 80, 78, 71, 0, 255, 16]),
  });
  return { repository, attachments };
}

describe("migraciones", () => {
  it("crean las tablas de la fase 1 y no se repiten", async () => {
    const driver = createMemoryDriver();
    expect(await migrate(driver)).toEqual(
      MIGRATIONS.map((item) => item.version),
    );
    expect(await migrate(driver)).toEqual([]);

    const tables = await driver.select<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
    );
    expect(tables.map((table) => table.name)).toEqual([
      "days",
      "field_definitions",
      "notes",
      "ranked_sessions",
      "schema_migrations",
      "scrim_matches",
      "settings",
      "weekly_reviews",
    ]);
  });

  it("aplican solo las versiones nuevas", async () => {
    const driver = createMemoryDriver();
    await migrate(driver);
    const applied = await migrate(driver, [
      ...MIGRATIONS,
      {
        version: 99,
        name: "prueba",
        statements: ["CREATE TABLE IF NOT EXISTS extra (id TEXT PRIMARY KEY)"],
      },
    ]);
    expect(applied).toEqual([99]);
  });
});

describe("repositorio", () => {
  it("siembra la plantilla por defecto una sola vez", async () => {
    const { repository } = await newRepository();
    expect(await repository.listFields()).toEqual(DEFAULT_FIELDS);

    const renamed = { ...DEFAULT_FIELDS[0], label: "Otro nombre" };
    await repository.saveFields([renamed]);
    await repository.init();
    const fields = await repository.listFields();
    expect(fields).toHaveLength(DEFAULT_FIELDS.length);
    expect(fields[0].label).toBe("Otro nombre");
  });

  it("guarda, actualiza y borra días", async () => {
    const { repository } = await newRepository();
    const day = {
      date: "2026-09-14",
      values: { rankeds: 6, gym: "done", nutrition: true, kd: 1.15 },
      feelingsMd: "Día **duro**, algo de #tilt",
      tags: ["tilt"],
    };
    await repository.saveDays([day]);
    expect(await repository.listDays()).toEqual([day]);

    await repository.saveDays([{ ...day, values: { rankeds: 7 } }]);
    expect((await repository.listDays())[0].values).toEqual({ rankeds: 7 });

    await repository.deleteDay(day.date);
    expect(await repository.listDays()).toEqual([]);
  });

  it("guarda más días de los que caben en una sentencia", async () => {
    const { repository } = await newRepository();
    const days = Array.from({ length: 250 }, (_, index) => ({
      date: new Date(Date.UTC(2026, 0, 1 + index)).toISOString().slice(0, 10),
      values: { rankeds: index },
      feelingsMd: "",
      tags: [],
    }));
    await repository.saveDays(days);
    expect(await repository.listDays()).toEqual(days);
  });

  it("guarda ajustes con cualquier valor JSON", async () => {
    const { repository } = await newRepository();
    await repository.setSetting("a", { nested: [1, "dos", null] });
    await repository.setSetting("a", 3);
    await repository.setSetting("b", "texto");
    expect(await repository.getSettings()).toEqual({ a: 3, b: "texto" });
  });
});

describe("exportar e importar JSON", () => {
  it("da los mismos datos tras exportar e importar en otra instalación", async () => {
    const origin = await filledInstall();
    const exported = await buildExport(origin.repository, origin.attachments);
    const parsedFile = parseExport(JSON.stringify(exported));
    if (!parsedFile.ok) throw new Error(parsedFile.errors.join("\n"));

    const target = await newRepository();
    const targetAttachments = createMemoryAttachments();
    const summary = await applyImport(
      target.repository,
      targetAttachments,
      parsedFile.data,
      "replace",
    );
    const again = await buildExport(target.repository, targetAttachments);

    expect({ ...again, exportedAt: "" }).toEqual({
      ...exported,
      exportedAt: "",
    });
    expect(exported.days).toHaveLength(13);
    expect(exported.scrimMatches).toHaveLength(19);
    expect(exported.weeklyReviews).toHaveLength(1);
    expect(exported.rankedSessions).toHaveLength(2);
    expect(exported.notes).toHaveLength(1);
    expect(exported.fieldDefinitions).toHaveLength(DEFAULT_FIELDS.length + 1);
    expect(summary).toEqual({
      daysWritten: 13,
      daysSkipped: 0,
      scrimsWritten: 19,
      scrimsSkipped: 0,
      fieldsWritten: DEFAULT_FIELDS.length + 1,
      attachmentsWritten: 1,
    });
    expect(targetAttachments.files["captura.png"]).toEqual(
      origin.attachments.files["captura.png"],
    );
  });

  it("no exporta la clave de HenrikDev", async () => {
    const { repository, attachments } = await filledInstall();
    const exported = await buildExport(repository, attachments);
    expect(exported.settings).toEqual({
      "goals.sleepHours": 480,
      "riot.id": "jugador#EUW",
    });
    expect(JSON.stringify(exported)).not.toContain("secreto");
  });

  it("avisa de las fechas repetidas y respeta sustituir o conservar", async () => {
    const origin = await filledInstall();
    const exported = await buildExport(origin.repository, origin.attachments);

    for (const strategy of ["keep", "replace"] as const) {
      const target = await newRepository();
      const mine = {
        date: "2026-09-14",
        values: { rankeds: 99 },
        feelingsMd: "Lo que ya tenía",
        tags: [],
      };
      await target.repository.saveDays([mine]);

      expect(await findImportConflicts(target.repository, exported)).toEqual({
        days: ["2026-09-14"],
        scrimMatches: [],
      });

      const summary = await applyImport(
        target.repository,
        createMemoryAttachments(),
        exported,
        strategy,
      );
      const [first] = await target.repository.listDays();

      if (strategy === "keep") {
        expect(first).toEqual(mine);
        expect(summary.daysSkipped).toBe(1);
      } else {
        expect(first).toEqual(exported.days[0]);
        expect(summary.daysSkipped).toBe(0);
      }
      expect(await target.repository.listDays()).toHaveLength(13);
    }
  });

  it("no duplica una partida sincronizada que ya está con otro id", async () => {
    const origin = await filledInstall();
    const exported = await buildExport(origin.repository, origin.attachments);

    for (const strategy of ["keep", "replace"] as const) {
      const target = await newRepository();
      await target.repository.saveRankedSessions([
        {
          ...exported.rankedSessions[0],
          id: "id-local",
          map: "Bind",
        },
      ]);
      await applyImport(
        target.repository,
        createMemoryAttachments(),
        exported,
        strategy,
      );

      const sessions = await target.repository.listRankedSessions();
      expect(sessions.map((session) => session.id)).toEqual([
        "id-local",
        "ranked-2",
      ]);
      expect(sessions[0].map).toBe(strategy === "keep" ? "Bind" : "Ascent");
    }
  });

  it("une los campos por clave aunque el id local sea otro", async () => {
    const origin = await filledInstall();
    const exported = await buildExport(origin.repository, origin.attachments);

    const target = await newRepository();
    await target.repository.saveFields([
      {
        id: "id-local",
        key: "cafe",
        label: "Café de aquí",
        type: "number",
        group: "Otros",
        order: 50,
        thresholds: null,
        archived: false,
      },
    ]);
    await applyImport(
      target.repository,
      createMemoryAttachments(),
      exported,
      "replace",
    );

    const coffee = (await target.repository.listFields()).filter(
      (field) => field.key === "cafe",
    );
    expect(coffee).toHaveLength(1);
    expect(coffee[0].id).toBe("id-local");
    expect(coffee[0].label).toBe("Cafés");
  });
});

describe("validación del archivo", () => {
  const base = {
    format: "player-tracker",
    version: 1,
    exportedAt: "2026-10-01T22:00:00Z",
    fieldDefinitions: DEFAULT_FIELDS,
    days: [],
    scrimMatches: [],
    rankedSessions: [],
    notes: [],
    settings: {},
  };

  it("acepta el formato del plan, con o sin imágenes", () => {
    expect(parseExport(JSON.stringify(base)).ok).toBe(true);
  });

  it("rechaza texto que no es JSON", () => {
    expect(parseExport("esto no es json")).toEqual({
      ok: false,
      errors: ["El archivo no es un JSON válido"],
    });
  });

  it("rechaza otro formato u otra versión", () => {
    expect(
      parseExport(JSON.stringify({ ...base, format: "otra-app" })).ok,
    ).toBe(false);
    expect(parseExport(JSON.stringify({ ...base, version: 2 })).ok).toBe(false);
  });

  it("dice dónde está el dato que no encaja", () => {
    const result = parseExport(
      JSON.stringify({
        ...base,
        days: [
          { date: "14/09/2026", values: {}, feelingsMd: "", tags: [] },
          {
            date: "2026-09-15",
            values: { gym: "a veces", rankeds: 3 },
            feelingsMd: "",
            tags: [],
          },
        ],
      }),
    );
    expect(result).toEqual({
      ok: false,
      errors: [
        "days.0.date: La fecha debe ser YYYY-MM-DD",
        'days.1.values.gym: El valor "a veces" no encaja con un campo de tipo tristate',
      ],
    });
  });

  it("rechaza días repetidos dentro del archivo", () => {
    const day = { date: "2026-09-15", values: {}, feelingsMd: "", tags: [] };
    const result = parseExport(JSON.stringify({ ...base, days: [day, day] }));
    expect(result).toEqual({
      ok: false,
      errors: ["days: El día 2026-09-15 aparece más de una vez"],
    });
  });
});
