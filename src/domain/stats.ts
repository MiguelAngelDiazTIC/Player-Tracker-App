import { addDays } from "./dates";
import type { Day } from "./day";
import { isNumericType, type FieldDefinition, type FieldValue } from "./fields";
import { inRange, type DateRange } from "./filters";
import { kdRatio, type ScrimMatch } from "./scrims";

/** Lunes de la semana de una fecha. */
export function weekStart(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return addDays(iso, -((weekday + 6) % 7));
}

/** Los siete días de una semana, de lunes a domingo. */
export function weekDates(start: string): string[] {
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

/** Todas las fechas entre dos, ambas incluidas. */
export function datesBetween(from: string, to: string): string[] {
  const dates: string[] = [];
  for (let date = from; date <= to; date = addDays(date, 1)) dates.push(date);
  return dates;
}

export function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

/** Valores numéricos de un campo; los días sin dato no cuentan. */
export function numericValues(days: readonly Day[], key: string): number[] {
  return days
    .map((day) => day.values[key])
    .filter((value): value is number => typeof value === "number");
}

/**
 * Cómo se resume un campo numérico: el volumen (enteros sin umbral, como las
 * rankeds) se suma; lo demás (sueño, K/D, ACS) se promedia.
 */
export type AggregateKind = "total" | "mean";

export function aggregateKind(
  field: Pick<FieldDefinition, "type" | "thresholds">,
): AggregateKind {
  return field.type === "scrim_count" ||
    (field.type === "number" && field.thresholds === null)
    ? "total"
    : "mean";
}

export function aggregate(
  kind: AggregateKind,
  values: readonly number[],
): number | null {
  if (values.length === 0) return null;
  return kind === "total"
    ? values.reduce((total, value) => total + value, 0)
    : mean(values);
}

/**
 * Media móvil por fecha: la media de los días con dato en la ventana de
 * `windowDays` días naturales que acaba en esa fecha.
 */
export function movingAverage(
  days: readonly Day[],
  key: string,
  windowDays = 7,
): Record<string, number> {
  const valueByDate = new Map<string, number>();
  for (const day of days) {
    const value = day.values[key];
    if (typeof value === "number") valueByDate.set(day.date, value);
  }

  const averages: Record<string, number> = {};
  for (const date of valueByDate.keys()) {
    const window: number[] = [];
    for (let offset = 0; offset < windowDays; offset += 1) {
      const value = valueByDate.get(addDays(date, -offset));
      if (value !== undefined) window.push(value);
    }
    const average = mean(window);
    if (average !== null) averages[date] = average;
  }
  return averages;
}

/**
 * ¿Se cumplió el hábito? `null` es sin dato. En un hábito de tres estados el
 * descanso cuenta como cumplido: es un día planificado, no un fallo.
 */
export function habitDone(value: FieldValue | undefined): boolean | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "boolean") return value;
  if (value === "done" || value === "rest") return true;
  if (value === "missed") return false;
  return null;
}

export function isHabit(field: Pick<FieldDefinition, "type">): boolean {
  return field.type === "bool" || field.type === "tristate";
}

export interface Compliance {
  /** Días cumplidos. */
  done: number;
  /** Días con dato. */
  counted: number;
  /** Porcentaje de 0 a 100, o `null` si no hay ningún día con dato. */
  percent: number | null;
}

export function compliance(days: readonly Day[], key: string): Compliance {
  let done = 0;
  let counted = 0;
  for (const day of days) {
    const result = habitDone(day.values[key]);
    if (result === null) continue;
    counted += 1;
    if (result) done += 1;
  }
  return {
    done,
    counted,
    percent: counted === 0 ? null : (done / counted) * 100,
  };
}

export interface WeeklyCompliance extends Compliance {
  weekStart: string;
}

/** Cumplimiento de un hábito por semana, solo de las semanas con algún dato. */
export function weeklyCompliance(
  days: readonly Day[],
  key: string,
): WeeklyCompliance[] {
  const byWeek = new Map<string, Day[]>();
  for (const day of days) {
    const start = weekStart(day.date);
    byWeek.set(start, [...(byWeek.get(start) ?? []), day]);
  }
  return [...byWeek.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([start, weekDays]) => ({
      weekStart: start,
      ...compliance(weekDays, key),
    }))
    .filter((week) => week.counted > 0);
}

export interface Streak {
  /** Días seguidos hasta hoy (o hasta ayer, si hoy aún no hay dato). */
  current: number;
  best: number;
}

/**
 * Rachas de días naturales consecutivos que cumplen `passes`. Un día sin
 * registrar rompe la racha, salvo hoy: mientras no se rellene, cuenta la de
 * ayer.
 */
export function streak(
  days: readonly Day[],
  passes: (day: Day) => boolean,
  today: string,
): Streak {
  const passing = new Set(days.filter(passes).map((day) => day.date));

  let best = 0;
  for (const date of passing) {
    if (passing.has(addDays(date, -1))) continue;
    let length = 1;
    while (passing.has(addDays(date, length))) length += 1;
    best = Math.max(best, length);
  }

  let current = 0;
  let cursor = passing.has(today) ? today : addDays(today, -1);
  while (passing.has(cursor)) {
    current += 1;
    cursor = addDays(cursor, -1);
  }
  return { current, best };
}

