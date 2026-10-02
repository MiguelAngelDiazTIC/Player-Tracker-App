// @vitest-environment node
import { describe, expect, it } from "vitest";
import { fixtureFile } from "../test/testServices";
import type { Day } from "./day";
import { DEFAULT_FIELDS } from "./fields";
import {
  comparisons,
  DEFAULT_SATURATION_RULES,
  performanceFields,
  readiness,
  readSaturationRules,
  saturationAlerts,
  tagInsights,
} from "./insights";
import { readSheetFile } from "./sheetFile";
import {
  findHeaderRow,
  guessMapping,
  parseSheet,
  sheetHeaders,
} from "./sheetImport";

function sheetDays(): Day[] {
  const { bytes, name } = fixtureFile("hoja.csv");
  const matrix = readSheetFile(bytes, name);
  const headerRow = findHeaderRow(matrix);
  const mapping = guessMapping(sheetHeaders(matrix, headerRow), DEFAULT_FIELDS);
  return parseSheet(matrix, headerRow, mapping, DEFAULT_FIELDS).days;
}

const day = (
  date: string,
  values: Day["values"] = {},
  tags: string[] = [],
): Day => ({ date, values, feelingsMd: "", tags });

const kd = DEFAULT_FIELDS.find((field) => field.key === "kd");
if (!kd) throw new Error("Falta el campo K/D");
const days = sheetDays();
const short = (dates: string[]) => dates.map((date) => date.slice(8));

describe("performanceFields", () => {
  it("son los campos que se comparan con la media", () => {
    expect(performanceFields(DEFAULT_FIELDS).map((field) => field.key)).toEqual(
      ["kd", "acs"],
    );
  });
});

describe("comparaciones con los datos de la hoja", () => {
  const all = comparisons(DEFAULT_FIELDS, days, kd);
  const find = (id: string) => {
    const found = all.find((item) => item.id === id);
    if (!found) throw new Error(`Falta la comparación ${id}`);
    return found;
  };

  it("compara cada hábito, todos juntos, el volumen y los objetivos", () => {
    expect(all.map((item) => item.id)).toEqual([
      "habit:gym",
      "habit:supplements",
      "habit:nutrition",
      "habit:all",
      "volume:rankeds",
      "volume:dms",
      "volume:kovaaks",
      "goal:sleep_score",
      "goal:sleep_hours",
    ]);
  });

  it("separa los días con y sin el hábito y promedia el K/D de cada grupo", () => {
    const nutrition = find("habit:nutrition");
    expect(nutrition.with.label).toBe("Sí");
    expect(nutrition.with.dates).toHaveLength(12);
    expect(nutrition.with.mean).toBeCloseTo(14.44 / 12);
    expect(nutrition.without).toEqual({
      label: "No",
      mean: 1.2,
      dates: ["2026-09-25"],
    });
    expect(nutrition.difference).toBeCloseTo(14.44 / 12 - 1.2);
  });

  it("en el gimnasio, el descanso no cuenta como hacerlo", () => {
    const gym = find("habit:gym");
    expect(short(gym.with.dates)).toEqual([
      "14",
      "15",
      "17",
      "18",
      "21",
      "22",
      "24",
      "25",
    ]);
    expect(gym.with.mean).toBeCloseTo(10.32 / 8);
    expect(gym.without.label).toBe("Descanso o no hecho");
    expect(gym.without.mean).toBeCloseTo(5.32 / 5);
  });

  it("parte el sleep score por su objetivo y deja fuera el día sin dato", () => {
    const sleep = find("goal:sleep_score");
    expect(sleep.with.label).toBe("80 o más");
    expect(sleep.with.dates).toHaveLength(9);
    expect(sleep.with.mean).toBeCloseTo(10.74 / 9);
    expect(sleep.without.label).toBe("Menos de 80");
    expect(short(sleep.without.dates)).toEqual(["14", "18", "22"]);
    expect(sleep.without.mean).toBeCloseTo(3.7 / 3);
    expect(sleep.with.dates).not.toContain("2026-09-26");
  });

  it("parte el volumen por su mediana", () => {
    const rankeds = find("volume:rankeds");
    expect(rankeds.with.label).toBe("Más de 8");
    expect(short(rankeds.with.dates)).toEqual(["17", "18", "20", "23"]);
    expect(rankeds.with.mean).toBeCloseTo(5.07 / 4);
    expect(rankeds.without.label).toBe("8 o menos");
    expect(rankeds.without.dates).toHaveLength(9);
  });

  it("avisa de pocos datos con menos de 10 días en algún grupo", () => {
    expect(all.every((item) => item.lowData)).toBe(true);

    const many = Array.from({ length: 20 }, (_, index) =>
      day(`2026-01-${String(index + 1).padStart(2, "0")}`, {
        kd: 1,
        nutrition: index < 10,
      }),
    );
    const [nutrition] = comparisons(
      DEFAULT_FIELDS.filter((field) => ["kd", "nutrition"].includes(field.key)),
      many,
      kd,
    );
    expect(nutrition.lowData).toBe(false);
    expect(nutrition.difference).toBe(0);
  });

  it("deja la diferencia en null si un grupo no tiene días", () => {
    const [nutrition] = comparisons(
      DEFAULT_FIELDS.filter((field) => ["kd", "nutrition"].includes(field.key)),
      [day("2026-01-01", { kd: 1, nutrition: true })],
      kd,
    );
    expect(nutrition.without).toEqual({ label: "No", mean: null, dates: [] });
    expect(nutrition.difference).toBeNull();
  });
});

