import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { useStore } from "../../app/store";
import { choicesFor, STATUS_TINT } from "../../components/choices";
import { Button } from "../../components/ui/Button";
import { Labeled, Select } from "../../components/ui/fields";
import {
  addMonths,
  HEAT_STEPS,
  heatStep,
  monthGrid,
  monthLabel,
  monthOf,
  monthRange,
  WEEKDAY_LABELS,
} from "../../domain/calendar";
import { formatLongDate, todayIso } from "../../domain/dates";
import type { FieldDefinition } from "../../domain/fields";
import { inRange } from "../../domain/filters";
import { formatPercent, formatStat } from "../../domain/format";
import { countScrimsByDate } from "../../domain/scrims";
import {
  aggregate,
  aggregateKind,
  chartKind,
  compliance,
  isHabit,
} from "../../domain/stats";
import { fieldStatus } from "../../domain/thresholds";
import { formatFieldValue } from "../../domain/values";
import { cx } from "../../lib/cx";

/**
 * Escala de un solo tono: más valor, más intenso. En el paso más oscuro el
 * texto pasa a blanco para mantener el contraste.
 */
const HEAT_CLASSES = [
  "bg-chart/15 text-ink",
  "bg-chart/35 text-ink",
  "bg-chart/55 text-ink",
  "bg-chart/75 text-ink",
  "bg-chart text-surface",
] as const;

interface CalendarioViewProps {
  onOpenDay: (date: string) => void;
}

