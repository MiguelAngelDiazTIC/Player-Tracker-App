import { describe, expect, it } from "vitest";
import type { Day } from "./day";
import {
  allTags,
  feelingsPreview,
  filterDays,
  inRange,
  NO_FILTER,
  presetRange,
} from "./filters";

const day = (date: string, feelingsMd = "", tags: string[] = []): Day => ({
  date,
  values: {},
  feelingsMd,
  tags,
});

const days = [
  day("2026-09-14", "Día jodido, dormí fatal", ["tilt"]),
  day("2026-09-23", "Un poco saturado", ["saturado"]),
  day("2026-09-24", "Otra vez saturado y con tilt", ["saturado", "tilt"]),
  day("2026-10-01", "Mes nuevo, energía nueva"),
];

describe("presetRange", () => {
  it("calcula los rangos respecto a hoy, incluyendo hoy", () => {
    expect(presetRange("all", "2026-10-02")).toEqual({ from: null, to: null });
    expect(presetRange("7d", "2026-10-02")).toEqual({
      from: "2026-09-26",
      to: "2026-10-02",
    });
    expect(presetRange("30d", "2026-10-02")).toEqual({
      from: "2026-09-03",
      to: "2026-10-02",
    });
    expect(presetRange("month", "2026-10-02")).toEqual({
      from: "2026-10-01",
      to: null,
    });
  });
});

describe("inRange", () => {
  it("incluye los dos extremos y admite extremos abiertos", () => {
    const range = { from: "2026-09-14", to: "2026-09-20" };
    expect(inRange("2026-09-14", range)).toBe(true);
    expect(inRange("2026-09-20", range)).toBe(true);
    expect(inRange("2026-09-21", range)).toBe(false);
    expect(inRange("2026-09-13", range)).toBe(false);
    expect(inRange("1999-01-01", { from: null, to: null })).toBe(true);
  });
});

describe("filterDays", () => {
  it("sin filtro devuelve todo", () => {
    expect(filterDays(days, NO_FILTER)).toEqual(days);
  });

  it("filtra por rango de fechas", () => {
    const result = filterDays(days, {
      ...NO_FILTER,
      range: { from: "2026-09-20", to: "2026-09-30" },
    });
    expect(result.map((item) => item.date)).toEqual([
      "2026-09-23",
      "2026-09-24",
    ]);
  });

  it("filtra por etiqueta", () => {
    const result = filterDays(days, { ...NO_FILTER, tag: "tilt" });
    expect(result.map((item) => item.date)).toEqual([
      "2026-09-14",
      "2026-09-24",
    ]);
  });

  it("busca en los feelings sin distinguir mayúsculas ni acentos", () => {
    const result = filterDays(days, { ...NO_FILTER, search: "ENERGIA" });
    expect(result.map((item) => item.date)).toEqual(["2026-10-01"]);
  });

  it("combina los filtros", () => {
    const result = filterDays(days, {
      range: { from: "2026-09-20", to: null },
      tag: "saturado",
      search: "tilt",
    });
    expect(result.map((item) => item.date)).toEqual(["2026-09-24"]);
  });
});

describe("allTags", () => {
  it("ordena por frecuencia y luego alfabéticamente", () => {
    expect(allTags(days)).toEqual(["saturado", "tilt"]);
    expect(
      allTags([...days, day("2026-10-02", "", ["tilt", "autopilot"])]),
    ).toEqual(["tilt", "saturado", "autopilot"]);
  });
});

describe("feelingsPreview", () => {
  it("deja el texto en una línea sin sintaxis de Markdown", () => {
    expect(
      feelingsPreview(
        "## Resumen\n\nDía **muy** _bueno_.\n\n- Aim fino\n- Sin #tilt\n\n![captura](attachments/a.png) y [vod](https://x.y)",
      ),
    ).toBe("Resumen Día muy bueno. Aim fino Sin #tilt [imagen] y vod");
  });
});
