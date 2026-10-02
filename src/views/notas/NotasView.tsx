import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useStore } from "../../app/store";
import { EditableText } from "../../components/cells";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Labeled, TextInput } from "../../components/ui/fields";
import { Card } from "../../components/ui/surfaces";
import { formatDate } from "../../domain/dates";
import {
  backlinksTo,
  noteName,
  resolveLink,
  type Note,
} from "../../domain/notes";
import { normalizeText, parsed } from "../../domain/parse";
import { cx } from "../../lib/cx";
import { FeelingsEditor } from "../tabla/FeelingsEditor";

interface NotasViewProps {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onOpenDay: (date: string) => void;
}

const LINK_BUTTON =
  "h-auto min-h-9 justify-start py-1 text-left whitespace-normal";

/** Notas sueltas enlazadas entre sí y con los días mediante `[[ ]]`. */
export function NotasView({ selectedId, onSelect, onOpenDay }: NotasViewProps) {
  const { notes, days, services, addNote, updateNote, deleteNote, createDay } =
    useStore();
  const [search, setSearch] = useState("");
  const [deleting, setDeleting] = useState<Note | null>(null);

  const wanted = normalizeText(search);
  const listed = notes
    .filter(
      (note) =>
        wanted === "" ||
        normalizeText(note.title).includes(wanted) ||
        normalizeText(note.bodyMd).includes(wanted),
    )
    .sort((a, b) => noteName(a).localeCompare(noteName(b)));
  const note = notes.find((item) => item.id === selectedId) ?? null;
  const links = note ? note.links.map((link) => resolveLink(link, notes)) : [];
  const backlinks = note ? backlinksTo(note, notes, days) : null;

  function openDay(date: string) {
    createDay(date);
    onOpenDay(date);
  }

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
      <Card
        title="Tus notas"
        className="min-h-0"
        actions={
          <Button onClick={() => onSelect(addNote().id)}>
            <Plus aria-hidden="true" className="size-4" />
            Nueva nota
          </Button>
        }
      >
        <Labeled label="Buscar">
          <TextInput
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </Labeled>
        {notes.length === 0 ? (
          <p className="text-ink/70 text-sm">
            Aún no hay notas. Crea una para un VOD, unos lineups, un rival o tus
            objetivos de la semana.
          </p>
        ) : listed.length === 0 ? (
          <p className="text-ink/70 text-sm">Ninguna nota coincide.</p>
        ) : (
          <ul className="relative -mx-2 flex min-h-0 flex-col gap-1 overflow-auto px-2 py-1">
            {listed.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  aria-current={item.id === selectedId ? "true" : undefined}
                  onClick={() => onSelect(item.id)}
                  className={cx(
                    "w-full truncate rounded-md px-2 py-2 text-left text-sm font-medium",
                    item.id === selectedId
                      ? "bg-primary text-surface"
                      : "text-ink/80 hover:bg-ink/10 hover:text-ink active:bg-ink/15",
                  )}
                >
                  {noteName(item)}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {note === null || backlinks === null ? (
        <div className="glass flex items-center justify-center rounded-md p-4">
          <p className="text-ink/70 max-w-md text-center">
            Elige una nota o crea una nueva. Escribe [[Título de otra nota]] o
            [[14/09/2026]] para enlazarla con otra nota o con un día.
          </p>
        </div>
      ) : (
        <div className="relative grid min-h-0 grid-cols-1 gap-4 overflow-auto xl:grid-cols-[minmax(0,1fr)_18rem]">
          <Card className="min-h-96">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <EditableText<string>
                  // La clave incluye la nota: al cambiar, se descarta el borrador.
                  key={note.id}
                  value={note.title === "" ? null : note.title}
                  format={(title) => title}
                  parse={(text) => parsed(text.trim())}
                  onCommit={(title) =>
                    updateNote({ ...note, title: title ?? "" })
                  }
                  label="Título de la nota"
                  variant="form"
                  placeholder="Título"
                  className="text-lg font-bold"
                />
              </div>
              <Button variant="danger" onClick={() => setDeleting(note)}>
                <Trash2 aria-hidden="true" className="size-4" />
                Eliminar nota
              </Button>
            </div>
            <FeelingsEditor
              key={note.id}
              label="Texto de la nota"
              markdown={note.bodyMd}
              onChange={(markdown) => updateNote({ ...note, bodyMd: markdown })}
              platform={services.platform}
            />
          </Card>

          <div className="flex flex-col gap-4">
            <Card title="Enlaza a">
              {links.length === 0 ? (
                <p className="text-ink/70 text-sm">
                  Esta nota no enlaza a nada todavía.
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {links.map((link) => (
                    <li key={link.target}>
                      {link.kind === "day" ? (
                        <Button
                          className={LINK_BUTTON}
                          onClick={() => openDay(link.date)}
                        >
                          Día {formatDate(link.date)}
                        </Button>
                      ) : link.kind === "note" ? (
                        <Button
                          className={LINK_BUTTON}
                          onClick={() => onSelect(link.note.id)}
                        >
                          {noteName(link.note)}
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          className={LINK_BUTTON}
                          onClick={() => onSelect(addNote(link.target).id)}
                        >
                          Crear la nota «{link.target}»
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card title="La mencionan">
              {backlinks.notes.length + backlinks.days.length === 0 ? (
                <p className="text-ink/70 text-sm">
                  Nadie la menciona todavía. Escribe [[{noteName(note)}]] en
                  otra nota o en los feelings de un día.
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {backlinks.notes.map((other) => (
                    <li key={other.id}>
                      <Button
                        className={LINK_BUTTON}
                        onClick={() => onSelect(other.id)}
                      >
                        {noteName(other)}
                      </Button>
                    </li>
                  ))}
                  {backlinks.days.map((day) => (
                    <li key={day.date}>
                      <Button
                        className={LINK_BUTTON}
                        onClick={() => onOpenDay(day.date)}
                      >
                        Día {formatDate(day.date)}
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      )}

      {deleting ? (
        <Dialog
          title={`¿Eliminar «${noteName(deleting)}»?`}
          onClose={() => setDeleting(null)}
          actions={
            <>
              <Button onClick={() => setDeleting(null)}>Cancelar</Button>
              <Button
                variant="danger"
                onClick={() => {
                  deleteNote(deleting.id);
                  setDeleting(null);
                  onSelect(null);
                }}
              >
                Eliminar nota
              </Button>
            </>
          }
        >
          <p>
            Se borra su texto. Los enlaces que apunten a ella quedarán sin
            destino.
          </p>
        </Dialog>
      ) : null}
    </div>
  );
}
