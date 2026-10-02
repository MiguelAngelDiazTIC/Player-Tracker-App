import { z } from "zod";
import { isIsoDate, parseSheetDate } from "./dates";
import type { Day } from "./day";
import { normalizeText } from "./parse";

export const noteSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  bodyMd: z.string(),
  /** Destinos de los `[[enlaces]]` del cuerpo, tal como se escribieron. */
  links: z.array(z.string()),
});

export type Note = z.infer<typeof noteSchema>;

export function emptyNote(id: string, title = ""): Note {
  return { id, title, bodyMd: "", links: [] };
}

/**
 * Destinos de los `[[enlaces]]` de un texto, sin repetir. Acepta también los
 * corchetes escapados (`\[\[...\]\]`), que es como los guarda el Markdown.
 */
export function extractLinks(text: string): string[] {
  const plain = text.replaceAll("\\[", "[").replaceAll("\\]", "]");
  const targets = new Set<string>();
  for (const match of plain.matchAll(/\[\[([^[\]\n]+)\]\]/g)) {
    const target = match[1].trim();
    if (target !== "") targets.add(target);
  }
  return [...targets];
}

/** Si el destino es una fecha (`14/09/2026` o `2026-09-14`), su forma ISO. */
export function linkDate(target: string): string | null {
  const trimmed = target.trim();
  return isIsoDate(trimmed) ? trimmed : parseSheetDate(trimmed);
}

export type ResolvedLink =
  | { kind: "day"; target: string; date: string }
  | { kind: "note"; target: string; note: Note }
  | { kind: "missing"; target: string };

/** A dónde lleva un enlace: a un día, a una nota (por su título) o a nada. */
export function resolveLink(
  target: string,
  notes: readonly Note[],
): ResolvedLink {
  const date = linkDate(target);
  if (date !== null) return { kind: "day", target, date };

  const wanted = normalizeText(target);
  const note = notes.find(
    (candidate) =>
      candidate.title.trim() !== "" &&
      normalizeText(candidate.title) === wanted,
  );
  return note ? { kind: "note", target, note } : { kind: "missing", target };
}

function linksTo(links: readonly string[], note: Note): boolean {
  const title = normalizeText(note.title);
  return (
    title !== "" &&
    links.some(
      (link) => linkDate(link) === null && normalizeText(link) === title,
    )
  );
}

export interface Backlinks {
  notes: Note[];
  /** Días cuyos feelings enlazan la nota. */
  days: Day[];
}

/** Quién menciona una nota: otras notas y los feelings de los días. */
export function backlinksTo(
  note: Note,
  notes: readonly Note[],
  days: readonly Day[],
): Backlinks {
  return {
    notes: notes.filter(
      (other) => other.id !== note.id && linksTo(other.links, note),
    ),
    days: days.filter((day) => linksTo(extractLinks(day.feelingsMd), note)),
  };
}

/** Notas que mencionan un día con `[[fecha]]`. */
export function notesMentioningDay(
  date: string,
  notes: readonly Note[],
): Note[] {
  return notes.filter((note) =>
    note.links.some((link) => linkDate(link) === date),
  );
}

/** Nombre con el que se muestra una nota; las recién creadas no tienen título. */
export function noteName(note: Pick<Note, "title">): string {
  return note.title.trim() || "Nota sin título";
}
