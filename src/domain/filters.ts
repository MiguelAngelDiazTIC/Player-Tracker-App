import { addDays } from "./dates";
import type { Day } from "./day";

export const RANGE_PRESETS = ["all", "7d", "30d", "month", "custom"] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number];

export const RANGE_PRESET_LABELS: Record<RangePreset, string> = {
  all: "Todo",
  "7d": "Últimos 7 días",
  "30d": "Últimos 30 días",
  month: "Este mes",
  custom: "Personalizado",
};

/** Fechas ISO, ambas incluidas; `null` deja ese extremo abierto. */
export interface DateRange {
  from: string | null;
  to: string | null;
}

export const OPEN_RANGE: DateRange = { from: null, to: null };

/** Rango de un preajuste respecto a hoy. `custom` no cambia el rango. */
export function presetRange(
  preset: Exclude<RangePreset, "custom">,
  today: string,
): DateRange {
  switch (preset) {
    case "all":
      return OPEN_RANGE;
    case "7d":
      return { from: addDays(today, -6), to: today };
    case "30d":
      return { from: addDays(today, -29), to: today };
    case "month":
      return { from: `${today.slice(0, 8)}01`, to: null };
  }
}

export function inRange(date: string, range: DateRange): boolean {
  if (range.from !== null && date < range.from) return false;
  if (range.to !== null && date > range.to) return false;
  return true;
}

export interface DayFilter {
  range: DateRange;
  /** Solo días con esta `#etiqueta`. */
  tag: string | null;
  /** Texto que deben contener los feelings. */
  search: string;
}

export const NO_FILTER: DayFilter = {
  range: OPEN_RANGE,
  tag: null,
  search: "",
};

function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

export function filterDays(days: readonly Day[], filter: DayFilter): Day[] {
  const search = fold(filter.search.trim());
  return days.filter(
    (day) =>
      inRange(day.date, filter.range) &&
      (filter.tag === null || day.tags.includes(filter.tag)) &&
      (search === "" || fold(day.feelingsMd).includes(search)),
  );
}

/** Etiquetas usadas, de la más frecuente a la menos. */
export function allTags(days: readonly Day[]): string[] {
  const counts = new Map<string, number>();
  for (const day of days) {
    for (const tag of day.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([tag]) => tag);
}

/** Feelings en una línea para la tabla: sin sintaxis de Markdown. */
export function feelingsPreview(markdown: string): string {
  return markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "[imagen]")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, "")
    .replace(/(\*\*|__|\*|_|`|~~)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
