import {
  EXPORT_FORMAT,
  EXPORT_VERSION,
  SECRET_SETTING_KEYS,
  type ExportData,
} from "../domain/exportFormat";
import type { FieldDefinition } from "../domain/fields";
import type { Repository } from "./repository";

/** Imágenes del editor, en `attachments/` dentro de la carpeta de datos. */
export interface AttachmentStore {
  list(): Promise<string[]>;
  read(name: string): Promise<Uint8Array>;
  write(name: string, bytes: Uint8Array): Promise<void>;
}

/** Qué hacer con los días y partidas que ya existen. */
export type ImportStrategy = "replace" | "keep";

export interface ImportConflicts {
  days: string[];
  scrimMatches: string[];
}

export interface ImportSummary {
  daysWritten: number;
  daysSkipped: number;
  scrimsWritten: number;
  scrimsSkipped: number;
  fieldsWritten: number;
  attachmentsWritten: number;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const step = 0x8000;
  for (let start = 0; start < bytes.length; start += step) {
    binary += String.fromCharCode(...bytes.subarray(start, start + step));
  }
  return btoa(binary);
}

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

/** Todos los datos en un único objeto, listo para guardarse como JSON. */
export async function buildExport(
  repository: Repository,
  attachments: AttachmentStore,
  now: Date = new Date(),
): Promise<ExportData> {
  const settings = await repository.getSettings();
  for (const key of SECRET_SETTING_KEYS) delete settings[key];

  const names = (await attachments.list()).sort();
  const files = [];
  for (const name of names) {
    files.push({
      name,
      dataBase64: bytesToBase64(await attachments.read(name)),
    });
  }

  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: now.toISOString(),
    fieldDefinitions: await repository.listFields(),
    days: await repository.listDays(),
    scrimMatches: await repository.listScrims(),
    rankedSessions: [],
    notes: [],
    settings,
    attachments: files,
  };
}

/** Días y partidas del archivo que ya existen en esta instalación. */
export async function findImportConflicts(
  repository: Repository,
  data: ExportData,
): Promise<ImportConflicts> {
  const dates = new Set((await repository.listDays()).map((day) => day.date));
  const ids = new Set((await repository.listScrims()).map((match) => match.id));
  return {
    days: data.days.map((day) => day.date).filter((date) => dates.has(date)),
    scrimMatches: data.scrimMatches
      .map((match) => match.id)
      .filter((id) => ids.has(id)),
  };
}

/**
 * Vuelca un archivo ya validado. `strategy` decide qué pasa con los días y
 * partidas que ya existen; los campos (por su clave) y los ajustes del archivo
 * siempre sustituyen a los actuales.
 */
export async function applyImport(
  repository: Repository,
  attachments: AttachmentStore,
  data: ExportData,
  strategy: ImportStrategy,
): Promise<ImportSummary> {
  const conflicts = await findImportConflicts(repository, data);
  const skipDates = new Set(strategy === "keep" ? conflicts.days : []);
  const skipIds = new Set(strategy === "keep" ? conflicts.scrimMatches : []);

  const existingFields = await repository.listFields();
  const idByKey = new Map(existingFields.map((field) => [field.key, field.id]));
  const takenIds = new Set(existingFields.map((field) => field.id));
  const fields: FieldDefinition[] = data.fieldDefinitions.map((field) => {
    const existingId = idByKey.get(field.key);
    if (existingId !== undefined) return { ...field, id: existingId };
    // Un id ya usado por otro campo local obligaría a pisarlo.
    const id = takenIds.has(field.id) ? `${field.id}-${field.key}` : field.id;
    takenIds.add(id);
    return { ...field, id };
  });
  await repository.saveFields(fields);

  const days = data.days.filter((day) => !skipDates.has(day.date));
  await repository.saveDays(days);

  const scrims = data.scrimMatches.filter((match) => !skipIds.has(match.id));
  await repository.saveScrims(scrims);

  for (const [key, value] of Object.entries(data.settings)) {
    if (!SECRET_SETTING_KEYS.includes(key)) {
      await repository.setSetting(key, value);
    }
  }

  const present = new Set(await attachments.list());
  let attachmentsWritten = 0;
  for (const file of data.attachments) {
    if (strategy === "keep" && present.has(file.name)) continue;
    await attachments.write(file.name, base64ToBytes(file.dataBase64));
    attachmentsWritten += 1;
  }

  return {
    daysWritten: days.length,
    daysSkipped: data.days.length - days.length,
    scrimsWritten: scrims.length,
    scrimsSkipped: data.scrimMatches.length - scrims.length,
    fieldsWritten: fields.length,
    attachmentsWritten,
  };
}
