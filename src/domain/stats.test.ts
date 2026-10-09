// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { Day } from "./day";
import { DEFAULT_FIELDS } from "./fields";
import { emptyScrimMatch, type ScrimMatch } from "./scrims";
import { readSheetFile } from "./sheetFile";
import {
  findHeaderRow,
  guessMapping,
  parseSheet,
  sheetHeaders,
} from "./sheetImport";
import {
  allHabitsDone,
  chartKind,
  compliance,
  datesBetween,
  habitDone,
  movingAverage,
  resultsByMap,
  scrimStats,
  streak,
  summarizeRange,
  weekDates,
  weeklyCompliance,
  weekStart,
} from "./stats";
import { formatFieldValue } from "./values";
import { fixtureFile } from "../test/testServices";

function sheetDays(): Day[] {
  const { bytes, name } = fixtureFile("hoja.csv");
  const matrix = readSheetFile(bytes, name);
  const headerRow = findHeaderRow(matrix);
  const mapping = guessMapping(sheetHeaders(matrix, headerRow), DEFAULT_FIELDS);
  return parseSheet(matrix, headerRow, mapping, DEFAULT_FIELDS).days;
}

const day = (date: string, values: Day["values"] = {}): Day => ({
  date,
  values,
  feelingsMd: "",
  tags: [],
});

const field = (key: string) => {
  const found = DEFAULT_FIELDS.find((entry) => entry.key === key);
  if (!found) throw new Error(`Falta el campo ${key}`);
  return found;
};

describe("semanas", () => {
  it("empiezan en lunes", () => {
    expect(weekStart("2026-09-14")).toBe("2026-09-14");
    expect(weekStart("2026-09-20")).toBe("2026-09-14");
    expect(weekStart("2026-09-21")).toBe("2026-09-21");
    expect(weekStart("2026-10-02")).toBe("2026-09-28");
  });

  it("tienen siete días, de lunes a domingo", () => {
    expect(weekDates("2026-09-28")).toEqual([
      "2026-09-28",
      "2026-09-29",
      "2026-09-30",
      "2026-10-01",
      "2026-10-02",
      "2026-10-03",
      "2026-10-04",
    ]);
  });

  it("lista las fechas entre dos, incluidas", () => {
    expect(datesBetween("2026-09-29", "2026-10-01")).toEqual([
      "2026-09-29",
      "2026-09-30",
      "2026-10-01",
    ]);
    expect(datesBetween("2026-10-02", "2026-10-01")).toEqual([]);
  });
});

describe("revisión de la semana 14-20/09 de la hoja", () => {
  const summary = summarizeRange(DEFAULT_FIELDS, sheetDays(), [], {
    from: "2026-09-14",
    to: "2026-09-20",
  });
  const shown = (key: string) => {
    const entry = summary.fields.find((item) => item.field.key === key);
    if (!entry || entry.value === null) throw new Error(`Sin ${key}`);
    const value =
      entry.field.type === "duration" ? Math.round(entry.value) : entry.value;
    return `${entry.kind}: ${formatFieldValue(entry.field.type, value)}`;
  };

  it("coincide con el cálculo a mano", () => {
    expect(summary.daysLogged).toBe(7);
    expect(shown("rankeds")).toBe("total: 47");
    expect(shown("sleep_hours")).toBe("mean: 7h19");
    expect(shown("kd")).toBe("mean: 1.15");
  });

  it("resume el resto de columnas", () => {
    expect(shown("dms")).toBe("total: 40");
    expect(shown("kovaaks")).toBe("total: 125");
    expect(shown("sleep_score")).toBe("mean: 80.28571428571429");
    expect(shown("acs")).toBe("mean: 217");
  });

  it("cuenta el descanso de gimnasio como cumplido", () => {
    expect(
      summary.habits.map((habit) => [
        habit.field.key,
        habit.done,
        habit.counted,
      ]),
    ).toEqual([
      ["gym", 7, 7],
      ["supplements", 7, 7],
      ["nutrition", 7, 7],
    ]);
  });
});

