import { runAutoBackup } from "../data/autoBackup";
import type { Settings } from "../data/repository";
import { AUTO_BACKUP_SETTING, readAutoBackup } from "../domain/autoBackup";
import { emptyDay, type Day } from "../domain/day";
import type { FieldDefinition, FieldValue } from "../domain/fields";
import { emptyNote, extractLinks, type Note } from "../domain/notes";
import { emptyRankedSession, type RankedSession } from "../domain/ranked";
import { isEmptyReview, type WeeklyReview } from "../domain/review";
import { emptyScrimMatch, type ScrimMatch } from "../domain/scrims";
import { extractTags } from "../domain/tags";
import { newId } from "../lib/id";
import type { Services } from "./services";

export interface AppData {
  fields: FieldDefinition[];
  /** Ordenados por fecha ascendente. */
  days: Day[];
  scrims: ScrimMatch[];
  reviews: WeeklyReview[];
  sessions: RankedSession[];
  notes: Note[];
  settings: Settings;
}

export interface AppActions {
  createDay(date: string): void;
  setDayValue(date: string, key: string, value: FieldValue): void;
  /** `text` es el texto sin formato, de donde salen las `#etiquetas`. */
  setDayFeelings(date: string, markdown: string, text: string): void;
  deleteDay(date: string): void;
  addScrim(date: string): ScrimMatch;
  updateScrim(match: ScrimMatch): void;
  deleteScrim(id: string): void;
  saveFields(fields: readonly FieldDefinition[]): void;
  /** Guarda la revisión de una semana; si queda vacía, la borra. */
  saveReview(review: WeeklyReview): void;
  addSession(date: string): RankedSession;
  /** Añade partidas ya formadas (las que trae la sincronización). */
  addSessions(sessions: readonly RankedSession[]): void;
  addScrims(matches: readonly ScrimMatch[]): void;
  updateSession(session: RankedSession): void;
  deleteSession(id: string): void;
  addNote(title?: string): Note;
  /** Guarda título y cuerpo; los enlaces se extraen del cuerpo. */
  updateNote(note: Pick<Note, "id" | "title" | "bodyMd">): void;
  deleteNote(id: string): void;
  setSetting(key: string, value: unknown): void;
  /** Vuelve a leer todo de la base de datos (tras una importación). */
  reload(): Promise<void>;
  dismissError(): void;
}

export interface StoreSnapshot {
  /** `null` mientras se cargan los datos por primera vez. */
  data: AppData | null;
  error: string | null;
}

export interface AppStoreCore {
  actions: AppActions;
  getSnapshot(): StoreSnapshot;
  subscribe(listener: () => void): () => void;
  /** Al abrir la app: hace la copia automática si toca. Solo una vez. */
  autoBackup(today: string): Promise<void>;
  /** Espera a que se hayan escrito todos los cambios pendientes. */
  flush(): Promise<void>;
}

const EMPTY: AppData = {
  fields: [],
  days: [],
  scrims: [],
  reviews: [],
  sessions: [],
  notes: [],
  settings: {},
};

function upsertBy<T>(
  items: readonly T[],
  item: T,
  same: (other: T) => boolean,
): T[] {
  return items.some(same)
    ? items.map((other) => (same(other) ? item : other))
    : [...items, item];
}

function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

/**
 * Estado de la app en memoria. Cada acción cambia el estado al momento y
 * manda la escritura a una fila, para que lleguen en orden a la base de datos.
 */
