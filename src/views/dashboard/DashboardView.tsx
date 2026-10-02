import { Flame } from "lucide-react";
import { useMemo, useState } from "react";
import { useStore } from "../../app/store";
import { StatTile, type Delta } from "../../components/charts/StatTile";
import { Labeled, Select } from "../../components/ui/fields";
import { Card } from "../../components/ui/surfaces";
import { todayIso } from "../../domain/dates";
import type { Day } from "../../domain/day";
import type { FieldDefinition } from "../../domain/fields";
import { inRange } from "../../domain/filters";
import {
  formatDelta,
  formatPercent,
  formatStat,
  NO_CHANGE,
} from "../../domain/format";
import {
  allHabitsDone,
  datesBetween,
  habitDone,
  isHabit,
  periodRanges,
  streak,
  summarizeRange,
  type FieldSummary,
} from "../../domain/stats";

const PERIODS = [7, 30] as const;
type Period = (typeof PERIODS)[number];

/** ¿Subir es bueno? Solo se sabe en los campos con umbral. */
function upIsGood(field: FieldDefinition): boolean | null {
  const { thresholds } = field;
  if (thresholds === null) return null;
  return thresholds.mode === "average" || thresholds.direction === "higher";
}

function deltaOf(
  field: FieldDefinition,
  current: number | null,
  previous: number | null,
  versus: string,
  good: boolean | null = upIsGood(field),
): Delta | null {
  if (current === null || previous === null) return null;
  const difference = current - previous;
  const text = formatDelta(field.type, difference);
  const direction =
    text === NO_CHANGE ? "flat" : difference > 0 ? "up" : "down";
  const tone =
    good === null || direction === "flat"
      ? "neutral"
      : (direction === "up") === good
        ? "good"
        : "bad";
  return { text, direction, tone, versus };
}

/** Campo ficticio para dar formato a cifras de scrims (K/D, ACS). */
const scrimField = (type: FieldDefinition["type"]): FieldDefinition => ({
  id: "",
  key: "",
  label: "",
  type,
  group: "",
  order: 0,
  thresholds: null,
  archived: false,
});