/** Mapa de calor del mes: un vistazo a cómo fue cada día en la métrica elegida. */
export function CalendarioView({ onOpenDay }: CalendarioViewProps) {
  const { days, fields, scrims } = useStore();
  const today = todayIso();
  const [month, setMonth] = useState(monthOf(today));

  const metrics = useMemo(
    () =>
      fields.filter((field) => !field.archived && chartKind(field) !== null),
    [fields],
  );
  const [metricKey, setMetricKey] = useState(
    () => metrics.find((field) => field.key === "kd")?.key ?? metrics[0]?.key,
  );
  const metric: FieldDefinition | undefined =
    metrics.find((field) => field.key === metricKey) ?? metrics[0];

  const counts = useMemo(() => countScrimsByDate(scrims), [scrims]);
  const dayByDate = useMemo(
    () => new Map(days.map((day) => [day.date, day])),
    [days],
  );

  /** Valor numérico del día en la métrica, o `null` si no hay dato. */
  const numberOf = (date: string): number | null => {
    const day = dayByDate.get(date);
    if (!day || !metric) return null;
    if (metric.type === "scrim_count") return counts[date] ?? 0;
    const value = day.values[metric.key];
    return typeof value === "number" ? value : null;
  };

  // La escala usa todos los días, para que los meses se puedan comparar.
  const all = days
    .map((day) => numberOf(day.date))
    .filter((value): value is number => value !== null);
  const min = all.length === 0 ? 0 : Math.min(...all);
  const max = all.length === 0 ? 0 : Math.max(...all);

  const monthDays = days.filter((day) => inRange(day.date, monthRange(month)));
  let summary = "Sin datos este mes";
  if (metric && isHabit(metric)) {
    const result = compliance(monthDays, metric.key);
    if (result.counted > 0) {
      summary = `${formatPercent(result.percent)} cumplido · ${result.done} de ${result.counted} días`;
    }
  } else if (metric) {
    const values = monthDays
      .map((day) => numberOf(day.date))
      .filter((value): value is number => value !== null);
    if (values.length > 0) {
      const kind = aggregateKind(metric);
      summary = `${kind === "total" ? "Total" : "Media"} ${formatStat(metric.type, aggregate(kind, values))} · ${values.length} ${values.length === 1 ? "día" : "días"} con dato`;
    }
  }

  if (!metric) {
    return (
      <div className="glass flex flex-1 items-center justify-center rounded-md p-4">
        <p className="text-ink/70">
          No hay ningún campo que se pueda pintar en el calendario.
        </p>
      </div>
    );
  }

  const habit = isHabit(metric);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-end gap-2 px-2">
        <Button
          iconOnly
          aria-label="Mes anterior"
          title="Mes anterior"
          onClick={() => setMonth(addMonths(month, -1))}
        >
          <ChevronLeft aria-hidden="true" className="size-4" />
        </Button>
        <h2
          aria-live="polite"
          className="w-56 text-center text-lg font-bold first-letter:uppercase"
        >
          {monthLabel(month)}
        </h2>
        <Button
          iconOnly
          aria-label="Mes siguiente"
          title="Mes siguiente"
          onClick={() => setMonth(addMonths(month, 1))}
        >
          <ChevronRight aria-hidden="true" className="size-4" />
        </Button>
        <Button
          variant="ghost"
          disabled={month === monthOf(today)}
          onClick={() => setMonth(monthOf(today))}
        >
          Hoy
        </Button>
        <div className="flex-1" />
        <Labeled label="Métrica" className="w-56">
          <Select
            value={metric.key}
            onChange={(event) => setMetricKey(event.target.value)}
          >
            {metrics.map((field) => (
              <option key={field.id} value={field.key}>
                {field.label}
              </option>
            ))}
          </Select>
        </Labeled>
      </div>

      <div className="glass-solid flex min-h-0 flex-1 flex-col gap-4 relative overflow-auto rounded-md p-4">
        <table className="w-full table-fixed border-separate border-spacing-2">
          <caption className="sr-only">
            {metric.label} en {monthLabel(month)}
          </caption>
          <thead>
            <tr>
              {WEEKDAY_LABELS.map((weekday) => (
                <th
                  key={weekday}
                  scope="col"
                  className="text-ink/70 text-xs font-semibold tracking-wide uppercase"
                >
                  <abbr title={weekday} className="no-underline">
                    {weekday.slice(0, 3)}
                  </abbr>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {monthGrid(month).map((week, index) => (
              <tr key={index}>
                {week.map((date, weekday) => {
                  if (date === null) return <td key={weekday} />;

                  const day = dayByDate.get(date);
                  const dayNumber = Number(date.slice(8));
                  const raw = day?.values[metric.key] ?? null;
                  const value = habit ? null : numberOf(date);
                  const shown = habit
                    ? formatFieldValue(metric.type, raw)
                    : formatStat(metric.type, value);
                  const hasData = habit ? raw !== null : value !== null;
                  const Icon = habit
                    ? choicesFor(metric.type).find(
                        (choice) => choice.value === raw,
                      )?.icon
                    : undefined;
                  const tone = !hasData
                    ? "bg-ink/5 text-ink/70"
                    : habit
                      ? cx(STATUS_TINT[fieldStatus(metric, raw)], "text-ink")
                      : HEAT_CLASSES[heatStep(value ?? 0, min, max)];
                  const label = `${formatLongDate(date)}: ${hasData ? `${metric.label} ${shown}` : "sin dato"}`;
                  const content = (
                    <>
                      <span className="font-mono text-xs">{dayNumber}</span>
                      <span className="flex flex-1 items-center justify-center font-mono text-sm font-semibold">
                        {!hasData ? null : Icon ? (
                          <Icon aria-hidden="true" className="size-4" />
                        ) : (
                          shown
                        )}
                      </span>
                    </>
                  );
                  const box = cx(
                    "flex h-16 w-full flex-col rounded-sm p-1 text-left",
                    tone,
                    date === today && "outline-ink/70 outline-1",
                  );

                  return (
                    <td key={weekday} className="p-0">
                      {day ? (
                        <button
                          type="button"
                          aria-label={label}
                          title={label}
                          onClick={() => onOpenDay(date)}
                          className={cx(box, "hover:brightness-125")}
                        >
                          {content}
                        </button>
                      ) : (
                        <div aria-label={label} className={box}>
                          {content}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="text-ink/70 font-mono text-xs" role="status">
            {summary}
          </p>
          {habit ? null : all.length > 0 ? (
            <div className="text-ink/70 flex items-center gap-2 font-mono text-xs">
              <span>{formatStat(metric.type, min)}</span>
              <span aria-hidden="true" className="flex gap-0.5">
                {Array.from({ length: HEAT_STEPS }, (_, step) => (
                  <span
                    key={step}
                    className={cx(
                      "size-4 rounded-sm",
                      HEAT_CLASSES[step].split(" ")[0],
                    )}
                  />
                ))}
              </span>
              <span>{formatStat(metric.type, max)}</span>
              <span className="sr-only">
                Escala de color: más intenso es más alto
              </span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