describe("etiquetas", () => {
  it("cuenta cada etiqueta y compara el rendimiento de esos días", () => {
    const tags = tagInsights(days, kd);
    expect(tags.map((item) => [item.tag, item.dates.length])).toEqual([
      ["saturado", 2],
      ["autopilot", 1],
    ]);

    const [saturated] = tags;
    expect(saturated.dates).toEqual(["2026-09-23", "2026-09-24"]);
    expect(saturated.withMean).toBeCloseTo(1.15);
    expect(saturated.withoutMean).toBeCloseTo((15.64 - 2.3) / 11);
    expect(saturated.lowData).toBe(true);
  });
});

describe("avisos de saturación", () => {
  it("con las reglas por defecto, la hoja solo dispara la etiqueta", () => {
    expect(
      saturationAlerts(days, DEFAULT_SATURATION_RULES, "2026-09-26"),
    ).toEqual([
      {
        id: "tag:2026-09-23",
        rule: "tag",
        dates: ["2026-09-23", "2026-09-24"],
        active: true,
      },
    ]);
  });

  it("un aviso deja de estar activo pasados unos días", () => {
    const [alert] = saturationAlerts(
      days,
      DEFAULT_SATURATION_RULES,
      "2026-10-02",
    );
    expect(alert.active).toBe(false);
  });

  it("detecta 5 días seguidos con más de 8 rankeds", () => {
    const grind = [9, 10, 9, 12, 9, 9, 3, 9, 9].map((rankeds, index) =>
      day(`2026-03-0${index + 1}`, { rankeds }),
    );
    expect(
      saturationAlerts(grind, DEFAULT_SATURATION_RULES, "2026-03-09"),
    ).toEqual([
      {
        id: "streak:2026-03-01",
        rule: "streak",
        dates: [
          "2026-03-01",
          "2026-03-02",
          "2026-03-03",
          "2026-03-04",
          "2026-03-05",
          "2026-03-06",
        ],
        active: false,
      },
    ]);
  });

  it("8 rankeds justas no cuentan, y un día sin registrar corta la racha", () => {
    const exact = [8, 8, 8, 8, 8].map((rankeds, index) =>
      day(`2026-03-0${index + 1}`, { rankeds }),
    );
    expect(
      saturationAlerts(exact, DEFAULT_SATURATION_RULES, "2026-03-05"),
    ).toEqual([]);

    const gap = [1, 2, 3, 5, 6, 7].map((dayNumber) =>
      day(`2026-03-0${dayNumber}`, { rankeds: 10 }),
    );
    expect(
      saturationAlerts(gap, DEFAULT_SATURATION_RULES, "2026-03-07"),
    ).toEqual([]);
  });

  it("no avisa si la etiqueta se repite con más de una semana de por medio", () => {
    const spaced = [
      day("2026-03-01", {}, ["saturado"]),
      day("2026-03-08", {}, ["saturado"]),
    ];
    expect(
      saturationAlerts(spaced, DEFAULT_SATURATION_RULES, "2026-03-08"),
    ).toEqual([]);
    const close = [
      day("2026-03-01", {}, ["saturado"]),
      day("2026-03-07", {}, ["saturado"]),
    ];
    expect(
      saturationAlerts(close, DEFAULT_SATURATION_RULES, "2026-03-08"),
    ).toHaveLength(1);
  });

  it("respeta las reglas configuradas", () => {
    const rules = {
      streak: { fieldKey: "dms", days: 2, moreThan: 9 },
      tag: { tag: "tilt", times: 1 },
    };
    const custom = [
      day("2026-03-01", { dms: 10 }, ["tilt"]),
      day("2026-03-02", { dms: 15 }),
    ];
    expect(
      saturationAlerts(custom, rules, "2026-03-02").map((alert) => alert.id),
    ).toEqual(["streak:2026-03-01", "tag:2026-03-01"]);
  });

  it("usa las reglas por defecto si lo guardado no vale", () => {
    expect(readSaturationRules(undefined)).toEqual(DEFAULT_SATURATION_RULES);
    expect(readSaturationRules({ streak: "x" })).toEqual(
      DEFAULT_SATURATION_RULES,
    );
    const saved = {
      streak: { fieldKey: "rankeds", days: 3, moreThan: 6 },
      tag: { tag: "quemado", times: 3 },
    };
    expect(readSaturationRules(saved)).toEqual(saved);
  });
});

