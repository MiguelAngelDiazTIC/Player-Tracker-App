import { describe, expect, it } from "vitest";
import {
  addDays,
  formatDate,
  formatLongDate,
  isIsoDate,
  parseSheetDate,
  serialToIsoDate,
  todayIso,
} from "./dates";

describe("parseSheetDate", () => {
  it.each([
    ["14/09/2026", "2026-09-14"],
    ["1/8/2026", "2026-08-01"],
    ["01-08-2026", "2026-08-01"],
    ["14.09.26", "2026-09-14"],
    ["2026-09-14", "2026-09-14"],
    [" 14/09/2026 ", "2026-09-14"],
  ])("entiende %s", (text, iso) => {
    expect(parseSheetDate(text)).toBe(iso);
  });

  it("lee día/mes y no mes/día", () => {
    expect(parseSheetDate("03/04/2026")).toBe("2026-04-03");
  });

  it.each(["", "ayer", "31/02/2026", "14/13/2026", "2026-13-01", "14/09"])(
    "rechaza %j",
    (text) => {
      expect(parseSheetDate(text)).toBeNull();
    },
  );
});

describe("serialToIsoDate", () => {
  it("convierte el número de serie de Excel", () => {
    expect(serialToIsoDate(46279)).toBe("2026-09-14");
    expect(serialToIsoDate(46279.75)).toBe("2026-09-14");
  });

  it("rechaza números que no son fechas", () => {
    expect(serialToIsoDate(0)).toBeNull();
    expect(serialToIsoDate(Number.NaN)).toBeNull();
  });
});

describe("formato y aritmética", () => {
  it("escribe la fecha como en la hoja", () => {
    expect(formatDate("2026-09-14")).toBe("14/09/2026");
  });

  it("escribe la fecha larga en español", () => {
    expect(formatLongDate("2026-09-14")).toBe(
      "lunes, 14 de septiembre de 2026",
    );
  });

  it("suma y resta días cruzando meses", () => {
    expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("usa la fecha local para hoy", () => {
    expect(todayIso(new Date(2026, 9, 2, 23, 59))).toBe("2026-10-02");
    expect(todayIso(new Date(2026, 0, 5, 0, 1))).toBe("2026-01-05");
  });

  it("valida fechas ISO reales", () => {
    expect(isIsoDate("2026-02-28")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("14/09/2026")).toBe(false);
  });
});
