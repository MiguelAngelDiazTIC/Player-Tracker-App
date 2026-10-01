import { describe, expect, it } from "vitest";
import {
  appendField,
  changedFields,
  moveField,
  moveGroup,
  setFieldArchived,
  setFieldGroup,
} from "./fieldOrder";
import { DEFAULT_FIELDS, groupFields, type FieldDefinition } from "./fields";

const layout = (fields: readonly FieldDefinition[]) =>
  groupFields(fields.filter((field) => !field.archived)).map(
    (entry) =>
      `${entry.group}: ${entry.fields.map((field) => field.key).join(" ")}`,
  );

describe("ordenar campos", () => {
  it("mueve un campo dentro de su grupo", () => {
    expect(layout(moveField(DEFAULT_FIELDS, "default-dms", -1))[0]).toBe(
      "Juego: rankeds dms scrims kovaaks",
    );
    expect(layout(moveField(DEFAULT_FIELDS, "default-rankeds", 1))[0]).toBe(
      "Juego: scrims rankeds dms kovaaks",
    );
  });

  it("no saca un campo de su grupo al llegar al borde", () => {
    expect(layout(moveField(DEFAULT_FIELDS, "default-rankeds", -1))).toEqual(
      layout(DEFAULT_FIELDS),
    );
    expect(layout(moveField(DEFAULT_FIELDS, "default-kovaaks", 1))).toEqual(
      layout(DEFAULT_FIELDS),
    );
  });

  it("mueve un grupo entero", () => {
    expect(
      layout(moveGroup(DEFAULT_FIELDS, "Sueño", -1)).map(
        (line) => line.split(":")[0],
      ),
    ).toEqual(["Juego", "Sueño", "Hábitos core", "Rendimiento"]);
  });

  it("cambia un campo de grupo y lo deja el último", () => {
    const moved = setFieldGroup(DEFAULT_FIELDS, "default-kovaaks", "Sueño");
    expect(layout(moved)).toEqual([
      "Juego: rankeds scrims dms",
      "Hábitos core: gym supplements nutrition",
      "Sueño: sleep_score sleep_hours kovaaks",
      "Rendimiento: kd acs",
    ]);
  });

  it("crea el grupo si no existía", () => {
    const moved = setFieldGroup(DEFAULT_FIELDS, "default-kovaaks", "Aim");
    expect(layout(moved).at(-1)).toBe("Aim: kovaaks");
  });

  it("numera el orden de forma consecutiva", () => {
    const moved = moveGroup(DEFAULT_FIELDS, "Rendimiento", -1);
    expect(moved.map((field) => field.order)).toEqual(
      moved.map((_, index) => index),
    );
  });
});

describe("archivar y añadir", () => {
  it("archiva sin borrar y deja el campo fuera de los grupos", () => {
    const archived = setFieldArchived(DEFAULT_FIELDS, "default-kovaaks", true);
    expect(archived).toHaveLength(DEFAULT_FIELDS.length);
    expect(layout(archived)[0]).toBe("Juego: rankeds scrims dms");
    expect(archived.at(-1)).toMatchObject({ key: "kovaaks", archived: true });
  });

  it("recupera un campo al final de su grupo", () => {
    const archived = setFieldArchived(DEFAULT_FIELDS, "default-rankeds", true);
    const restored = setFieldArchived(archived, "default-rankeds", false);
    expect(layout(restored)[0]).toBe("Juego: scrims dms kovaaks rankeds");
  });

  it("añade un campo al final de su grupo", () => {
    const added = appendField(DEFAULT_FIELDS, {
      id: "nuevo",
      key: "cafe",
      label: "Cafés",
      type: "number",
      group: "Hábitos core",
      order: 0,
      thresholds: null,
      archived: false,
    });
    expect(layout(added)[1]).toBe(
      "Hábitos core: gym supplements nutrition cafe",
    );
  });
});

describe("changedFields", () => {
  it("devuelve solo los campos que cambiaron", () => {
    const moved = moveField(DEFAULT_FIELDS, "default-dms", -1);
    expect(
      changedFields(DEFAULT_FIELDS, moved).map((field) => field.key),
    ).toEqual(["dms", "scrims"]);
    expect(changedFields(DEFAULT_FIELDS, [...DEFAULT_FIELDS])).toEqual([]);
  });
});
