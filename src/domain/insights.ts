import { z } from "zod";
import { addDays } from "./dates";
import type { Day } from "./day";
import { isNumericType, type FieldDefinition } from "./fields";
import { formatStat } from "./format";
import {
  aggregateKind,
  allHabitsDone,
  compliance,
  habitDone,
  isHabit,
  mean,
} from "./stats";

/** Con menos días que estos en un grupo, la comparación avisa de "pocos datos". */
export const MIN_DAYS_PER_GROUP = 10;

/**
 * Métricas de rendimiento: los campos que se colorean respecto a la media del
 * jugador (K/D y ACS en la plantilla).
 */
export function performanceFields(
  fields: readonly FieldDefinition[],
): FieldDefinition[] {
  return fields.filter(
    (field) =>
      !field.archived &&
      isNumericType(field.type) &&
      field.thresholds?.mode === "average",
  );
}

export interface ComparisonGroup {
  label: string;
  /** Media de la métrica en los días del grupo con dato. */
  mean: number | null;
  /** Días que cuentan: los que tienen el factor y la métrica. */
  dates: string[];
}

export interface Comparison {
  id: string;
  /** Qué se compara: "Nutrición", "Sleep score", "Todos los hábitos". */
  factor: string;
  kind: "habit" | "goal" | "volume";
  /** El grupo que cumple, llega al objetivo o tiene más volumen. */
  with: ComparisonGroup;
  without: ComparisonGroup;
  /** `with.mean - without.mean`, si los dos grupos tienen datos. */
  difference: number | null;
  lowData: boolean;
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function compare(
  id: string,
  factor: string,
  kind: Comparison["kind"],
  labels: readonly [string, string],
  days: readonly Day[],
  metricKey: string,
  /** `true` va al primer grupo, `false` al segundo y `null` no cuenta. */
  side: (day: Day) => boolean | null,
): Comparison {
  const groups: [Day[], Day[]] = [[], []];
  for (const day of days) {
    if (typeof day.values[metricKey] !== "number") continue;
    const result = side(day);
    if (result !== null) groups[result ? 0 : 1].push(day);
  }

  const [withGroup, withoutGroup] = groups.map((group, index) => ({
    label: labels[index],
    mean: mean(group.map((day) => day.values[metricKey] as number)),
    dates: group.map((day) => day.date),
  }));

  return {
    id,
    factor,
    kind,
    with: withGroup,
    without: withoutGroup,
    difference:
      withGroup.mean === null || withoutGroup.mean === null
        ? null
        : withGroup.mean - withoutGroup.mean,
    lowData:
      withGroup.dates.length < MIN_DAYS_PER_GROUP ||
      withoutGroup.dates.length < MIN_DAYS_PER_GROUP,
  };
}

/**
 * Rendimiento con y sin cada factor: cada hábito, todos los hábitos a la vez,
 * los objetivos (sueño por encima o por debajo de su umbral) y el volumen de
 * práctica (por encima o por debajo de su mediana).
 */
export function comparisons(
  fields: readonly FieldDefinition[],
  days: readonly Day[],
  metric: FieldDefinition,
): Comparison[] {
  const active = fields.filter(
    (field) => !field.archived && field.id !== metric.id,
  );
  const habits = active.filter(isHabit);
  const results: Comparison[] = [];

  for (const habit of habits) {
    results.push(
      compare(
        `habit:${habit.key}`,
        habit.label,
        "habit",
        // En un hábito de tres estados, el descanso no es "hacerlo".
        habit.type === "tristate"
          ? ["Hecho", "Descanso o no hecho"]
          : ["Sí", "No"],
        days,
        metric.key,
        (day) => {
          const value = day.values[habit.key];
          if (value === undefined || value === null) return null;
          return value === true || value === "done";
        },
      ),
    );
  }

  if (habits.length > 1) {
    results.push(
      compare(
        "habit:all",
        "Todos los hábitos",
        "habit",
        ["Todos cumplidos", "Alguno sin cumplir"],
        days,
        metric.key,
        (day) => {
          const known = habits.some(
            (habit) => habitDone(day.values[habit.key]) !== null,
          );
          return known ? allHabitsDone(day, habits) : null;
        },
      ),
    );
  }

  for (const field of active) {
    if (!isNumericType(field.type)) continue;
    const { thresholds } = field;

    if (thresholds?.mode === "fixed") {
      const goal = formatStat(field.type, thresholds.good);
      const higher = thresholds.direction === "higher";
      results.push(
        compare(
          `goal:${field.key}`,
          field.label,
          "goal",
          higher
            ? [`${goal} o más`, `Menos de ${goal}`]
            : [`${goal} o menos`, `Más de ${goal}`],
          days,
          metric.key,
          (day) => {
            const value = day.values[field.key];
            if (typeof value !== "number") return null;
            return higher ? value >= thresholds.good : value <= thresholds.good;
          },
        ),
      );
    } else if (aggregateKind(field) === "total") {
      const middle = median(
        days
          .map((day) => day.values[field.key])
          .filter((value): value is number => typeof value === "number"),
      );
      if (middle === null) continue;
      const cut = formatStat(field.type, middle);
      results.push(
        compare(
          `volume:${field.key}`,
          field.label,
          "volume",
          [`Más de ${cut}`, `${cut} o menos`],
          days,
          metric.key,
          (day) => {
            const value = day.values[field.key];
            return typeof value === "number" ? value > middle : null;
          },
        ),
      );
    }
  }

  return results;
}

export interface TagInsight {
  tag: string;
  /** Días con la etiqueta. */
  dates: string[];
  /** Media de la métrica en los días con la etiqueta y con dato. */
  withMean: number | null;
  withCount: number;
  /** Media en el resto de días. */
  withoutMean: number | null;
  difference: number | null;
  lowData: boolean;
}

/** Cuántas veces aparece cada etiqueta y cómo se rinde esos días. */
export function tagInsights(
  days: readonly Day[],
  metric: FieldDefinition,
): TagInsight[] {
  const tags = new Set(days.flatMap((day) => day.tags));
  const value = (day: Day) => day.values[metric.key];

  return [...tags]
    .map((tag) => {
      const tagged = days.filter((day) => day.tags.includes(tag));
      const withValues = tagged
        .map(value)
        .filter((item): item is number => typeof item === "number");
      const withoutValues = days
        .filter((day) => !day.tags.includes(tag))
        .map(value)
        .filter((item): item is number => typeof item === "number");
      const withMean = mean(withValues);
      const withoutMean = mean(withoutValues);
      return {
        tag,
        dates: tagged.map((day) => day.date),
        withMean,
        withCount: withValues.length,
        withoutMean,
        difference:
          withMean === null || withoutMean === null
            ? null
            : withMean - withoutMean,
        lowData:
          withValues.length < MIN_DAYS_PER_GROUP ||
          withoutValues.length < MIN_DAYS_PER_GROUP,
      };
    })
    .sort(
      (a, b) => b.dates.length - a.dates.length || a.tag.localeCompare(b.tag),
    );
}

export const saturationRulesSchema = z.object({
  /** Días seguidos con más de `moreThan` en `fieldKey` (rankeds). */
  streak: z.object({
    fieldKey: z.string(),
    days: z.number().int().min(2),
    moreThan: z.number().min(0),
  }),
  /** La etiqueta aparece `times` veces en 7 días. */
  tag: z.object({
    tag: z.string().min(1),
    times: z.number().int().min(1),
  }),
});

export type SaturationRules = z.infer<typeof saturationRulesSchema>;

export const SATURATION_SETTING = "saturation.rules";

export const DEFAULT_SATURATION_RULES: SaturationRules = {
  streak: { fieldKey: "rankeds", days: 5, moreThan: 8 },
  tag: { tag: "saturado", times: 2 },
};

/** Las reglas guardadas en ajustes, o las de por defecto si no hay o no valen. */
export function readSaturationRules(setting: unknown): SaturationRules {
  const result = saturationRulesSchema.safeParse(setting);
  return result.success ? result.data : DEFAULT_SATURATION_RULES;
}

/** Ventana, en días, en la que se cuentan las repeticiones de una etiqueta. */
const TAG_WINDOW_DAYS = 7;
/** Un aviso sigue activo si su último día es de anteayer en adelante. */
const ACTIVE_WITHIN_DAYS = 2;

export interface SaturationAlert {
  id: string;
  rule: "streak" | "tag";
  /** Días que disparan el aviso, en orden. */
  dates: string[];
  /** ¿Sigue vigente hoy? */
  active: boolean;
}

/** Avisos de saturación de toda la historia, del más reciente al más antiguo. */
export function saturationAlerts(
  days: readonly Day[],
  rules: SaturationRules,
  today: string,
): SaturationAlert[] {
  const alerts: SaturationAlert[] = [];
  const isActive = (dates: string[]) =>
    dates[dates.length - 1] >= addDays(today, -ACTIVE_WITHIN_DAYS);

  // Rachas de días naturales seguidos por encima del límite.
  const heavy = new Set(
    days
      .filter((day) => {
        const value = day.values[rules.streak.fieldKey];
        return typeof value === "number" && value > rules.streak.moreThan;
      })
      .map((day) => day.date),
  );
  for (const date of [...heavy].sort()) {
    if (heavy.has(addDays(date, -1))) continue;
    const run = [date];
    while (heavy.has(addDays(run[run.length - 1], 1))) {
      run.push(addDays(run[run.length - 1], 1));
    }
    if (run.length >= rules.streak.days) {
      alerts.push({
        id: `streak:${date}`,
        rule: "streak",
        dates: run,
        active: isActive(run),
      });
    }
  }

  // Etiqueta repetida: se agrupan los días que caen en ventanas que se pisan.
  const tagged = days
    .filter((day) => day.tags.includes(rules.tag.tag))
    .map((day) => day.date)
    .sort();
  let cluster: string[] = [];
  const flush = () => {
    if (cluster.length >= rules.tag.times) {
      alerts.push({
        id: `tag:${cluster[0]}`,
        rule: "tag",
        dates: cluster,
        active: isActive(cluster),
      });
    }
    cluster = [];
  };
  for (const date of tagged) {
    const last = cluster[cluster.length - 1];
    if (last !== undefined && date > addDays(last, TAG_WINDOW_DAYS - 1))
      flush();
    cluster.push(date);
  }
  flush();

  return alerts.sort((a, b) =>
    b.dates[b.dates.length - 1].localeCompare(a.dates[a.dates.length - 1]),
  );
}

/** Días hacia atrás (sin contar hoy) que miran los hábitos y la carga. */
const READINESS_LOOKBACK_DAYS = 3;

const READINESS_WEIGHTS = { rest: 40, habits: 30, load: 30 } as const;

export interface ReadinessPart {
  key: keyof typeof READINESS_WEIGHTS;
  label: string;
  /** De 0 a 100, o `null` si faltan datos para calcularla. */
  score: number | null;
  /** De dónde sale la nota, en una frase. */
  detail: string;
  /** Días en los que se basa. */
  dates: string[];
}

export interface Readiness {
  /** De 0 a 100, con las partes que tienen datos; `null` si no hay ninguna. */
  score: number | null;
  level: "high" | "medium" | "low" | null;
  parts: ReadinessPart[];
}

const clamp = (value: number) => Math.min(1, Math.max(0, value));

/**
 * Preparación del día: descanso de hoy (campos con objetivo, como el sueño),
 * hábitos de los últimos días y carga reciente frente a lo habitual. Cada
 * parte pesa lo que dice `READINESS_WEIGHTS`; las que no tienen datos se
 * quedan fuera y el resto se reparte su peso.
 */
export function readiness(
  fields: readonly FieldDefinition[],
  days: readonly Day[],
  rules: SaturationRules,
  today: string,
): Readiness {
  const active = fields.filter((field) => !field.archived);
  const dayByDate = new Map(days.map((day) => [day.date, day]));
  const recentDates = Array.from({ length: READINESS_LOOKBACK_DAYS }, (_, i) =>
    addDays(today, -(i + 1)),
  ).reverse();
  const recent = recentDates
    .map((date) => dayByDate.get(date))
    .filter((day): day is Day => day !== undefined);

  // Descanso: cada campo con objetivo fijo, de 0 a 1 según lo cerca que queda.
  const goals = active.filter(
    (field) => isNumericType(field.type) && field.thresholds?.mode === "fixed",
  );
  const todayDay = dayByDate.get(today);
  const reached: { label: string; ratio: number }[] = [];
  for (const field of goals) {
    const value = todayDay?.values[field.key];
    const { thresholds } = field;
    if (typeof value !== "number" || thresholds?.mode !== "fixed") continue;
    const ratio =
      thresholds.direction === "higher"
        ? value / thresholds.good
        : thresholds.good / Math.max(value, Number.EPSILON);
    reached.push({ label: field.label, ratio: clamp(ratio) });
  }
  const rest: ReadinessPart = {
    key: "rest",
    label: goals.map((field) => field.label).join(" y ") || "Descanso",
    score:
      reached.length === 0
        ? null
        : (mean(reached.map((item) => item.ratio)) ?? 0) * 100,
    detail:
      reached.length === 0
        ? "Falta el dato de hoy"
        : reached
            .map(
              (item) =>
                `${item.label}: ${Math.round(item.ratio * 100)} % del objetivo`,
            )
            .join(" · "),
    dates: reached.length === 0 ? [] : [today],
  };

  // Hábitos: cumplimiento de todos los hábitos en los días anteriores.
  const habitFields = active.filter(isHabit);
  let done = 0;
  let counted = 0;
  for (const habit of habitFields) {
    const result = compliance(recent, habit.key);
    done += result.done;
    counted += result.counted;
  }
  const habits: ReadinessPart = {
    key: "habits",
    label: "Hábitos",
    score: counted === 0 ? null : (done / counted) * 100,
    detail:
      counted === 0
        ? `Sin hábitos registrados en los ${READINESS_LOOKBACK_DAYS} días anteriores`
        : `${done} de ${counted} cumplidos en los ${READINESS_LOOKBACK_DAYS} días anteriores`,
    dates: counted === 0 ? [] : recent.map((day) => day.date),
  };

  // Carga: lo jugado estos días frente a lo habitual y al límite de saturación.
  const loadField = active.find((field) => field.key === rules.streak.fieldKey);
  const loadOf = (list: readonly Day[]) =>
    list
      .map((day) => day.values[rules.streak.fieldKey])
      .filter((value): value is number => typeof value === "number");
  const recentLoad = mean(loadOf(recent));
  const usual = mean(loadOf(days.filter((day) => day.date < recentDates[0])));
  const limit = rules.streak.moreThan;
  let loadScore: number | null = null;
  if (recentLoad !== null) {
    const base = usual === null ? 0 : Math.min(usual, limit);
    loadScore =
      limit <= base
        ? recentLoad <= limit
          ? 100
          : 0
        : (1 - clamp((recentLoad - base) / (limit - base))) * 100;
  }
  const loadLabel = loadField?.label ?? "Carga";
  const load: ReadinessPart = {
    key: "load",
    label: `Carga reciente (${loadLabel})`,
    score: loadScore,
    detail:
      recentLoad === null
        ? `Sin ${loadLabel.toLowerCase()} registradas en los ${READINESS_LOOKBACK_DAYS} días anteriores`
        : `Media de ${formatStat("decimal", recentLoad)} al día${
            usual === null
              ? ""
              : `, frente a ${formatStat("decimal", usual)} de costumbre`
          }; el límite es ${limit}`,
    dates:
      recentLoad === null
        ? []
        : recent
            .filter(
              (day) => typeof day.values[rules.streak.fieldKey] === "number",
            )
            .map((day) => day.date),
  };

  const parts = [rest, habits, load];
  const known = parts.filter(
    (part): part is ReadinessPart & { score: number } => part.score !== null,
  );
  const weight = known.reduce(
    (total, part) => total + READINESS_WEIGHTS[part.key],
    0,
  );
  const score =
    weight === 0
      ? null
      : known.reduce(
          (total, part) => total + part.score * READINESS_WEIGHTS[part.key],
          0,
        ) / weight;

  return {
    score,
    level:
      score === null
        ? null
        : score >= 75
          ? "high"
          : score >= 50
            ? "medium"
            : "low",
    parts,
  };
}
