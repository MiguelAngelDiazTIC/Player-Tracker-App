import { ArrowLeft, ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { useState } from "react";
import { useStore } from "../../app/store";
import { ValueInput } from "../../components/cells";
import { ChoiceGroup } from "../../components/ChoiceGroup";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Labeled } from "../../components/ui/fields";
import { Card, Chip } from "../../components/ui/surfaces";
import { formatDate, formatLongDate } from "../../domain/dates";
import { emptyDay } from "../../domain/day";
import { groupFields, type FieldDefinition } from "../../domain/fields";
import { formatStat } from "../../domain/format";
import { backlinksTo, noteName, notesMentioningDay } from "../../domain/notes";
import { rankedTotals } from "../../domain/ranked";
import { countScrimsByDate } from "../../domain/scrims";
import { FeelingsEditor } from "./FeelingsEditor";

interface DayPageProps {
  date: string;
  onBack: () => void;
  onOpenDay: (date: string) => void;
  onOpenScrims: () => void;
  onOpenRankeds: (date: string) => void;
  onOpenNote: (id: string) => void;
}

/** La fila de un día abierta como página: sus campos y el editor de feelings. */
export function DayPage({
  date,
  onBack,
  onOpenDay,
  onOpenScrims,
  onOpenRankeds,
  onOpenNote,
}: DayPageProps) {
  const store = useStore();
  const { days, fields, scrims, setDayValue, setDayFeelings, deleteDay } =
    store;
  const daySessions = store.sessions.filter((session) => session.date === date);
  const sessionTotals = rankedTotals(daySessions);
  // Notas que mencionan el día y notas que el día menciona en sus feelings.
  const linkedNotes = [
    ...new Set([
      ...notesMentioningDay(date, store.notes),
      ...store.notes.filter((note) =>
        backlinksTo(note, [], days).days.some((item) => item.date === date),
      ),
    ]),
  ];
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const day = days.find((item) => item.date === date) ?? emptyDay(date);
  const index = days.findIndex((item) => item.date === date);
  const previous = index > 0 ? days[index - 1].date : null;
  const next =
    index !== -1 && index < days.length - 1 ? days[index + 1].date : null;
  const scrimCount = countScrimsByDate(scrims)[date] ?? 0;
  const groups = groupFields(fields.filter((field) => !field.archived));
  const title = formatLongDate(date);

  /** Pasa a los campos del día lo que suman sus partidas de ranked. */
  function applySessionTotals() {
    const has = (key: string) =>
      fields.some((field) => field.key === key && !field.archived);
    if (has("rankeds")) setDayValue(date, "rankeds", sessionTotals.count);
    if (has("kd") && sessionTotals.kd !== null) {
      setDayValue(date, "kd", Math.round(sessionTotals.kd * 100) / 100);
    }
    if (has("acs") && sessionTotals.acs !== null) {
      setDayValue(date, "acs", Math.round(sessionTotals.acs));
    }
  }

  function renderField(field: FieldDefinition) {
    const value = day.values[field.key] ?? null;
    const commit = (nextValue: typeof value) =>
      setDayValue(date, field.key, nextValue);

    if (field.type === "scrim_count") {
      return (
        <div key={field.id} className="flex flex-col gap-2">
          <span className="text-surface/70 font-mono text-xs tracking-wide uppercase">
            {field.label}
          </span>
          <div className="flex items-center gap-2">
            <span className="font-mono text-lg font-bold tabular-nums">
              {scrimCount}
            </span>
            <Button variant="ghost" onClick={onOpenScrims}>
              Ver registro
            </Button>
          </div>
        </div>
      );
    }
    if (field.type === "bool" || field.type === "tristate") {
      return (
        <div key={field.id} className="col-span-full">
          <ChoiceGroup
            type={field.type}
            value={value}
            onCommit={commit}
            label={field.label}
          />
        </div>
      );
    }
    return (
      <Labeled key={field.id} label={field.label}>
        <ValueInput
          type={field.type}
          value={value}
          onCommit={commit}
          label={field.label}
          variant="form"
        />
      </Labeled>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <header className="flex flex-wrap items-center gap-2 px-2">
        <Button variant="ghost" aria-label="Volver a la Tabla" onClick={onBack}>
          <ArrowLeft aria-hidden="true" className="size-4" />
          Tabla
        </Button>
        <h1 className="min-w-0 flex-1 truncate text-3xl font-bold first-letter:uppercase">
          {title}
        </h1>
        <Button
          iconOnly
          aria-label="Día anterior"
          title="Día anterior"
          disabled={previous === null}
          onClick={() => previous && onOpenDay(previous)}
        >
          <ChevronLeft aria-hidden="true" className="size-4" />
        </Button>
        <Button
          iconOnly
          aria-label="Día siguiente"
          title="Día siguiente"
          disabled={next === null}
          onClick={() => next && onOpenDay(next)}
        >
          <ChevronRight aria-hidden="true" className="size-4" />
        </Button>
        <Button variant="danger" onClick={() => setConfirmingDelete(true)}>
          <Trash2 aria-hidden="true" className="size-4" />
          Eliminar día
        </Button>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 relative overflow-auto lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="flex flex-col gap-4">
          {groups.map(({ group, fields: groupFieldList }) => (
            <Card key={group} title={group}>
              <div className="grid grid-cols-2 gap-4">
                {groupFieldList.map(renderField)}
              </div>
            </Card>
          ))}

          <Card title="Partidas de ranked">
            {daySessions.length === 0 ? (
              <p className="text-surface/70 text-sm">
                Sin partidas apuntadas este día. Es opcional: sirven para ver
                tus cifras por mapa y agente.
              </p>
            ) : (
              <dl className="grid grid-cols-3 gap-4">
                {(
                  [
                    ["Partidas", String(sessionTotals.count)],
                    ["K/D", formatStat("decimal", sessionTotals.kd)],
                    [
                      "ACS",
                      sessionTotals.acs === null
                        ? "—"
                        : String(Math.round(sessionTotals.acs)),
                    ],
                  ] as const
                ).map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-surface/70 font-mono text-xs tracking-wide uppercase">
                      {label}
                    </dt>
                    <dd className="font-mono text-lg font-bold">{value}</dd>
                  </div>
                ))}
              </dl>
            )}
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => onOpenRankeds(date)}>
                {daySessions.length === 0 ? "Apuntar partidas" : "Ver partidas"}
              </Button>
              {daySessions.length > 0 ? (
                <Button
                  variant="ghost"
                  title="Copia el recuento, el K/D y el ACS de las partidas a los campos del día"
                  onClick={applySessionTotals}
                >
                  Usar estas cifras en el día
                </Button>
              ) : null}
            </div>
          </Card>

          <Card title="Notas enlazadas">
            {linkedNotes.length === 0 ? (
              <p className="text-surface/70 text-sm">
                Ninguna nota menciona este día. En una nota, escribe [[
                {formatDate(date)}]] para enlazarlo.
              </p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {linkedNotes.map((note) => (
                  <li key={note.id}>
                    <Button onClick={() => onOpenNote(note.id)}>
                      {noteName(note)}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <Card title="Feelings del día" className="min-h-96">
          <FeelingsEditor
            key={date}
            markdown={day.feelingsMd}
            onChange={(markdown, text) => setDayFeelings(date, markdown, text)}
            platform={store.services.platform}
          />
          {day.tags.length > 0 ? (
            <ul aria-label="Etiquetas del día" className="flex flex-wrap gap-2">
              {day.tags.map((tag) => (
                <li key={tag}>
                  <Chip>#{tag}</Chip>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-surface/70 text-xs">
              Escribe #tilt, #saturado o cualquier #etiqueta para poder contarla
              después.
            </p>
          )}
        </Card>
      </div>

      {confirmingDelete ? (
        <Dialog
          title={`¿Eliminar el ${formatDate(date)}?`}
          onClose={() => setConfirmingDelete(false)}
          actions={
            <>
              <Button onClick={() => setConfirmingDelete(false)}>
                Cancelar
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  deleteDay(date);
                  onBack();
                }}
              >
                Eliminar día
              </Button>
            </>
          }
        >
          <p>
            Se borran sus valores y sus feelings. Las partidas de scrims y
            10mans de ese día se conservan en su registro.
          </p>
        </Dialog>
      ) : null}
    </div>
  );
}
