import type { Day } from "./day";
import { isNumericType, type FieldDefinition, type FieldValue } from "./fields";

/** Verde = cumplido o por encima de la media, naranja = aviso, rojo = fallado. */
export type CellStatus = "good" | "warn" | "bad" | "neutral";

export function fieldStatus(
  field: Pick<FieldDefinition, "type" | "thresholds">,
  value: FieldValue,
  average: number | null = null,
): CellStatus {
  if (value === null) return "neutral";

  if (field.type === "bool") return value === true ? "good" : "bad";
  if (field.type === "tristate") {
    if (value === "done") return "good";
    return value === "missed" ? "bad" : "neutral";
  }

  const thresholds = field.thresholds;
  if (typeof value !== "number" || thresholds === null) return "neutral";

  if (thresholds.mode === "average") {
    return average !== null && value >= average ? "good" : "neutral";
  }

  const reaches = (limit: number) =>
    thresholds.direction === "higher" ? value >= limit : value <= limit;
  if (reaches(thresholds.good)) return "good";
  if (thresholds.warn !== null && reaches(thresholds.warn)) return "warn";
  return "bad";
}

/** Media de un campo numérico; los días sin dato no cuentan. */
export function fieldAverage(days: readonly Day[], key: string): number | null {
  let sum = 0;
  let count = 0;
  for (const day of days) {
    const value = day.values[key];
    if (typeof value === "number") {
      sum += value;
      count += 1;
    }
  }
  return count === 0 ? null : sum / count;
}

export function fieldAverages(
  fields: readonly FieldDefinition[],
  days: readonly Day[],
): Record<string, number | null> {
  const averages: Record<string, number | null> = {};
  for (const field of fields) {
    if (isNumericType(field.type)) {
      averages[field.key] = fieldAverage(days, field.key);
    }
  }
  return averages;
}