/** ¿El día tiene todos los hábitos cumplidos (y ninguno sin dato)? */
export function allHabitsDone(
  day: Day,
  habits: readonly Pick<FieldDefinition, "key">[],
): boolean {
  return (
    habits.length > 0 &&
    habits.every((habit) => habitDone(day.values[habit.key]) === true)
  );
}

export interface ScrimStats {
  count: number;
  wins: number;
  losses: number;
  draws: number;
  /** Porcentaje de victorias sobre las partidas con resultado. */
  winRate: number | null;
  /** Media del K/D de cada partida. */
  kd: number | null;
  acs: number | null;
}

export function scrimStats(matches: readonly ScrimMatch[]): ScrimStats {
  const count = (result: ScrimMatch["result"]) =>
    matches.filter((match) => match.result === result).length;
  const wins = count("win");
  const losses = count("loss");
  const draws = count("draw");
  const decided = wins + losses + draws;

  return {
    count: matches.length,
    wins,
    losses,
    draws,
    winRate: decided === 0 ? null : (wins / decided) * 100,
    kd: mean(
      matches
        .map((match) => kdRatio(match.kills, match.deaths))
        .filter((value): value is number => value !== null),
    ),
    acs: mean(
      matches
        .map((match) => match.acs)
        .filter((value): value is number => value !== null),
    ),
  };
}

export interface MapResults {
  map: string;
  wins: number;
  losses: number;
  draws: number;
}

/** Resultados por mapa, del más jugado al menos. Sin mapa ni resultado no cuenta. */
export function resultsByMap(matches: readonly ScrimMatch[]): MapResults[] {
  const byMap = new Map<string, MapResults>();
  for (const match of matches) {
    if (match.map === "" || match.result === null) continue;
    const entry = byMap.get(match.map) ?? {
      map: match.map,
      wins: 0,
      losses: 0,
      draws: 0,
    };
    if (match.result === "win") entry.wins += 1;
    else if (match.result === "loss") entry.losses += 1;
    else entry.draws += 1;
    byMap.set(match.map, entry);
  }
  const total = (entry: MapResults) => entry.wins + entry.losses + entry.draws;
  return [...byMap.values()].sort(
    (a, b) => total(b) - total(a) || a.map.localeCompare(b.map),
  );
}

export interface FieldSummary {
  field: FieldDefinition;
  kind: AggregateKind;
  /** Total o media, según `kind`; `null` si ningún día tiene dato. */
  value: number | null;
  /** Días con dato. */
  count: number;
}

export interface HabitSummary extends Compliance {
  field: FieldDefinition;
}

export interface RangeSummary {
  /** Días registrados en el rango. */
  daysLogged: number;
  fields: FieldSummary[];
  habits: HabitSummary[];
  scrims: ScrimStats;
  tags: { tag: string; count: number }[];
}

/** Resumen de un rango de fechas: lo que muestran el Dashboard y la revisión. */
export function summarizeRange(
  fields: readonly FieldDefinition[],
  days: readonly Day[],
  scrims: readonly ScrimMatch[],
  range: DateRange,
): RangeSummary {
  const active = fields.filter((field) => !field.archived);
  const inside = days.filter((day) => inRange(day.date, range));
  const matches = scrims.filter((match) => inRange(match.date, range));

  const tagCounts = new Map<string, number>();
  for (const day of inside) {
    for (const tag of day.tags)
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
  }

  return {
    daysLogged: inside.length,
    fields: active
      .filter(
        (field) => isNumericType(field.type) || field.type === "scrim_count",
      )
      .map((field) => {
        const kind = aggregateKind(field);
        if (field.type === "scrim_count") {
          return { field, kind, value: matches.length, count: inside.length };
        }
        const values = numericValues(inside, field.key);
        return {
          field,
          kind,
          value: aggregate(kind, values),
          count: values.length,
        };
      }),
    habits: active
      .filter(isHabit)
      .map((field) => ({ field, ...compliance(inside, field.key) })),
    scrims: scrimStats(matches),
    tags: [...tagCounts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([tag, count]) => ({ tag, count })),
  };
}

/** Cómo se dibuja un campo bajo la tabla; `null` si no tiene gráfica. */
export type ChartKind = "bars" | "line-average" | "line-goal" | "compliance";

export function chartKind(
  field: Pick<FieldDefinition, "type" | "thresholds">,
): ChartKind | null {
  if (isHabit(field)) return "compliance";
  if (field.type === "scrim_count") return "bars";
  if (!isNumericType(field.type)) return null;
  if (field.thresholds?.mode === "fixed") return "line-goal";
  if (aggregateKind(field) === "total") return "bars";
  return "line-average";
}

/** El periodo de `length` días que acaba hoy y el inmediatamente anterior. */
export function periodRanges(
  today: string,
  length: number,
): { current: DateRange; previous: DateRange } {
  return {
    current: { from: addDays(today, -(length - 1)), to: today },
    previous: {
      from: addDays(today, -(2 * length - 1)),
      to: addDays(today, -length),
    },
  };
}
