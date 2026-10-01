import { formatDuration, parseDuration } from "./duration";
import {
  TRISTATE_LABELS,
  type FieldType,
  type FieldValue,
  type TristateValue,
} from "./fields";
import {
  failed,
  isNoData,
  parsed,
  parseNumberText,
  type ParseResult,
} from "./parse";

/** Interpreta lo que el usuario teclea en una celda de texto. */
export function parseFieldInput(
  type: FieldType,
  text: string,
): ParseResult<FieldValue> {
  if (isNoData(text)) return parsed(null);

  switch (type) {
    case "number": {
      const value = parseNumberText(text);
      if (value === null || !Number.isInteger(value)) {
        return failed("No es un número entero");
      }
      return parsed(value);
    }
    case "decimal": {
      const value = parseNumberText(text);
      return value === null ? failed("No es un número") : parsed(value);
    }
    case "scale": {
      const value = parseNumberText(text);
      if (value === null || value < 0 || value > 100) {
        return failed("Debe ser un número entre 0 y 100");
      }
      return parsed(value);
    }
    case "duration":
      return parseDuration(text);
    case "text":
    case "tag":
      return parsed(text.trim());
    case "tristate":
    case "bool":
    case "scrim_count":
      return failed("Este campo no se escribe como texto");
  }
}

/** Texto de un valor para mostrarlo o editarlo; "sin dato" es cadena vacía. */
export function formatFieldValue(type: FieldType, value: FieldValue): string {
  if (value === null) return "";
  switch (type) {
    case "duration":
      return typeof value === "number" ? formatDuration(value) : "";
    case "decimal":
      return typeof value === "number" ? value.toFixed(2) : "";
    case "bool":
      return value === true ? "Sí" : "No";
    case "tristate":
      return TRISTATE_LABELS[value as TristateValue] ?? "";
    default:
      return String(value);
  }
}
