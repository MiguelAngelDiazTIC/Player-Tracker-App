import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatDate } from "../../domain/dates";
import {
  formatPercent,
  formatShortDate,
  formatStat,
} from "../../domain/format";
import {
  kdRatio,
  SCRIM_KIND_LABELS,
  type ScrimMatch,
} from "../../domain/scrims";
import { resultsByMap, scrimStats } from "../../domain/stats";
import { ChartCard, ChartLegend } from "./ChartCard";
import { AXIS_TICK, CHART, CHART_MARGIN, MAX_BAR_SIZE } from "./chartTheme";
import { ChartTooltip } from "./ChartTooltip";

interface ScrimChartsProps {
  /** Partidas que muestra la tabla, ya filtradas. */
  matches: readonly ScrimMatch[];
}

interface MatchPoint {
  /** Posición en orden cronológico: dos partidas del mismo día no se pisan. */
  index: number;
  match: ScrimMatch;
  value: number | null;
}

const Y_AXIS = {
  tick: AXIS_TICK,
  tickLine: false,
  axisLine: false,
  width: 44,
} as const;

const DOT = {
  r: 3,
  fill: CHART.series,
  stroke: CHART.surface,
  strokeWidth: 2,
} as const;

function matchName(match: ScrimMatch): string {
  const rival = match.opponent ? ` contra ${match.opponent}` : "";
  const map = match.map ? ` en ${match.map}` : "";
  return `${SCRIM_KIND_LABELS[match.kind]}${rival}${map}`;
}

interface PerMatchChartProps {
  title: string;
  points: readonly MatchPoint[];
  format: (value: number | null) => string;
  average: number | null;
}

function PerMatchChart({ title, points, format, average }: PerMatchChartProps) {
  const withValue = points.filter((point) => point.value !== null);
  return (
    <ChartCard
      title={`${title} por partida`}
      summary={withValue.length === 0 ? undefined : `Media ${format(average)}`}
      description={`${title} de cada partida, en orden; media ${format(average)}`}
      empty={withValue.length === 0}
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={withValue} margin={CHART_MARGIN}>
          <CartesianGrid vertical={false} stroke={CHART.grid} />
          <XAxis
            dataKey="index"
            tickFormatter={(index: number) =>
              formatShortDate(points[index]?.match.date ?? "")
            }
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={{ stroke: CHART.grid }}
            minTickGap={24}
          />
          <YAxis
            // Nunca por debajo de cero, aunque solo haya una partida.
            domain={[
              (low: number) => Math.max(0, Math.floor(low * 0.9)),
              "auto",
            ]}
            {...Y_AXIS}
          />
          <Tooltip
            isAnimationActive={false}
            cursor={{ stroke: CHART.goal, strokeWidth: 1 }}
            content={({ active, payload }) => {
              const point = payload?.[0]?.payload as MatchPoint | undefined;
              return active && point ? (
                <ChartTooltip
                  title={formatDate(point.match.date)}
                  rows={[
                    {
                      label: matchName(point.match),
                      value: format(point.value),
                      color: CHART.series,
                    },
                  ]}
                />
              ) : null;
            }}
          />
          <Line
            dataKey="value"
            stroke={CHART.series}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            dot={DOT}
            activeDot={{ ...DOT, r: 4 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

/** Gráficas del registro de scrims: K/D y ACS por partida y resultados por mapa. */
export function ScrimCharts({ matches }: ScrimChartsProps) {
  const ordered = [...matches].sort((a, b) => a.date.localeCompare(b.date));
  const stats = scrimStats(ordered);
  const maps = resultsByMap(ordered);
  const decided = stats.wins + stats.losses + stats.draws;

  const points = (value: (match: ScrimMatch) => number | null) =>
    ordered.map((match, index) => ({ index, match, value: value(match) }));

  return (
    <section
      aria-label="Gráficas de scrims y 10mans"
      className="grid grid-cols-1 gap-4 lg:grid-cols-3"
    >
      <PerMatchChart
        title="K/D"
        points={points((match) => kdRatio(match.kills, match.deaths))}
        format={(value) => formatStat("decimal", value)}
        average={stats.kd}
      />
      <PerMatchChart
        title="ACS"
        points={points((match) => match.acs)}
        format={(value) => formatStat("number", value)}
        average={stats.acs}
      />
      <ChartCard
        title="Resultados por mapa"
        summary={
          decided === 0
            ? undefined
            : `${stats.wins}V ${stats.losses}D ${stats.draws}E · ${formatPercent(stats.winRate)}`
        }
        description={`Victorias, derrotas y empates por mapa: ${maps
          .map(
            (entry) =>
              `${entry.map} ${entry.wins} victorias, ${entry.losses} derrotas, ${entry.draws} empates`,
          )
          .join("; ")}`}
        empty={maps.length === 0}
        legend={
          <ChartLegend
            items={[
              { label: "Victorias", swatch: "bg-success", shape: "rect" },
              { label: "Empates", swatch: "bg-surface/40", shape: "rect" },
              { label: "Derrotas", swatch: "bg-danger", shape: "rect" },
            ]}
          />
        }
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={maps} layout="vertical" margin={CHART_MARGIN}>
            <CartesianGrid horizontal={false} stroke={CHART.grid} />
            <XAxis
              type="number"
              allowDecimals={false}
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={{ stroke: CHART.grid }}
            />
            <YAxis
              type="category"
              dataKey="map"
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={false}
              width={72}
            />
            <Tooltip
              isAnimationActive={false}
              cursor={{ fill: CHART.grid }}
              content={({ active, payload }) => {
                const entry = payload?.[0]?.payload as
                  (typeof maps)[number] | undefined;
                return active && entry ? (
                  <ChartTooltip
                    title={entry.map}
                    rows={[
                      {
                        label: "Victorias",
                        value: String(entry.wins),
                        color: CHART.good,
                      },
                      {
                        label: "Empates",
                        value: String(entry.draws),
                        color: CHART.neutral,
                      },
                      {
                        label: "Derrotas",
                        value: String(entry.losses),
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
    </section>
  );
}
