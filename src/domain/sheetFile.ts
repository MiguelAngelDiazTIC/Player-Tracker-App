import * as XLSX from "xlsx";
import type { SheetCell, SheetMatrix } from "./sheetImport";

function isCsv(fileName: string): boolean {
  return /\.(csv|tsv|txt)$/i.test(fileName);
}

function toCell(cell: XLSX.CellObject | undefined): SheetCell {
  if (!cell || cell.v === undefined || cell.v === null) return null;
  switch (cell.t) {
    case "b":
      return cell.v as boolean;
    case "n": {
      const serial = cell.v as number;
      const format = typeof cell.z === "string" ? cell.z : "";
      return format !== "" && XLSX.SSF.is_date(format)
        ? { serial, text: cell.w ?? String(serial) }
        : serial;
    }
    case "s":
      return cell.v as string;
    case "z":
    case "e":
      return null;
    default:
      return cell.w ?? String(cell.v);
  }
}

const BOM = String.fromCharCode(0xfeff);

function decodeCsv(bytes: Uint8Array): string {
  const text = new TextDecoder("utf-8").decode(bytes);
  return text.startsWith(BOM) ? text.slice(1) : text;
}

/**
 * Lee la primera hoja de un CSV o Excel como matriz de celdas.
 *
 * En CSV todo se deja como texto: si SheetJS adivinara los tipos leería
 * `01/08/2026` como 8 de enero. En Excel se conservan números, booleanos y
 * el número de serie de las celdas de fecha.
 */
export function readSheetFile(
  bytes: Uint8Array,
  fileName: string,
): SheetMatrix {
  const workbook = isCsv(fileName)
    ? XLSX.read(decodeCsv(bytes), {
        type: "string",
        raw: true,
      })
    : XLSX.read(bytes, { type: "array", cellNF: true });

  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const ref = sheet?.["!ref"];
  if (!sheet || !ref) return [];

  const range = XLSX.utils.decode_range(ref);
  const matrix: SheetMatrix = [];
  for (let row = 0; row <= range.e.r; row += 1) {
    const cells: SheetCell[] = [];
    for (let column = 0; column <= range.e.c; column += 1) {
      const address = XLSX.utils.encode_cell({ r: row, c: column });
      cells.push(toCell(sheet[address] as XLSX.CellObject | undefined));
    }
    matrix.push(cells);
  }
  return matrix;
}
