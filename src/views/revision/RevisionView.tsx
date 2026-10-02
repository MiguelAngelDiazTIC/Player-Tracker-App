import { ChevronLeft, ChevronRight } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { useStore } from "../../app/store";
import { StatTile } from "../../components/charts/StatTile";
import { Button } from "../../components/ui/Button";
import { Card, Chip } from "../../components/ui/surfaces";
import {
  addDays,
  formatDate,
  formatLongDate,
  todayIso,
} from "../../domain/dates";
import { formatPercent, formatStat } from "../../domain/format";
import { emptyReview, REVIEW_CONCLUSIONS } from "../../domain/review";
import { summarizeRange, weekDates, weekStart } from "../../domain/stats";

/** Qué se pregunta en cada una de las tres conclusiones. */
const PROMPTS = [
  "Qué ha funcionado esta semana",
  "Qué no ha funcionado",
  "Qué cambio la semana que viene",
] as const;

interface ConclusionProps {
  label: string;
  value: string;
  onCommit: (value: string) => void;
}

function Conclusion({ label, value, onCommit }: ConclusionProps) {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-2">
      <label
        htmlFor={id}
        className="text-ink/70 text-xs font-semibold tracking-wide uppercase"
      >
        {label}
      </label>
      <textarea
        id={id}
        rows={3}
        value={draft ?? value}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          if (draft !== null && draft !== value) onCommit(draft);
          setDraft(null);
        }}
        className="border-ink/10 bg-surface/80 hover:border-ink/30 resize-y rounded-md border px-4 py-2 text-sm"
      />
    </div>
  );
}

interface RevisionViewProps {
  onOpenDay: (date: string) => void;
}

/** Nota guiada de la semana: el resumen lo pone la app; las conclusiones, tú. */
export function RevisionView({ onOpenDay }: RevisionViewProps) {
  const { days, fields, scrims, reviews, saveReview } = useStore();
  const today = todayIso();
  const [start, setStart] = useState(() => weekStart(today));
  const end = addDays(start, 6);

  const summary = useMemo(
    () => summarizeRange(fields, days, scrims, { from: start, to: end }),
    [fields, days, scrims, start, end],
  );
  const review =
    reviews.find((item) => item.weekStart === start) ?? emptyReview(start);
  const logged = new Set(days.map((day) => day.date));
  const isCurrentWeek = start === weekStart(today);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 px-2">
        <Button
          iconOnly
          aria-label="Semana anterior"
          title="Semana anterior"
          onClick={() => setStart(addDays(start, -7))}
        >
          <ChevronLeft aria-hidden="true" className="size-4" />
        </Button>
        <h2 aria-live="polite" className="text-lg font-bold">
          Semana del {formatDate(start)} al {formatDate(end)}
        </h2>
        <Button
          iconOnly
          aria-label="Semana siguiente"
          title="Semana siguiente"
          onClick={() => setStart(addDays(start, 7))}
        >
          <ChevronRight aria-hidden="true" className="size-4" />
        </Button>
        <Button
          variant="ghost"
          disabled={isCurrentWeek}
          onClick={() => setStart(weekStart(today))}
        >
          Esta semana
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 relative overflow-auto">
        <section
          aria-labelledby="review-summary"
          className="flex flex-col gap-2"
        >
          <h3 id="review-summary" className="px-2 font-semibold">
            Resumen: {summary.daysLogged}{" "}
            {summary.daysLogged === 1 ? "día registrado" : "días registrados"}
          </h3>
          <ul className="flex flex-wrap gap-2 px-2">
            {weekDates(start).map((date) => (
              <li key={date}>
                {logged.has(date) ? (
                  <Button
                    onClick={() => onOpenDay(date)}
                    title={`Abrir el ${formatLongDate(date)}`}
                  >
                    {formatDate(date).slice(0, 5)}
                  </Button>
                ) : (
                  <span
                    className="border-ink/10 text-ink/70 inline-flex h-9 items-center rounded-md border px-4 text-sm"
                    title="Sin registrar"
                  >
                    {formatDate(date).slice(0, 5)}
                  </span>
                )}
              </li>
            ))}
          </ul>

          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {summary.fields.map((item) => (
              <StatTile
                key={item.field.id}
                label={item.field.label}
                value={formatStat(item.field.type, item.value)}
                hint={
                  item.value === null
                    ? "Sin datos esta semana"
                    : item.kind === "total"
                      ? "Total de la semana"
                      : `Media de ${item.count} ${item.count === 1 ? "día" : "días"}`
                }
              />
            ))}
            {summary.habits.map((habit) => (
              <StatTile
                key={habit.field.id}
                label={habit.field.label}
                value={
                  habit.counted === 0
                    ? "—"
                    : `${habit.done} de ${habit.counted}`
                }
                hint={
                  habit.counted === 0
                    ? "Sin datos esta semana"
                    : `${formatPercent(habit.percent)} de los días con dato`
                }
              />
            ))}
          </div>

          {summary.scrims.count > 0 ? (
            <p className="text-ink/70 px-2 text-sm">
              Scrims y 10mans: {summary.scrims.count}{" "}
              {summary.scrims.count === 1 ? "partida" : "partidas"}
              {summary.scrims.winRate === null
                ? ""
                : `, ${summary.scrims.wins} victorias y ${summary.scrims.losses} derrotas`}
              {summary.scrims.kd === null
                ? ""
                : `, K/D medio ${formatStat("decimal", summary.scrims.kd)}`}
              {summary.scrims.acs === null
                ? ""
                : `, ACS medio ${formatStat("number", summary.scrims.acs)}`}
              .
            </p>
          ) : null}

          {summary.tags.length > 0 ? (
            <ul
              aria-label="Etiquetas de la semana"
              className="flex flex-wrap gap-2 px-2"
            >
              {summary.tags.map(({ tag, count }) => (
                <li key={tag}>
                  <Chip>
                    #{tag} × {count}
                  </Chip>
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        <Card title="Tus 3 conclusiones">
          <p className="text-ink/70 text-sm">
            Mira el resumen y escribe qué te llevas de la semana. Se guarda al
            salir de cada cuadro.
          </p>
          {Array.from({ length: REVIEW_CONCLUSIONS }, (_, index) => (
            <Conclusion
              // La clave incluye la semana: al cambiar, se descarta el borrador.
              key={`${start}-${index}`}
              label={`${index + 1}. ${PROMPTS[index]}`}
              value={review.conclusions[index] ?? ""}
              onCommit={(text) =>
                saveReview({
                  weekStart: start,
                  conclusions: Array.from(
                    { length: REVIEW_CONCLUSIONS },
                    (_, other) =>
                      other === index
                        ? text.trim()
                        : (review.conclusions[other] ?? ""),
                  ),
                })
              }
            />
          ))}
        </Card>
      </div>
    </div>
  );
}
