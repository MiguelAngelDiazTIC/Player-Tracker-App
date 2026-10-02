import { describe, expect, it } from "vitest";
import {
  addMonths,
  heatStep,
  monthGrid,
  monthLabel,
  monthOf,
  monthRange,
} from "./calendar";
import { periodRanges } from "./stats";

describe("meses", () => {
  it("suma y resta meses cruzando años", () => {
    expect(addMonths("2026-09", 1)).toBe("2026-10");
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
  });

  it("nombra el mes en español", () => {
    expect(monthLabel("2026-09")).toBe("septiembre de 2026");
    expect(monthOf("2026-09-14")).toBe("2026-09");
  });

  it("da el primer y el último día", () => {
    expect(monthRange("2026-09")).toEqual({
      from: "2026-09-01",
      to: "2026-09-30",
    });
    expect(monthRange("2028-02")).toEqual({
      from: "2028-02-01",
      to: "2028-02-29",
    });
  });
});

describe("monthGrid", () => {
  it("coloca cada día bajo su día de la semana, empezando en lunes", () => {
    const grid = monthGrid("2026-09");
    // El 1 de septiembre de 2026 es martes.
    expect(grid[0]).toEqual([
      null,
      "2026-09-01",
      "2026-09-02",
      "2026-09-03",
      "2026-09-04",
      "2026-09-05",
      "2026-09-06",
    ]);
    expect(grid[2][0]).toBe("2026-09-14");
    expect(grid.at(-1)).toEqual([
      "2026-09-28",
      "2026-09-29",
      "2026-09-30",
      null,
      null,
      null,
      null,
    ]);
    expect(grid).toHaveLength(5);
  });

  it("no añade semanas vacías cuando el mes acaba en domingo", () => {
    // Febrero de 2026 empieza en domingo... y mayo acaba en domingo.
    const may = monthGrid("2026-05");
    expect(may.at(-1)?.[6]).toBe("2026-05-31");
    expect(may.flat().filter(Boolean)).toHaveLength(31);
  });
});

describe("heatStep", () => {
  it("reparte el rango en cinco pasos", () => {
    expect(heatStep(0.9, 0.9, 1.9)).toBe(0);
    expect(heatStep(1.15, 0.9, 1.9)).toBe(1);
    expect(heatStep(1.4, 0.9, 1.9)).toBe(2);
    expect(heatStep(1.89, 0.9, 1.9)).toBe(4);
    expect(heatStep(1.9, 0.9, 1.9)).toBe(4);
  });

  it("con un solo valor usa el paso más intenso", () => {
    expect(heatStep(3, 3, 3)).toBe(4);
  });
});

describe("periodRanges", () => {
  it("da el periodo que acaba hoy y el anterior, sin solaparse", () => {
    expect(periodRanges("2026-10-02", 7)).toEqual({
      current: { from: "2026-09-26", to: "2026-10-02" },
      previous: { from: "2026-09-19", to: "2026-09-25" },
    });
    expect(periodRanges("2026-10-02", 30).previous).toEqual({
      from: "2026-08-04",
      to: "2026-09-02",
    });
  });
});
