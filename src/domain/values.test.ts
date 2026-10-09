import { describe, expect, it } from "vitest";
import type { Day } from "./day";
import { DEFAULT_FIELDS, groupFields, makeFieldKey } from "./fields";
import { extractTags } from "./tags";
import { fieldAverage, fieldStatus } from "./thresholds";
import { formatFieldValue, parseFieldInput } from "./values";

describe("parseFieldInput", () => {
  it("lee enteros, decimales con coma y escalas", () => {
    expect(parseFieldInput("number", "8")).toEqual({ ok: true, value: 8 });
    expect(parseFieldInput("decimal", "1,15")).toEqual({
      ok: true,
      value: 1.15,
    });
    expect(parseFieldInput("decimal", "01.08")).toEqual({
      ok: true,
      value: 1.08,
    });
    expect(parseFieldInput("scale", "88")).toEqual({ ok: true, value: 88 });
    expect(parseFieldInput("duration", "6h49")).toEqual({
      ok: true,
      value: 409,
    });
  });

  it("trata vacío y X como sin dato en cualquier tipo", () => {
    for (const type of ["number", "decimal", "scale", "duration"] as const) {
      expect(parseFieldInput(type, "")).toEqual({ ok: true, value: null });
      expect(parseFieldInput(type, "X")).toEqual({ ok: true, value: null });
    }
  });

  it("rechaza lo que no encaja con el tipo", () => {
    expect(parseFieldInput("number", "1.5").ok).toBe(false);
    expect(parseFieldInput("number", "ocho").ok).toBe(false);
    expect(parseFieldInput("scale", "101").ok).toBe(false);
    expect(parseFieldInput("decimal", "1.2.3").ok).toBe(false);
  });
});

describe("formatFieldValue", () => {
  it("escribe cada tipo como se ve en la tabla", () => {
    expect(formatFieldValue("decimal", 1.2)).toBe("1.20");
    expect(formatFieldValue("duration", 409)).toBe("6h49");
    expect(formatFieldValue("number", 225)).toBe("225");
    expect(formatFieldValue("tristate", "rest")).toBe("Descanso");
    expect(formatFieldValue("number", null)).toBe("");
  });
});

describe("extractTags", () => {
  it("saca las etiquetas en minúsculas y sin repetir", () => {
    expect(
      extractTags("Día de #Tilt y #autopilot. Otra vez #tilt, #sueño-malo."),
    ).toEqual(["tilt", "autopilot", "sueño-malo"]);
  });

  it("ignora títulos de Markdown, números y enlaces", () => {
    expect(
      extractTags("# Título\n## Otro\nPartida #3 en web.com/#ancla"),
    ).toEqual([]);
  });
});

describe("fieldStatus", () => {
  const field = (key: string) => {
    const found = DEFAULT_FIELDS.find((entry) => entry.key === key);
    if (!found) throw new Error(`Falta el campo ${key}`);
    return found;
  };

  it("colorea hábitos: hecho verde, descanso neutro, fallado rojo", () => {
    expect(fieldStatus(field("gym"), "done")).toBe("good");
    expect(fieldStatus(field("gym"), "rest")).toBe("neutral");
    expect(fieldStatus(field("gym"), "missed")).toBe("bad");
    expect(fieldStatus(field("nutrition"), true)).toBe("good");
    expect(fieldStatus(field("nutrition"), false)).toBe("bad");
  });

  it("aplica umbrales fijos al sueño", () => {
    expect(fieldStatus(field("sleep_score"), 88)).toBe("good");
    expect(fieldStatus(field("sleep_score"), 77)).toBe("warn");
    expect(fieldStatus(field("sleep_score"), 52)).toBe("bad");
    expect(fieldStatus(field("sleep_hours"), 210)).toBe("bad");
  });

  it("marca en verde lo que iguala o supera la media", () => {
    expect(fieldStatus(field("kd"), 1.52, 1.15)).toBe("good");
    expect(fieldStatus(field("kd"), 0.92, 1.15)).toBe("neutral");
    expect(fieldStatus(field("kd"), 1.52, null)).toBe("neutral");
  });

  it("deja sin color los valores sin dato y los campos sin umbral", () => {
    expect(fieldStatus(field("sleep_score"), null)).toBe("neutral");
    expect(fieldStatus(field("rankeds"), 12)).toBe("neutral");
  });
});

describe("fieldAverage", () => {
  it("no cuenta los días sin dato", () => {
    const days: Day[] = [
      { date: "2026-09-14", values: { kd: 1 }, feelingsMd: "", tags: [] },
      { date: "2026-09-15", values: { kd: null }, feelingsMd: "", tags: [] },
      { date: "2026-09-16", values: {}, feelingsMd: "", tags: [] },
      { date: "2026-09-17", values: { kd: 2 }, feelingsMd: "", tags: [] },
    ];
    expect(fieldAverage(days, "kd")).toBe(1.5);
    expect(fieldAverage(days, "acs")).toBeNull();
  });
});

describe("campos", () => {
  it("agrupa la plantilla como la hoja", () => {
    expect(
      groupFields(DEFAULT_FIELDS).map((entry) => [
        entry.group,
        entry.fields.map((item) => item.label),
      ]),
    ).toEqual([
      ["Juego", ["Rankeds", "10mans / scrims", "DMs", "Kovaaks"]],
      ["Hábitos core", ["Gimnasio", "Suplementación", "Nutrición"]],
      ["Sueño", ["Sleep score", "Horas de sueño"]],
      ["Rendimiento", ["K/D", "ACS", "Agentes", "Mapas"]],
    ]);
  });

  it("genera claves únicas a partir del nombre", () => {
    expect(makeFieldKey("Café (tazas)", [])).toBe("cafe_tazas");
    expect(makeFieldKey("K/D", ["kd", "k_d"])).toBe("k_d_2");
    expect(makeFieldKey("¿?", [])).toBe("campo");
  });
});
