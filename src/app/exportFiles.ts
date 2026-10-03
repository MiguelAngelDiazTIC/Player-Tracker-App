import { fileSlug, toCsvBytes, toXlsx } from "../data/sheetWrite";
import { todayIso } from "../domain/dates";
import type { ExportSheet } from "../domain/sheetExport";
import { APP_FILE_PREFIX } from "./brand";
import type { Platform } from "./services";

export type SheetFormat = "xlsx" | "csv";

export const SHEET_FORMAT_LABELS: Record<SheetFormat, string> = {
  xlsx: "Excel (.xlsx)",
  csv: "CSV (.csv)",
};

/** Guarda un libro de Excel con todas las hojas; devuelve la ruta o `null`. */
export function saveWorkbook(
  platform: Platform,
  sheets: readonly ExportSheet[],
  name = "",
): Promise<string | null> {
  const middle = name === "" ? "" : `-${fileSlug(name)}`;
  return platform.saveFile({
    title: "Exportar a Excel",
    defaultName: `${APP_FILE_PREFIX}${middle}-${todayIso()}.xlsx`,
    bytes: toXlsx(sheets),
  });
}

/** Guarda una sola hoja en Excel o en CSV; devuelve la ruta o `null`. */
export function saveSheet(
  platform: Platform,
  sheet: ExportSheet,
  format: SheetFormat,
): Promise<string | null> {
  if (format === "xlsx") return saveWorkbook(platform, [sheet], sheet.name);
  return platform.saveFile({
    title: "Exportar a CSV",
    defaultName: `${APP_FILE_PREFIX}-${fileSlug(sheet.name)}-${todayIso()}.csv`,
    bytes: toCsvBytes(sheet),
  });
}
