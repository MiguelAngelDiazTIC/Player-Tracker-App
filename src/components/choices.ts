import { Check, Minus, Moon, X, type LucideIcon } from "lucide-react";
import type { FieldType, FieldValue, TristateValue } from "../domain/fields";
import type { CellStatus } from "../domain/thresholds";

export const STATUS_TINT: Record<CellStatus, string> = {
  good: "bg-success/20",
  warn: "bg-warning/25",
  bad: "bg-danger/25",
  neutral: "",
};

export interface Choice {
  value: FieldValue;
  label: string;
  icon: LucideIcon;
  /** Color del icono. El estado se lee en su forma; el tinte de la celda da el color. */
  color: string;
}

const NO_DATA: Choice = {
  value: null,
  label: "sin dato",
  icon: Minus,
  color: "text-ink/70",
};

const BOOL_CHOICES: readonly Choice[] = [
  NO_DATA,
  { value: true, label: "sí", icon: Check, color: "text-ink" },
  { value: false, label: "no", icon: X, color: "text-ink" },
];

const TRISTATE_CHOICES: readonly Choice[] = [
  NO_DATA,
  {
    value: "done" satisfies TristateValue,
    label: "hecho",
    icon: Check,
    color: "text-ink",
  },
  {
    value: "rest" satisfies TristateValue,
    label: "descanso",
    icon: Moon,
    color: "text-ink",
  },
  {
    value: "missed" satisfies TristateValue,
    label: "no hecho",
    icon: X,
    color: "text-ink",
  },
];

export function choicesFor(type: FieldType): readonly Choice[] {
  return type === "tristate" ? TRISTATE_CHOICES : BOOL_CHOICES;
}