describe("summarizeRange", () => {
  it("no cuenta los días sin dato y deja en null lo que no tiene ninguno", () => {
    const summary = summarizeRange(
      DEFAULT_FIELDS,
      [
        day("2026-09-14", { kd: 1 }),
        day("2026-09-15"),
        day("2026-09-16", { kd: 2 }),
        day("2026-09-30", { kd: 9 }),
      ],
      [],
      { from: "2026-09-14", to: "2026-09-20" },
    );
    const kd = summary.fields.find((item) => item.field.key === "kd");
    const acs = summary.fields.find((item) => item.field.key === "acs");
    expect(kd).toMatchObject({ value: 1.5, count: 2 });
    expect(acs).toMatchObject({ value: null, count: 0 });
    expect(summary.daysLogged).toBe(3);
  });

  it("cuenta scrims y etiquetas del rango", () => {
    const tagged = (date: string, tags: string[]): Day => ({
      ...day(date),
      tags,
    });
    const summary = summarizeRange(
      DEFAULT_FIELDS,
      [
        tagged("2026-09-23", ["saturado"]),
        tagged("2026-09-24", ["saturado", "tilt"]),
        tagged("2026-10-05", ["tilt"]),
      ],
      [
        emptyScrimMatch("a", "2026-09-23"),
        emptyScrimMatch("b", "2026-09-23"),
        emptyScrimMatch("c", "2026-10-05"),
      ],
      { from: "2026-09-21", to: "2026-09-27" },
    );
    expect(summary.tags).toEqual([
      { tag: "saturado", count: 2 },
      { tag: "tilt", count: 1 },
    ]);
    expect(summary.scrims.count).toBe(2);
    expect(
      summary.fields.find((item) => item.field.key === "scrims")?.value,
    ).toBe(2);
  });

  it("ignora los campos archivados", () => {
    const fields = DEFAULT_FIELDS.map((item) =>
      item.key === "dms" ? { ...item, archived: true } : item,
    );
    const summary = summarizeRange(fields, [], [], { from: null, to: null });
    expect(summary.fields.map((item) => item.field.key)).not.toContain("dms");
  });
});

describe("media móvil de 7 días", () => {
  const days = sheetDays();
  const averages = movingAverage(days, "kd");

  it("promedia los días con dato de la ventana", () => {
    expect(averages["2026-09-14"]).toBe(1.15);
    expect(averages["2026-09-15"]).toBeCloseTo((1.15 + 1.08) / 2);
    expect(averages["2026-09-20"]).toBeCloseTo(8.02 / 7);
    // El 21/09 ya no entra el 14/09.
    expect(averages["2026-09-21"]).toBeCloseTo((8.02 - 1.15 + 1.72) / 7);
  });

  it("usa días naturales: un hueco no alarga la ventana", () => {
    const sparse = movingAverage(
      [
        day("2026-09-01", { kd: 1 }),
        day("2026-09-10", { kd: 3 }),
        day("2026-09-11"),
      ],
      "kd",
    );
    expect(sparse).toEqual({ "2026-09-01": 1, "2026-09-10": 3 });
  });
});

describe("hábitos", () => {
  it("interpreta cada estado", () => {
    expect(habitDone(true)).toBe(true);
    expect(habitDone(false)).toBe(false);
    expect(habitDone("done")).toBe(true);
    expect(habitDone("rest")).toBe(true);
    expect(habitDone("missed")).toBe(false);
    expect(habitDone(null)).toBeNull();
    expect(habitDone(undefined)).toBeNull();
  });

  it("calcula el cumplimiento sobre los días con dato", () => {
    const days = [
      day("2026-09-21", { nutrition: true }),
      day("2026-09-22", { nutrition: false }),
      day("2026-09-23"),
      day("2026-09-24", { nutrition: true }),
    ];
    expect(compliance(days, "nutrition")).toEqual({
      done: 2,
      counted: 3,
      percent: (2 / 3) * 100,
    });
    expect(compliance(days, "gym").percent).toBeNull();
  });

  it("agrupa el cumplimiento por semana", () => {
    const weeks = weeklyCompliance(sheetDays(), "nutrition");
    expect(weeks).toEqual([
      { weekStart: "2026-09-14", done: 7, counted: 7, percent: 100 },
      { weekStart: "2026-09-21", done: 5, counted: 6, percent: (5 / 6) * 100 },
    ]);
  });
});

