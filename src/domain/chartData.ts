import type { Day } from "./day";
import type { FieldDefinition } from "./fields";
import { datesBetween, movingAverage } from "./stats";

export interface DailyPoint {
  date: string;
  /** `null` en los días sin dato o sin registrar. */
  value: number | null;
  /** Media móvil de 7 días, solo en los días con dato. */
  average: number | null;
}

/**
 * Un punto por día natural entre el primer y el último día mostrado, para
 * que los huecos se vean como huecos. La media móvil se calcula con todos los
 * días de la app, así el principio del rango ya llega con su media completa.
 */
export function dailySeries(
  shownDays: readonly Day[],
  allDays: readonly Day[],
  field: Pick<FieldDefinition, "key" | "type">,
  scrimCounts: Readonly<Record<string, number>>,
): DailyPoint[] {
  if (shownDays.length === 0) return [];
  const dates = shownDays.map((day) => day.date).sort();
  const byDate = new Map(shownDays.map((day) => [day.date, day]));
  const averages =
    field.type === "scrim_count" ? {} : movingAverage(allDays, field.key);

  return datesBetween(dates[0], dates[dates.length - 1]).map((date) => {
    const day = byDate.get(date);
    let value: number | null = null;
    if (day) {
      const raw =
        field.type === "scrim_count"
          ? (scrimCounts[date] ?? 0)
          : day.values[field.key];
      value = typeof raw === "number" ? raw : null;
    }
    return {
      date,
      value,
      average: value === null ? null : (averages[date] ?? null),
    };
  });
}

/** Marcas del eje de una duración: horas enteras, seis como mucho. */
export function durationTicks(minutes: readonly number[]): number[] {
  if (minutes.length === 0) return [];
  const low = Math.floor(Math.min(...minutes) / 60);
  const high = Math.max(low + 1, Math.ceil(Math.max(...minutes) / 60));
  const step = Math.max(1, Math.ceil((high - low) / 5));
  const ticks: number[] = [];
  for (let hour = low; hour < high + step; hour += step) ticks.push(hour * 60);
  return ticks;
}
