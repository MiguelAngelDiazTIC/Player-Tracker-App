import { useId, useRef, useState, type KeyboardEvent } from "react";
import type { FieldType, FieldValue } from "../domain/fields";
import type { ParseResult } from "../domain/parse";
import { formatFieldValue, parseFieldInput } from "../domain/values";
import { cx } from "../lib/cx";
import { choicesFor } from "./choices";

/** Posición de una celda en su tabla, para moverse con el teclado. */
export interface CellNav {
  column: string;
  row: number;
}

function navProps(nav: CellNav | undefined) {
  return nav ? { "data-nav-column": nav.column, "data-nav-row": nav.row } : {};
}

/** Lleva el foco a la celda de la misma columna en otra fila, si existe. */
function focusRow(nav: CellNav | undefined, offset: number): boolean {
  if (!nav) return false;
  const target = document.querySelector<HTMLElement>(
    `[data-nav-column="${CSS.escape(nav.column)}"][data-nav-row="${nav.row + offset}"]`,
  );
  target?.focus();
  return target !== null;
}

interface EditableTextProps<T> {
  value: T | null;
  format: (value: T) => string;
  parse: (text: string) => ParseResult<T>;
  onCommit: (value: T | null) => void;
  label: string;
  /** `cell` llena la celda de una tabla; `form` es un campo con borde. */
  variant?: "cell" | "form";
  numeric?: boolean;
  placeholder?: string;
  nav?: CellNav;
  className?: string;
  list?: string;
}

/**
 * Texto que se edita en el sitio. Guarda al salir o con Enter (y baja a la
 * fila siguiente), descarta con Escape y cambia de fila con las flechas.
 */
export function EditableText<T>({
  value,
  format,
  parse,
  onCommit,
  label,
  variant = "cell",
  numeric = false,
  placeholder,
  nav,
  className,
  list,
}: EditableTextProps<T>) {
  const [draft, setDraftState] = useState<string | null>(null);
  // El foco puede moverse antes de que React repinte: el borrador vigente
  // se lee de aquí para no guardar dos veces.
  const draftRef = useRef<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const problemId = useId();
  const shown = value === null ? "" : format(value);

  function setDraft(next: string | null) {
    draftRef.current = next;
    setDraftState(next);
  }

  /** Devuelve `false` si el texto no se entiende; el borrador se conserva. */
  function commit(): boolean {
    const pending = draftRef.current;
    if (pending === null) return true;
    const result = parse(pending);
    if (!result.ok) {
      setProblem(result.reason);
      return false;
    }
    setDraft(null);
    setProblem(null);
    const next = result.value === null ? "" : format(result.value);
    if (next !== shown) onCommit(result.value);
    return true;
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setDraft(null);
      setProblem(null);
    } else if (event.key === "Enter" || event.key === "ArrowDown") {
      if (commit() && nav) {
        event.preventDefault();
        focusRow(nav, 1);
      }
    } else if (event.key === "ArrowUp") {
      if (commit() && nav) {
        event.preventDefault();
        focusRow(nav, -1);
      }
    }
  }

  return (
    <>
      <input
        {...navProps(nav)}
        aria-label={label}
        aria-invalid={problem !== null}
        aria-describedby={problem ? problemId : undefined}
        title={problem ?? undefined}
        value={draft ?? shown}
        placeholder={placeholder}
        inputMode={numeric ? "decimal" : undefined}
        list={list}
        spellCheck={false}
        autoComplete="off"
        onChange={(event) => setDraft(event.target.value)}
        onFocus={(event) => event.target.select()}
        onBlur={commit}
        onKeyDown={handleKeyDown}
        className={cx(
          "placeholder:text-surface/70 w-full min-w-0 text-sm",
          numeric && "font-mono tabular-nums",
          variant === "cell"
            ? "hover:bg-surface/10 aria-invalid:outline-danger h-10 bg-transparent px-2 focus-visible:-outline-offset-2 aria-invalid:outline-2 aria-invalid:-outline-offset-2"
            : "border-surface/20 bg-surface/5 hover:border-surface/40 aria-invalid:border-danger h-9 rounded-md border px-2",
          variant === "cell" && numeric && "text-center",
          className,
        )}
      />
      {problem ? (
        <span
          id={problemId}
          role="alert"
          className={variant === "cell" ? "sr-only" : "text-surface text-xs"}
        >
          {problem}
        </span>
      ) : null}
    </>
  );
}

const NUMERIC_TYPES: readonly FieldType[] = [
  "number",
  "decimal",
  "duration",
  "scale",
];

const PLACEHOLDERS: Partial<Record<FieldType, string>> = {
  duration: "p. ej. 6h49",
};

interface ValueInputProps {
  type: FieldType;
  value: FieldValue;
  onCommit: (value: FieldValue) => void;
  label: string;
  variant?: "cell" | "form";
  nav?: CellNav;
  className?: string;
}

/** Campo de texto para un valor de tipo número, decimal, duración o texto. */
export function ValueInput({
  type,
  value,
  onCommit,
  label,
  variant,
  nav,
  className,
}: ValueInputProps) {
  return (
    <EditableText<FieldValue>
      value={value}
      format={(current) => formatFieldValue(type, current)}
      parse={(text) => parseFieldInput(type, text)}
      onCommit={onCommit}
      label={label}
      variant={variant}
      numeric={NUMERIC_TYPES.includes(type)}
      placeholder={variant === "form" ? PLACEHOLDERS[type] : undefined}
      nav={nav}
      className={className}
    />
  );
}

interface ChoiceCellProps {
  type: FieldType;
  value: FieldValue;
  onCommit: (value: FieldValue) => void;
  label: string;
  nav?: CellNav;
}

/** Celda de hábito: cada pulsación pasa al estado siguiente. */
export function ChoiceCell({
  type,
  value,
  onCommit,
  label,
  nav,
}: ChoiceCellProps) {
  const choices = choicesFor(type);
  const index = Math.max(
    0,
    choices.findIndex((choice) => choice.value === value),
  );
  const current = choices[index];
  const next = choices[(index + 1) % choices.length];
  const Icon = current.icon;

  return (
    <button
      type="button"
      {...navProps(nav)}
      aria-label={`${label}: ${current.label}`}
      title={`${current.label} (pulsa para pasar a ${next.label})`}
      onClick={() => onCommit(next.value)}
      onKeyDown={(event) => {
        if (event.key === "ArrowDown" && focusRow(nav, 1))
          event.preventDefault();
        if (event.key === "ArrowUp" && focusRow(nav, -1))
          event.preventDefault();
      }}
      className="hover:bg-surface/10 active:bg-surface/15 flex h-10 w-full items-center justify-center focus-visible:-outline-offset-2"
    >
      <Icon aria-hidden="true" className={cx("size-4", current.color)} />
    </button>
  );
}
