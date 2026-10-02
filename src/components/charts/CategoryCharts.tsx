import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartCard, ChartLegend } from "./ChartCard";
import { AXIS_TICK, CHART, MAX_BAR_SIZE } from "./chartTheme";
import { ChartTooltip } from "./ChartTooltip";

/** Con barras horizontales, la última marca del eje necesita sitio a la derecha. */
const CHART_MARGIN = { top: 8, right: 24, bottom: 0, left: 0 } as const;

const CATEGORY_AXIS = {
  type: "category",
  dataKey: "name",
  tick: AXIS_TICK,
  tickLine: false,
  axisLine: false,
  width: 80,
} as const;

const VALUE_AXIS = {
  type: "number",
  tick: AXIS_TICK,
  tickLine: false,
  axisLine: { stroke: CHART.grid },
} as const;

export interface ResultRow {
  name: string;
  wins: number;
  losses: number;
  draws: number;
}

interface ResultsChartProps {
  title: string;
  /** "3V 1D 0E · 75 %", junto al título. */
  summary?: string;
  rows: readonly ResultRow[];
}

/** Victorias, empates y derrotas de cada categoría, apiladas en una barra. */
export function ResultsChart({ title, summary, rows }: ResultsChartProps) {
  return (
    <ChartCard
      title={title}
      summary={rows.length === 0 ? undefined : summary}
      description={`${title}: ${rows
        .map(
          (row) =>
            `${row.name} ${row.wins} victorias, ${row.losses} derrotas, ${row.draws} empates`,
        )
        .join("; ")}`}
      empty={rows.length === 0}
      legend={
        <ChartLegend
          items={[
            { label: "Victorias", swatch: "bg-success", shape: "rect" },
            { label: "Empates", swatch: "bg-ink/40", shape: "rect" },
            { label: "Derrotas", swatch: "bg-danger", shape: "rect" },
          ]}
        />
      }
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={[...rows]} layout="vertical" margin={CHART_MARGIN}>
          <CartesianGrid horizontal={false} stroke={CHART.grid} />
          <XAxis allowDecimals={false} {...VALUE_AXIS} />
          <YAxis {...CATEGORY_AXIS} />
          <Tooltip
            isAnimationActive={false}
            cursor={{ fill: CHART.grid }}
            content={({ active, payload }) => {
              const row = payload?.[0]?.payload as ResultRow | undefined;
              return active && row ? (
                <ChartTooltip
                  title={row.name}
                  rows={[
                    {
                      label: "Victorias",
                      value: String(row.wins),
                      color: CHART.good,
                    },
                    {
                      label: "Empates",
                      value: String(row.draws),
                      color: CHART.neutral,
                    },
                    {
                      label: "Derrotas",
                      value: String(row.losses),
                      color: CHART.bad,
                    },
                  ]}
                />
              ) : null;
            }}
          />
          {(
            [
              ["wins", CHART.good],
              ["draws", CHART.neutral],
              ["losses", CHART.bad],
            ] as const
          ).map(([key, color]) => (
            <Bar
              key={key}
              dataKey={key}
              stackId="results"
              fill={color}
              stroke={CHART.surface}
              strokeWidth={2}
              maxBarSize={MAX_BAR_SIZE}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export interface ValueRow {
  name: string;
  value: number | null;
  /** Partidas en las que se basa. */
  count: number;
}

interface ValueChartProps {
  title: string;
  summary?: string;
  rows: readonly ValueRow[];
  format: (value: number | null) => string;
}

/** Una cifra por categoría (K/D por mapa, ACS por agente), en barras. */
export function ValueChart({ title, summary, rows, format }: ValueChartProps) {
  const known = rows.filter((row) => row.value !== null);
  return (
    <ChartCard
      title={title}
      summary={known.length === 0 ? undefined : summary}
      description={`${title}: ${known
        .map((row) => `${row.name} ${format(row.value)}`)
        .join("; ")}`}
      empty={known.length === 0}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={known} layout="vertical" margin={CHART_MARGIN}>
          <CartesianGrid horizontal={false} stroke={CHART.grid} />
          <XAxis {...VALUE_AXIS} />
          <YAxis {...CATEGORY_AXIS} />
          <Tooltip
            isAnimationActive={false}
            cursor={{ fill: CHART.grid }}
            content={({ active, payload }) => {
              const row = payload?.[0]?.payload as ValueRow | undefined;
              return active && row ? (
                <ChartTooltip
                  title={row.name}
                  rows={[
                    {
                      label: `${row.count} ${row.count === 1 ? "partida" : "partidas"}`,
                      value: format(row.value),
                      color: CHART.series,
                    },
                  ]}
                />
              ) : null;
            }}
          />
          <Bar
            dataKey="value"
            fill={CHART.series}
            radius={[0, 4, 4, 0]}
            maxBarSize={MAX_BAR_SIZE}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
