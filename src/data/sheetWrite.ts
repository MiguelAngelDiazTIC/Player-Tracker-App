import * as XLSX from "xlsx";
import { toCsv, type ExportSheet } from "../domain/sheetExport";

/** Ancho máximo de una columna, en caracteres, para que los feelings no la disparen. */
const MAX_COLUMN_WIDTH = 60;

/** Un libro de Excel con una pestaña por hoja. */
export function toXlsx(sheets: readonly ExportSheet[]): Uint8Array {
  const workbook = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const worksheet = XLSX.utils.aoa_to_sheet(sheet.rows);
    const columns = Math.max(0, ...sheet.rows.map((row) => row.length));
    worksheet["!cols"] = Array.from({ length: columns }, (_, column) => ({
      wch: Math.min(
        MAX_COLUMN_WIDTH,
        Math.max(
          8,
          ...sheet.rows.map((row) => String(row[column] ?? "").length + 2),
        ),
      ),
    }));
    // Excel no admite más de 31 caracteres ni ciertos símbolos en una pestaña.
    const name = sheet.name.replace(/[\\/?*[\]:]/g, " ").slice(0, 31);
    XLSX.utils.book_append_sheet(workbook, worksheet, name);
  }
  return new Uint8Array(
    XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer,
  );
}

/** CSV en UTF-8 con BOM, para que Excel lea bien acentos y eñes. */
export function toCsvBytes(sheet: ExportSheet): Uint8Array {
  const bom = new Uint8Array([0xef, 0xbb, 0xbf]);
  const body = new TextEncoder().encode(toCsv(sheet.rows));
  const bytes = new Uint8Array(bom.length + body.length);
  bytes.set(bom);
  bytes.set(body, bom.length);
  return bytes;
}

/** `Scrims y 10mans` → `scrims-y-10mans`, para nombres de archivo. */
export function fileSlug(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
