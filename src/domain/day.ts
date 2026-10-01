import { z } from "zod";
import { isIsoDate } from "./dates";
import { fieldValueSchema } from "./fields";

export const isoDateSchema = z
  .string()
  .refine(isIsoDate, { message: "La fecha debe ser YYYY-MM-DD" });

export const daySchema = z.object({
  date: isoDateSchema,
  values: z.record(z.string(), fieldValueSchema),
  feelingsMd: z.string(),
  tags: z.array(z.string()),
});

export type Day = z.infer<typeof daySchema>;

export function emptyDay(date: string): Day {
  return { date, values: {}, feelingsMd: "", tags: [] };
}
