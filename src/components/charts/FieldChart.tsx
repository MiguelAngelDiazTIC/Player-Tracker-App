import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { dailySeries, durationTicks } from "../../domain/chartData";
import { formatDate } from "../../domain/dates";
import type { Day } from "../../domain/day";
import type { FieldDefinition } from "../../domain/fields";
import {
  formatPercent,
  formatShortDate,
  formatStat,
  formatTick,
} from "../../domain/format";
import {
  aggregate,
  aggregateKind,
  chartKind,
  compliance,
  weeklyCompliance,
} from "../../domain/stats";
import { ChartCard, ChartLegend } from "./ChartCard";
import { AXIS_TICK, CHART, CHART_MARGIN, MAX_BAR_SIZE } from "./chartTheme";
import { ChartTooltip } from "./ChartTooltip";

interface FieldChartProps {
  field: FieldDefinition;
  /** Días que muestra la tabla, ya filtrados. */
  days: readonly Day[];
  /** Todos los días, para que la media móvil no empiece coja. */
  allDays: readonly Day[];
  scrimCounts: Readonly<Record<string, number>>;
}

const X_AXIS = {
  tick: AXIS_TICK,
  tickLine: false,
  axisLine: { stroke: CHART.grid },
  minTickGap: 24,
} as const;

const Y_AXIS = {
  tick: AXIS_TICK,
  tickLine: false,
  axisLine: false,
  width: 44,
} as const;

const DOT = { r: 3, stroke: CHART.surface, strokeWidth: 2 } as const;