export function createAppStore(services: Services): AppStoreCore {
  const { repository, platform } = services;
  let backupChecked = false;
  let data: AppData | null = null;
  let snapshot: StoreSnapshot = { data: null, error: null };
  let queue: Promise<void> = Promise.resolve();
  const listeners = new Set<() => void>();

  function publish(error: string | null = snapshot.error) {
    snapshot = { data, error };
    for (const listener of listeners) listener();
  }

  const current = () => data ?? EMPTY;

  function apply(change: Partial<AppData>, persist: () => Promise<void>) {
    data = { ...current(), ...change };
    publish();
    queue = queue.then(persist).catch((cause: unknown) => {
      publish(`No se pudo guardar el cambio: ${describe(cause)}`);
    });
  }

  function saveDay(day: Day) {
    apply(
      {
        days: upsertBy(
          current().days,
          day,
          (other) => other.date === day.date,
        ).sort((a, b) => a.date.localeCompare(b.date)),
      },
      () => repository.saveDays([day]),
    );
  }

  const findDay = (date: string) =>
    current().days.find((day) => day.date === date);

  async function reload() {
    await queue;
    try {
      data = {
        fields: await repository.listFields(),
        days: await repository.listDays(),
        scrims: await repository.listScrims(),
        reviews: await repository.listReviews(),
        sessions: await repository.listRankedSessions(),
        notes: await repository.listNotes(),
        settings: await repository.getSettings(),
      };
      publish();
    } catch (cause) {
      publish(`No se pudieron leer los datos: ${describe(cause)}`);
    }
  }

  async function autoBackup(today: string) {
    if (backupChecked) return;
    backupChecked = true;
    await queue;
    try {
      await runAutoBackup(
        repository,
        platform.attachments,
        platform.backupFolder,
        readAutoBackup(current().settings[AUTO_BACKUP_SETTING]),
        today,
      );
    } catch (cause) {
      publish(`No se pudo hacer la copia automática: ${describe(cause)}`);
    }
  }

  const actions: AppActions = {
    createDay(date) {
      if (!findDay(date)) saveDay(emptyDay(date));
    },
    setDayValue(date, key, value) {
      const day = findDay(date) ?? emptyDay(date);
      // "Sin dato" se guarda quitando la clave, no con un null.
      const values =
        value === null
          ? Object.fromEntries(
              Object.entries(day.values).filter(([other]) => other !== key),
            )
          : { ...day.values, [key]: value };
      saveDay({ ...day, values });
    },
    setDayFeelings(date, markdown, text) {
      // El editor guarda con retraso: si el día se borró entretanto, ese
      // guardado tardío no debe resucitarlo.
      const day = findDay(date);
      if (!day) return;
      saveDay({ ...day, feelingsMd: markdown, tags: extractTags(text) });
    },
    deleteDay(date) {
      apply({ days: current().days.filter((day) => day.date !== date) }, () =>
        repository.deleteDay(date),
      );
    },
    addScrim(date) {
      const match = emptyScrimMatch(newId(), date);
      apply({ scrims: [...current().scrims, match] }, () =>
        repository.saveScrims([match]),
      );
      return match;
    },
    updateScrim(match) {
      apply(
        {
          scrims: upsertBy(
            current().scrims,
            match,
            (other) => other.id === match.id,
          ),
        },
        () => repository.saveScrims([match]),
      );
    },
    deleteScrim(id) {
      apply(
        { scrims: current().scrims.filter((match) => match.id !== id) },
        () => repository.deleteScrim(id),
      );
    },
    saveFields(fields) {
      let next = current().fields;
      for (const field of fields) {
        next = upsertBy(next, field, (other) => other.id === field.id);
      }
      apply({ fields: [...next].sort((a, b) => a.order - b.order) }, () =>
        repository.saveFields(fields),
      );
    },
    saveReview(review) {
      const others = current().reviews.filter(
        (other) => other.weekStart !== review.weekStart,
      );
      if (isEmptyReview(review)) {
        apply({ reviews: others }, () =>
          repository.deleteReview(review.weekStart),
        );
      } else {
        apply({ reviews: [...others, review] }, () =>
          repository.saveReviews([review]),
        );
      }
    },
    addSession(date) {
      const session = emptyRankedSession(newId(), date);
      apply({ sessions: [...current().sessions, session] }, () =>
        repository.saveRankedSessions([session]),
      );
      return session;
    },
    addSessions(sessions) {
      if (sessions.length === 0) return;
      apply({ sessions: [...current().sessions, ...sessions] }, () =>
        repository.saveRankedSessions(sessions),
      );
    },
    addScrims(matches) {
      if (matches.length === 0) return;
      apply({ scrims: [...current().scrims, ...matches] }, () =>
        repository.saveScrims(matches),
      );
    },
    updateSession(session) {
      apply(
        {
          sessions: upsertBy(
            current().sessions,
            session,
            (other) => other.id === session.id,
          ),
        },
        () => repository.saveRankedSessions([session]),
      );
    },
    deleteSession(id) {
      apply(
        {
          sessions: current().sessions.filter((session) => session.id !== id),
        },
        () => repository.deleteRankedSession(id),
      );
    },
    addNote(title = "") {
      const note = emptyNote(newId(), title);
      apply({ notes: [...current().notes, note] }, () =>
        repository.saveNotes([note]),
      );
      return note;
    },
    updateNote({ id, title, bodyMd }) {
      // El editor guarda con retraso: una nota borrada no debe volver.
      if (!current().notes.some((other) => other.id === id)) return;
      const note: Note = { id, title, bodyMd, links: extractLinks(bodyMd) };
      apply(
        { notes: upsertBy(current().notes, note, (other) => other.id === id) },
        () => repository.saveNotes([note]),
      );
    },
    deleteNote(id) {
      apply({ notes: current().notes.filter((note) => note.id !== id) }, () =>
        repository.deleteNote(id),
      );
    },
    setSetting(key, value) {
      apply({ settings: { ...current().settings, [key]: value } }, () =>
        repository.setSetting(key, value),
      );
    },
    reload,
    dismissError() {
      publish(null);
    },
  };

  return {
    actions,
    autoBackup,
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    flush: () => queue,
  };
}
