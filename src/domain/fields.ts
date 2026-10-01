import { z } from "zod";
import { normalizeText } from "./parse";

export const FIELD_TYPES = [
  "number",
  "decimal",
  "duration",
  "scale",
  "tristate",
  "bool",
  "text",
  "tag",
  // Recuento de partidas del día en el registro de scrims; no se edita.
  "scrim_count",
] as const;

export type FieldType = (typeof FIELD_TYPES)[number];

/** Tipos que el usuario puede elegir al crear un campo. */
export const USER_FIELD_TYPES = FIELD_TYPES.filter(
  (type) => type !== "scrim_count",
);

export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  number: "Número entero",
  decimal: "Número decimal",
  duration: "Duración",
  scale: "Escala 0-100",
  tristate: "Hecho / descanso / no hecho",
  bool: "Sí / no",
  text: "Texto",
  tag: "Etiqueta",
  scrim_count: "Recuento de scrims (calculado)",
};

export const TRISTATE_VALUES = ["done", "rest", "missed"] as const;
export type TristateValue = (typeof TRISTATE_VALUES)[number];

export const TRISTATE_LABELS: Record<TristateValue, string> = {
  done: "Hecho",
  rest: "Descanso",
  missed: "No hecho",
};

/** `null` es "sin dato": no cuenta en medias ni gráficas. */
export type FieldValue = number | boolean | string | null;

export const fieldValueSchema = z.union([
  z.number(),
  z.boolean(),
  z.string(),
  z.null(),
]);

export const thresholdsSchema = z.union([
  // Umbrales fijos: verde desde `good`, naranja desde `warn`, rojo el resto.
  z.object({
    mode: z.literal("fixed"),
    direction: z.enum(["higher", "lower"]),
    good: z.number(),
    warn: z.number().nullable(),
  }),
  // Verde cuando el valor iguala o supera la media del jugador.
  z.object({ mode: z.literal("average") }),
]);

export type Thresholds = z.infer<typeof thresholdsSchema>;

export const fieldDefinitionSchema = z.object({
  id: z.string().min(1),
  key: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(FIELD_TYPES),
  group: z.string(),
  order: z.number().int(),
  thresholds: thresholdsSchema.nullable(),
  archived: z.boolean(),
});

export type FieldDefinition = z.infer<typeof fieldDefinitionSchema>;

const NUMERIC_TYPES: readonly FieldType[] = [
  "number",
  "decimal",
  "duration",
  "scale",
];

export function isNumericType(type: FieldType): boolean {
  return NUMERIC_TYPES.includes(type);
}

export function isValidFieldValue(type: FieldType, value: FieldValue): boolean {
  if (value === null) return true;
  switch (type) {
    case "number":
      return typeof value === "number" && Number.isInteger(value);
    case "decimal":
      return typeof value === "number" && Number.isFinite(value);
    case "duration":
      return typeof value === "number" && Number.isInteger(value) && value >= 0;
    case "scale":
      return typeof value === "number" && value >= 0 && value <= 100;
    case "tristate":
      return (
        typeof value === "string" &&
        (TRISTATE_VALUES as readonly string[]).includes(value)
      );
    case "bool":
      return typeof value === "boolean";
    case "text":
    case "tag":
      return typeof value === "string";
    case "scrim_count":
      return false;
  }
}

/** La plantilla por defecto es la hoja "VALORANT DAILY CHECKLIST". */
export const DEFAULT_FIELDS: readonly FieldDefinition[] = [
  { key: "rankeds", label: "Rankeds", type: "number", group: "Juego" },
  {
    key: "scrims",
    label: "10mans / scrims",
    type: "scrim_count",
    group: "Juego",
  },
  { key: "dms", label: "DMs", type: "number", group: "Juego" },
  { key: "kovaaks", label: "Kovaaks", type: "number", group: "Juego" },
  { key: "gym", label: "Gimnasio", type: "tristate", group: "Hábitos core" },
  {
    key: "supplements",
    label: "Suplementación",
    type: "bool",
    group: "Hábitos core",
  },
  { key: "nutrition", label: "Nutrición", type: "bool", group: "Hábitos core" },
  {
    key: "sleep_score",
    label: "Sleep score",
    type: "scale",
    group: "Sueño",
    thresholds: { mode: "fixed", direction: "higher", good: 80, warn: 70 },
  },
  {
    key: "sleep_hours",
    label: "Horas de sueño",
    type: "duration",
    group: "Sueño",
    thresholds: { mode: "fixed", direction: "higher", good: 420, warn: 360 },
  },
  {
    key: "kd",
    label: "K/D",
    type: "decimal",
    group: "Rendimiento",
    thresholds: { mode: "average" },
  },
  {
    key: "acs",
    label: "ACS",
    type: "number",
    group: "Rendimiento",
    thresholds: { mode: "average" },
  },
].map((field, index) => ({
  thresholds: null,
  ...field,
  id: `default-${field.key}`,
  order: index,
  archived: false,
})) as FieldDefinition[];

export function sortFields<T extends Pick<FieldDefinition, "order">>(
  fields: readonly T[],
): T[] {
  return [...fields].sort((a, b) => a.order - b.order);
}

export interface FieldGroup {
  group: string;
  fields: FieldDefinition[];
}

/** Campos por grupo, con los grupos en el orden de su primer campo. */
export function groupFields(fields: readonly FieldDefinition[]): FieldGroup[] {
  const groups: FieldGroup[] = [];
  for (const field of sortFields(fields)) {
    const existing = groups.find((entry) => entry.group === field.group);
    if (existing) existing.fields.push(field);
    else groups.push({ group: field.group, fields: [field] });
  }
  return groups;
}

/** Clave estable para un campo nuevo a partir de su nombre. */
export function makeFieldKey(
  label: string,
  existingKeys: readonly string[],
): string {
  const base =
    label
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "campo";
  let key = base;
  for (let suffix = 2; existingKeys.includes(key); suffix += 1) {
    key = `${base}_${suffix}`;
  }
  return key;
}

/** ¿El texto de una cabecera de la hoja se refiere a este campo? */
export function matchesFieldName(field: FieldDefinition, header: string) {
  const normalized = normalizeText(header);
  return (
    normalized === normalizeText(field.label) ||
    normalized === normalizeText(field.key)
  );
}
