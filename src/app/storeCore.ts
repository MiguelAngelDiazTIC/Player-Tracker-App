import type { Settings } from "../data/repository";
import { emptyDay, type Day } from "../domain/day";
import type { FieldDefinition, FieldValue } from "../domain/fields";
import { emptyScrimMatch, type ScrimMatch } from "../domain/scrims";
import { extractTags } from "../domain/tags";
import { newId } from "../lib/id";
import type { Services } from "./services";

export interface AppData {
  fields: FieldDefinition[];
  /** Ordenados por fecha ascendente. */
  days: Day[];
  scrims: ScrimMatch[];
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
  /** Espera a que se hayan escrito todos los cambios pendientes. */
  flush(): Promise<void>;
}

const EMPTY: AppData = { fields: [], days: [], scrims: [], settings: {} };

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
  const { repository } = services;
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
        settings: await repository.getSettings(),
      };
      publish();
    } catch (cause) {
      publish(`No se pudieron leer los datos: ${describe(cause)}`);
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
    reload,
    dismissError() {
      publish(null);
    },
  };

  return {
    actions,
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    flush: () => queue,
  };
}