/** La gráfica de una columna de la tabla, según el tipo de dato que guarda. */
export function FieldChart({
  field,
  days,
  allDays,
  scrimCounts,
}: FieldChartProps) {
  const kind = chartKind(field);
  if (kind === null) return null;

  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  const span =
    sorted.length === 0
      ? ""
      : `del ${formatDate(sorted[0].date)} al ${formatDate(sorted[sorted.length - 1].date)}`;

  if (kind === "compliance") {
    const weeks = weeklyCompliance(sorted, field.key);
    const total = compliance(sorted, field.key);
    const summary = `${total.done} de ${total.counted} días`;
    return (
      <ChartCard
        title={field.label}
        summary={total.counted === 0 ? undefined : summary}
        description={`${field.label}: cumplimiento por semana, ${summary} ${span}`}
        empty={weeks.length === 0}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={weeks} margin={CHART_MARGIN}>
            <CartesianGrid vertical={false} stroke={CHART.grid} />
            <XAxis
              dataKey="weekStart"
              tickFormatter={formatShortDate}
              {...X_AXIS}
            />
            <YAxis
              domain={[0, 100]}
              ticks={[0, 50, 100]}
              tickFormatter={(value: number) => `${value} %`}
              {...Y_AXIS}
              width={52}
            />
            <Tooltip
              isAnimationActive={false}
              cursor={{ fill: CHART.grid }}
              content={({ active, payload }) => {
                const week = payload?.[0]?.payload as
                  (typeof weeks)[number] | undefined;
                return active && week ? (
                  <ChartTooltip
                    title={`Semana del ${formatDate(week.weekStart)}`}
                    rows={[
                      {
                        label: `${week.done} de ${week.counted} días`,
                        value: formatPercent(week.percent),
                        color: CHART.series,
                      },
                    ]}
                  />
                ) : null;
              }}
            />
            <Bar
              dataKey="percent"
              fill={CHART.series}
              radius={[4, 4, 0, 0]}
              maxBarSize={MAX_BAR_SIZE}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    );
  }

  const points = dailySeries(sorted, allDays, field, scrimCounts);
  const values = points
    .map((point) => point.value)
    .filter((value): value is number => value !== null);
  const aggregateOf = aggregateKind(field);
  const stat = formatStat(field.type, aggregate(aggregateOf, values));
  const summary = `${aggregateOf === "total" ? "Total" : "Media"} ${stat}`;
  const goal =
    field.thresholds?.mode === "fixed" ? field.thresholds.good : null;
  const goalLabel =
    goal === null ? "" : `Objetivo ${formatStat(field.type, goal)}`;
  const tickFormatter = (value: number) => formatTick(field.type, value);
  const ticks =
    field.type === "duration"
      ? durationTicks(goal === null ? values : [...values, goal])
      : undefined;

  const tooltip = (
    <Tooltip
      isAnimationActive={false}
      cursor={
        kind === "bars"
          ? { fill: CHART.grid }
          : { stroke: CHART.goal, strokeWidth: 1 }
      }
      content={({ active, payload }) => {
        const point = payload?.[0]?.payload as
          (typeof points)[number] | undefined;
        if (!active || !point || point.value === null) return null;
        return (
          <ChartTooltip
            title={formatDate(point.date)}
            rows={[
              {
                label: field.label,
                value: formatStat(field.type, point.value),
                color: kind === "line-average" ? CHART.muted : CHART.series,
              },
              ...(kind === "line-average" && point.average !== null
                ? [
                    {
                      label: "Media de 7 días",
                      value: formatStat(field.type, point.average),
                      color: CHART.series,
                    },
                  ]
                : []),
            ]}
          />
        );
      }}
    />
  );

  return (
    <ChartCard
      title={field.label}
      summary={
        values.length === 0
          ? undefined
          : goal === null
            ? summary
            : `${summary} · ${goalLabel.toLowerCase()}`
      }
      description={`${field.label}: ${summary.toLowerCase()} ${span}`}
      empty={values.length === 0}
      legend={
        kind === "line-average" ? (
          <ChartLegend
            items={[
              { label: "Cada día", swatch: "bg-surface/35", shape: "line" },
              { label: "Media de 7 días", swatch: "bg-chart", shape: "line" },
            ]}
          />
        ) : goal !== null ? (
          <ChartLegend
            items={[
              { label: field.label, swatch: "bg-chart", shape: "line" },
              { label: goalLabel, swatch: "bg-surface/55", shape: "line" },
            ]}
          />
        ) : undefined
      }
    >
      <ResponsiveContainer width="100%" height="100%">
        {kind === "bars" ? (
          <BarChart data={points} margin={CHART_MARGIN} barCategoryGap="20%">
            <CartesianGrid vertical={false} stroke={CHART.grid} />
            <XAxis dataKey="date" tickFormatter={formatShortDate} {...X_AXIS} />
            <YAxis
              allowDecimals={false}
              tickFormatter={tickFormatter}
              {...Y_AXIS}
            />
            {tooltip}
            <Bar
              dataKey="value"
              fill={CHART.series}
              radius={[4, 4, 0, 0]}
              maxBarSize={MAX_BAR_SIZE}
              isAnimationActive={false}
            />
          </BarChart>
        ) : (
          <ComposedChart data={points} margin={CHART_MARGIN}>
            <CartesianGrid vertical={false} stroke={CHART.grid} />
            <XAxis dataKey="date" tickFormatter={formatShortDate} {...X_AXIS} />
            <YAxis
              domain={
                ticks
                  ? [ticks[0], ticks[ticks.length - 1]]
                  : // Una escala de 0 a 100 no enseña valores imposibles.
                    field.type === "scale"
                    ? [(low: number) => Math.floor(low / 10) * 10, 100]
                    : ["auto", "auto"]
              }
              ticks={ticks}
              tickFormatter={tickFormatter}
              {...Y_AXIS}
            />
            {tooltip}
            {goal !== null ? (
              <ReferenceLine
                y={goal}
                stroke={CHART.goal}
                strokeWidth={1}
                ifOverflow="extendDomain"
              />
            ) : null}
            {/* Sin unir los huecos: un día sin dato corta la línea. */}
            <Line
              dataKey="value"
              stroke={kind === "line-average" ? CHART.muted : CHART.series}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              dot={{
                ...DOT,
                fill: kind === "line-average" ? CHART.muted : CHART.series,
              }}
              activeDot={{ ...DOT, r: 4, fill: CHART.series }}
              isAnimationActive={false}
            />
            {kind === "line-average" ? (
              <Line
                dataKey="average"
                stroke={CHART.series}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                dot={false}
                activeDot={false}
                isAnimationActive={false}
              />
            ) : null}
          </ComposedChart>
        )}
      </ResponsiveContainer>
    </ChartCard>
  );
}