describe("preparación del día", () => {
  it("combina descanso, hábitos y carga con los datos del 26/09", () => {
    const result = readiness(
      DEFAULT_FIELDS,
      days,
      DEFAULT_SATURATION_RULES,
      "2026-09-26",
    );
    const [rest, habits, load] = result.parts;

    // Solo hay horas de sueño (6h35 de 7h); el sleep score es una X.
    expect(rest.score).toBeCloseTo((395 / 420) * 100);
    expect(rest.dates).toEqual(["2026-09-26"]);
    // 23, 24 y 25/09: 7 hábitos cumplidos de 9.
    expect(habits.score).toBeCloseTo((7 / 9) * 100);
    expect(habits.detail).toBe("7 de 9 cumplidos en los 3 días anteriores");
    // 6 rankeds de media, por debajo de las 7 de costumbre.
    expect(load.score).toBe(100);
    expect(load.dates).toEqual(["2026-09-23", "2026-09-24", "2026-09-25"]);

    expect(result.score).toBeCloseTo(
      ((395 / 420) * 100 * 40 + (7 / 9) * 100 * 30 + 100 * 30) / 100,
    );
    expect(result.level).toBe("high");
  });

  it("baja con mal sueño y mucha carga", () => {
    const heavy = [
      day("2026-03-01", { rankeds: 4 }),
      day("2026-03-02", { rankeds: 4 }),
      day("2026-03-03", { rankeds: 10, nutrition: false }),
      day("2026-03-04", { rankeds: 10, nutrition: false }),
      day("2026-03-05", { rankeds: 10, nutrition: false }),
      day("2026-03-06", { sleep_score: 40, sleep_hours: 210 }),
    ];
    const result = readiness(
      DEFAULT_FIELDS,
      heavy,
      DEFAULT_SATURATION_RULES,
      "2026-03-06",
    );
    expect(result.parts.map((part) => part.score)).toEqual([50, 0, 0]);
    expect(result.score).toBe(20);
    expect(result.level).toBe("low");
  });

  it("se calcula con las partes que tienen datos", () => {
    const result = readiness(
      DEFAULT_FIELDS,
      [day("2026-03-06", { sleep_score: 80, sleep_hours: 420 })],
      DEFAULT_SATURATION_RULES,
      "2026-03-06",
    );
    expect(result.parts.map((part) => part.score)).toEqual([100, null, null]);
    expect(result.score).toBe(100);
  });

  it("sin ningún dato no da puntuación", () => {
    const result = readiness(
      DEFAULT_FIELDS,
      [],
      DEFAULT_SATURATION_RULES,
      "2026-03-06",
    );
    expect(result.score).toBeNull();
    expect(result.level).toBeNull();
  });
});
