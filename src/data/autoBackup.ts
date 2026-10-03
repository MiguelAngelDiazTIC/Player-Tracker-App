import {
  backupDue,
  backupFileName,
  backupsToDelete,
  type AutoBackupConfig,
} from "../domain/autoBackup";
import { buildExport, type AttachmentStore } from "./backup";
import type { Repository } from "./repository";

/** La carpeta `copias/` dentro de la carpeta de datos. */
export interface BackupFolder {
  list(): Promise<string[]>;
  write(name: string, text: string): Promise<void>;
  remove(name: string): Promise<void>;
}

/**
 * Guarda una copia JSON completa con la fecha de hoy y borra las que sobran.
 * La copia es una exportación normal: los ajustes secretos no salen en ella.
 */
export async function writeBackup(
  repository: Repository,
  attachments: AttachmentStore,
  folder: BackupFolder,
  today: string,
): Promise<string> {
  const name = backupFileName(today);
  const data = await buildExport(repository, attachments);
  await folder.write(name, JSON.stringify(data, null, 2));
  for (const old of backupsToDelete(await folder.list())) {
    await folder.remove(old);
  }
  return name;
}

/** Al abrir la app: hace la copia si toca. Devuelve su nombre, o `null`. */
export async function runAutoBackup(
  repository: Repository,
  attachments: AttachmentStore,
  folder: BackupFolder,
  config: AutoBackupConfig,
  today: string,
): Promise<string | null> {
  if (!backupDue(await folder.list(), config, today)) return null;
  return writeBackup(repository, attachments, folder, today);
}