/** Tendencias y rachas: cómo va el periodo frente al anterior. */
export function DashboardView() {
  const { days, fields, scrims } = useStore();
  const today = todayIso();
  const [period, setPeriod] = useState<Period>(7);

  const { current, previous } = useMemo(
    () => periodRanges(today, period),
    [today, period],
  );
  const now = useMemo(
    () => summarizeRange(fields, days, scrims, current),
    [fields, days, scrims, current],
  );
  const before = useMemo(
    () => summarizeRange(fields, days, scrims, previous),
    [fields, days, scrims, previous],
  );
  const versus = `que los ${period} días anteriores`;

  const dayByDate = useMemo(
    () => new Map(days.map((day) => [day.date, day])),
    [days],
  );
  /** Valor diario de un campo en los dos periodos, para la tendencia. */
  const trendOf = (key: string) => {
    if (previous.from === null) return [];
    return datesBetween(previous.from, today).map((date) => {
      const value = dayByDate.get(date)?.values[key];
      return typeof value === "number" ? value : null;
    });
  };

  const previousOf = (summary: FieldSummary) =>
    before.fields.find((item) => item.field.id === summary.field.id)?.value ??
    null;

  const habits = fields.filter((field) => !field.archived && isHabit(field));
  const allDone = (day: Day) => allHabitsDone(day, habits);
  const allStreak = streak(days, allDone, today);
  const daily = now.fields.filter((item) => item.field.type !== "scrim_count");
  const hasRecentData = days.some((day) => inRange(day.date, current));

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-end gap-2 px-2">
        <Labeled label="Periodo" className="w-48">
          <Select
            value={period}
            onChange={(event) =>
              setPeriod(Number(event.target.value) as Period)
            }
          >
            {PERIODS.map((option) => (
              <option key={option} value={option}>
                Últimos {option} días
              </option>
            ))}
          </Select>
        </Labeled>
        <p className="text-surface/70 pb-2 text-sm" role="status">
          {hasRecentData
            ? `${now.daysLogged} ${now.daysLogged === 1 ? "día registrado" : "días registrados"} en el periodo`
            : "No hay días registrados en este periodo: rellena la Tabla para ver tus tendencias."}
        </p>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto">
        <section
          aria-labelledby="dashboard-daily"
          className="flex flex-col gap-2"
        >
          <h2 id="dashboard-daily" className="px-2 text-lg font-bold">
            Rankeds y día a día
          </h2>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-4">
            {daily.map((summary) => (
              <StatTile
                key={summary.field.id}
                label={summary.field.label}
                value={formatStat(summary.field.type, summary.value)}
                hint={
                  summary.value === null
                    ? "Sin datos en el periodo"
                    : summary.kind === "total"
                      ? "Total del periodo"
                      : `Media de ${summary.count} ${summary.count === 1 ? "día" : "días"}`
                }
                delta={deltaOf(
                  summary.field,
                  summary.value,
                  previousOf(summary),
                  versus,
                )}
                trend={{ values: trendOf(summary.field.key), current: period }}
              />
            ))}
          </div>
        </section>

        {habits.length > 0 ? (
          <section
            aria-labelledby="dashboard-habits"
            className="flex flex-col gap-2"
          >
            <h2 id="dashboard-habits" className="px-2 text-lg font-bold">
              Hábitos
            </h2>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <Card title="Racha con todos los hábitos">
                <p className="flex items-center gap-2">
                  <Flame aria-hidden="true" className="text-warning size-6" />
                  <span className="text-3xl font-semibold">
                    {allStreak.current}
                  </span>
                  <span className="text-surface/70 text-sm">
                    {allStreak.current === 1 ? "día seguido" : "días seguidos"}
                  </span>
                </p>
                <p className="text-surface/70 text-xs">
                  Mejor racha: {allStreak.best}{" "}
                  {allStreak.best === 1 ? "día" : "días"}
                </p>
              </Card>

              <Card title="Cumplimiento del periodo" className="lg:col-span-2">
                <ul className="flex flex-col gap-4">
                  {now.habits.map((habit) => {
                    const own = streak(
                      days,
                      (day) => habitDone(day.values[habit.field.key]) === true,
                      today,
                    );
                    return (
                      <li key={habit.field.id} className="flex flex-col gap-2">
                        <div className="flex items-baseline justify-between gap-2 text-sm">
                          <span className="font-semibold">
                            {habit.field.label}
                          </span>
                          <span className="text-surface/70 font-mono text-xs">
                            {habit.counted === 0
                              ? "Sin datos"
                              : `${formatPercent(habit.percent)} · ${habit.done} de ${habit.counted} días · racha ${own.current}`}
                          </span>
                        </div>
                        <div
                          role="meter"
                          aria-label={`Cumplimiento de ${habit.field.label}`}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={Math.round(habit.percent ?? 0)}
                          className="bg-chart/15 h-2 overflow-hidden rounded-sm"
                        >
                          <div
                            className="bg-chart h-full rounded-sm"
                            style={{ width: `${habit.percent ?? 0}%` }}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            </div>
          </section>
        ) : null}

        <section
          aria-labelledby="dashboard-scrims"
          className="flex flex-col gap-2"
        >
          <h2 id="dashboard-scrims" className="px-2 text-lg font-bold">
            Scrims y 10mans
          </h2>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatTile
              label="Partidas"
              value={String(now.scrims.count)}
              hint="Total del periodo"
              delta={deltaOf(
                scrimField("number"),
                now.scrims.count,
                before.scrims.count,
                versus,
              )}
            />
            <StatTile
              label="Victorias"
              value={formatPercent(now.scrims.winRate)}
              hint={
                now.scrims.winRate === null
                  ? "Sin resultados en el periodo"
                  : `${now.scrims.wins} victorias, ${now.scrims.losses} derrotas, ${now.scrims.draws} empates`
              }
            />
            <StatTile
              label="K/D en scrims"
              value={formatStat("decimal", now.scrims.kd)}
              hint={
                now.scrims.kd === null
                  ? "Sin datos en el periodo"
                  : "Media por partida"
              }
              delta={deltaOf(
                scrimField("decimal"),
                now.scrims.kd,
                before.scrims.kd,
                versus,
                true,
              )}
            />
            <StatTile
              label="ACS en scrims"
              value={formatStat("number", now.scrims.acs)}
              hint={
                now.scrims.acs === null
                  ? "Sin datos en el periodo"
                  : "Media por partida"
              }
              delta={deltaOf(
                scrimField("number"),
                now.scrims.acs,
                before.scrims.acs,
                versus,
                true,
              )}
            />
          </div>
        </section>
      </div>
    </div>
  );
}
