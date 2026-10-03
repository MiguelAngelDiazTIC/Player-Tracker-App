import { z } from "zod";
import { addDays, isIsoDate } from "./dates";

/** Ajuste de las copias automáticas. */
export const AUTO_BACKUP_SETTING = "backup.auto";

export const autoBackupSchema = z.object({
  enabled: z.boolean(),
  /** Días que deben pasar desde la última copia para hacer otra. */
  everyDays: z.number().int().min(1),
});

export type AutoBackupConfig = z.infer<typeof autoBackupSchema>;

export const DEFAULT_AUTO_BACKUP: AutoBackupConfig = {
  enabled: true,
  everyDays: 7,
};

/** Copias que se conservan; las más antiguas se borran. */
export const BACKUPS_TO_KEEP = 8;

export function readAutoBackup(setting: unknown): AutoBackupConfig {
  const result = autoBackupSchema.safeParse(setting);
  return result.success ? result.data : DEFAULT_AUTO_BACKUP;
}

const NAME = /^copia-(\d{4}-\d{2}-\d{2})\.json$/;

export function backupFileName(date: string): string {
  return `copia-${date}.json`;
}

/** Fecha de una copia a partir de su nombre; `null` si no es una copia. */
export function backupDate(name: string): string | null {
  const match = NAME.exec(name);
  return match && isIsoDate(match[1]) ? match[1] : null;
}

/** Fecha de la copia más reciente, o `null` si aún no hay ninguna. */
export function lastBackupDate(names: readonly string[]): string | null {
  const dates = names
    .map(backupDate)
    .filter((date): date is string => date !== null)
    .sort();
  return dates.length === 0 ? null : dates[dates.length - 1];
}

/** ¿Toca hacer copia hoy? */
export function backupDue(
  names: readonly string[],
  config: AutoBackupConfig,
  today: string,
): boolean {
  if (!config.enabled) return false;
  const last = lastBackupDate(names);
  return last === null || addDays(last, config.everyDays) <= today;
}

/** Copias que sobran, de la más antigua a la menos, al conservar `keep`. */
export function backupsToDelete(
  names: readonly string[],
  keep: number = BACKUPS_TO_KEEP,
): string[] {
  const copies = names.filter((name) => backupDate(name) !== null).sort();
  return copies.slice(0, Math.max(0, copies.length - keep));
}