describe("rachas", () => {
  const habits = DEFAULT_FIELDS.filter(
    (item) => item.type === "bool" || item.type === "tristate",
  );
  const all = (item: Day) => allHabitsDone(item, habits);

  it("cuenta los días seguidos con todos los hábitos", () => {
    // 14-24/09 cumplidos (11 días), el 25 falla, el 26 vuelve a cumplir.
    expect(streak(sheetDays(), all, "2026-09-26")).toEqual({
      current: 1,
      best: 11,
    });
    expect(streak(sheetDays(), all, "2026-09-24")).toEqual({
      current: 11,
      best: 11,
    });
  });

  it("mantiene la racha de ayer mientras hoy no tenga dato", () => {
    expect(streak(sheetDays(), all, "2026-09-27").current).toBe(1);
    expect(streak(sheetDays(), all, "2026-09-28").current).toBe(0);
  });

  it("un día sin registrar rompe la racha", () => {
    const days = [
      day("2026-09-01", { nutrition: true }),
      day("2026-09-02", { nutrition: true }),
      day("2026-09-04", { nutrition: true }),
    ];
    const done = (item: Day) => item.values.nutrition === true;
    expect(streak(days, done, "2026-09-04")).toEqual({ current: 1, best: 2 });
  });

  it("no da por cumplido un día con un hábito sin dato", () => {
    expect(allHabitsDone(day("2026-09-01", { gym: "done" }), habits)).toBe(
      false,
    );
    expect(allHabitsDone(day("2026-09-01"), [])).toBe(false);
  });
});

describe("scrims", () => {
  const match = (id: string, patch: Partial<ScrimMatch>): ScrimMatch => ({
    ...emptyScrimMatch(id, "2026-09-20"),
    ...patch,
  });
  const matches = [
    match("a", {
      map: "Ascent",
      result: "win",
      kills: 20,
      deaths: 10,
      acs: 250,
    }),
    match("b", {
      map: "Ascent",
      result: "loss",
      kills: 10,
      deaths: 20,
      acs: 150,
    }),
    match("c", { map: "Bind", result: "win", kills: 15, deaths: 15 }),
    match("d", { map: "Ascent", result: "draw" }),
    match("e", { map: "", result: "win" }),
    match("f", { map: "Haven" }),
  ];

  it("resume resultados, K/D y ACS", () => {
    expect(scrimStats(matches)).toEqual({
      count: 6,
      wins: 3,
      losses: 1,
      draws: 1,
      winRate: 60,
      kd: (2 + 0.5 + 1) / 3,
      acs: 200,
    });
  });

  it("deja en null lo que no se puede calcular", () => {
    expect(scrimStats([match("x", {})])).toMatchObject({
      count: 1,
      winRate: null,
      kd: null,
      acs: null,
    });
  });

  it("agrupa los resultados por mapa, del más jugado al menos", () => {
    expect(resultsByMap(matches)).toEqual([
      { map: "Ascent", wins: 1, losses: 1, draws: 1 },
      { map: "Bind", wins: 1, losses: 0, draws: 0 },
    ]);
  });
});

describe("chartKind", () => {
  it("elige la gráfica de cada columna de la hoja", () => {
    expect(
      Object.fromEntries(
        DEFAULT_FIELDS.map((item) => [item.key, chartKind(item)]),
      ),
    ).toEqual({
      rankeds: "bars",
      scrims: "bars",
      dms: "bars",
      kovaaks: "bars",
      gym: "compliance",
      supplements: "compliance",
      nutrition: "compliance",
      sleep_score: "line-goal",
      sleep_hours: "line-goal",
      kd: "line-average",
      acs: "line-average",
      agents: null,
      maps: null,
    });
  });

  it("no dibuja textos ni etiquetas", () => {
    expect(chartKind({ type: "text", thresholds: null })).toBeNull();
    expect(chartKind({ type: "tag", thresholds: null })).toBeNull();
    expect(chartKind({ ...field("kd"), thresholds: null })).toBe(
      "line-average",
    );
  });
});
