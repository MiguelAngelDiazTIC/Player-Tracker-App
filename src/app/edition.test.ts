// @vitest-environment node
import { describe, expect, it } from "vitest";
import { DEFAULT_FIELDS } from "../domain/fields";
import { aggregateKind, chartKind } from "../domain/stats";
import { EDITIONS, resolveEdition } from "./edition";
import { sectionsFor } from "./sections";

describe("ediciones", () => {
  it("sin VITE_EDITION se compila la base", () => {
    expect(resolveEdition(undefined)).toBe(EDITIONS.base);
    expect(resolveEdition("")).toBe(EDITIONS.base);
    expect(resolveEdition("saiz")).toBe(EDITIONS.saiz);
  });

  it("un nombre de edición mal escrito no pasa por la base", () => {
    expect(() => resolveEdition("sainz")).toThrow(/no es una edición/);
  });

  it("la base no cambia", () => {
    expect(EDITIONS.base.defaultFields).toBe(DEFAULT_FIELDS);
    expect(sectionsFor(EDITIONS.base)).toHaveLength(9);
  });

  it("en Saiz la columna de scrims es un número en el mismo sitio", () => {
    const fields = EDITIONS.saiz.defaultFields;
    expect(fields.map((field) => field.key)).toEqual(
      DEFAULT_FIELDS.map((field) => field.key),
    );
    const scrims = fields.find((field) => field.key === "scrims");
    expect(scrims).toMatchObject({
      label: "10mans / scrims",
      type: "number",
      group: "Juego",
      order: 1,
    });
    // Sigue contando como volumen: se suma y se dibuja con barras.
    expect(scrims && aggregateKind(scrims)).toBe("total");
    expect(scrims && chartKind(scrims)).toBe("bars");
  });

  it("Saiz no tiene la sección de scrims", () => {
    expect(
      sectionsFor(EDITIONS.saiz).some((section) => section.id === "scrims"),
    ).toBe(false);
  });
});
