import { planScrimPlaceholders } from "../domain/scrims";
import type { ParsedSheet } from "../domain/sheetImport";
import type { ImportStrategy } from "./backup";
import type { Repository } from "./repository";

export interface SheetImportSummary {
  daysWritten: number;
  daysSkipped: number;
  scrimsCreated: number;
}

/** Fechas de la hoja que ya existen en la app. */
export async function findSheetConflicts(
  repository: Repository,
  sheet: ParsedSheet,
): Promise<string[]> {
  const dates = new Set((await repository.listDays()).map((day) => day.date));
  return sheet.days.map((day) => day.date).filter((date) => dates.has(date));
}

/**
 * Guarda los días de la hoja. Con `keep`, los días que ya existen se quedan
 * como están. El recuento de scrims se convierte en partidas vacías en el
 * registro, solo las que falten para igualar el número de la hoja.
 */
export async function applySheetImport(
  repository: Repository,
  sheet: ParsedSheet,
  strategy: ImportStrategy,
  newId: () => string,
): Promise<SheetImportSummary> {
  const skip = new Set(
    strategy === "keep" ? await findSheetConflicts(repository, sheet) : [],
  );
  const days = sheet.days.filter((day) => !skip.has(day.date));
  await repository.saveDays(days);

  const counts = Object.fromEntries(
    Object.entries(sheet.scrimCounts).filter(([date]) => !skip.has(date)),
  );
  const placeholders = planScrimPlaceholders(
    counts,
    await repository.listScrims(),
    newId,
  );
  await repository.saveScrims(placeholders);

  return {
    daysWritten: days.length,
    daysSkipped: sheet.days.length - days.length,
    scrimsCreated: placeholders.length,
  };
}
