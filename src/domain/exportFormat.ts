import { z } from "zod";
import { daySchema } from "./day";
import { fieldDefinitionSchema, isValidFieldValue } from "./fields";
import { noteSchema } from "./notes";
import { rankedSessionSchema } from "./ranked";
import { weeklyReviewSchema } from "./review";
import { scrimMatchSchema } from "./scrims";

export const EXPORT_FORMAT = "player-tracker";
export const EXPORT_VERSION = 1;

/**
 * Ajustes que nunca salen en el JSON. La sincronización con HenrikDev se quitó,
 * pero una instalación que la usó aún puede tener su clave guardada.
 */
export const SECRET_SETTING_KEYS: readonly string[] = ["henrikdev.apiKey"];

/** Imagen de `attachments/`, incrustada en base64 para que todo sea un archivo. */
export const attachmentSchema = z.object({
  name: z.string().regex(/^[\w.-]+$/, "Nombre de archivo no válido"),
  dataBase64: z.string(),
});

export type ExportedAttachment = z.infer<typeof attachmentSchema>;

export const exportSchema = z
  .object({
    format: z.literal(EXPORT_FORMAT),
    version: z.literal(EXPORT_VERSION),
    exportedAt: z.string(),
    fieldDefinitions: z.array(fieldDefinitionSchema),
    days: z.array(daySchema),
    scrimMatches: z.array(scrimMatchSchema),
    // Opcional: los archivos anteriores a la revisión semanal no la traen.
    weeklyReviews: z.array(weeklyReviewSchema).default([]),
    rankedSessions: z.array(rankedSessionSchema),
    notes: z.array(noteSchema),
    settings: z.record(z.string(), z.unknown()),
    attachments: z.array(attachmentSchema).default([]),
  })
  .superRefine((data, context) => {
    const typeByKey = new Map(
      data.fieldDefinitions.map((field) => [field.key, field.type]),
    );
    data.days.forEach((day, index) => {
      for (const [key, value] of Object.entries(day.values)) {
        const type = typeByKey.get(key);
        if (type !== undefined && !isValidFieldValue(type, value)) {
          context.addIssue({
            code: "custom",
            path: ["days", index, "values", key],
            message: `El valor ${JSON.stringify(value)} no encaja con un campo de tipo ${type}`,
          });
        }
      }
    });

    const repeated = (values: string[]) =>
      values.filter((value, index) => values.indexOf(value) !== index);
    for (const date of new Set(repeated(data.days.map((day) => day.date)))) {
      context.addIssue({
        code: "custom",
        path: ["days"],
        message: `El día ${date} aparece más de una vez`,
      });
    }
    for (const key of new Set(
      repeated(data.fieldDefinitions.map((field) => field.key)),
    )) {
      context.addIssue({
        code: "custom",
        path: ["fieldDefinitions"],
        message: `El campo "${key}" aparece más de una vez`,
      });
    }
  });

export type ExportData = z.infer<typeof exportSchema>;

export type ParsedExport =
  { ok: true; data: ExportData } | { ok: false; errors: string[] };

/** Valida el texto de un archivo de exportación antes de tocar nada. */
export function parseExport(text: string): ParsedExport {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, errors: ["El archivo no es un JSON válido"] };
  }

  const result = exportSchema.safeParse(json);
  if (result.success) return { ok: true, data: result.data };

  return {
    ok: false,
    errors: result.error.issues.map((issue) => {
      const where = issue.path.join(".");
      return where === "" ? issue.message : `${where}: ${issue.message}`;
    }),
  };
}
