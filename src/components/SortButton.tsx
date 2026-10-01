import { ArrowDown, ArrowUp } from "lucide-react";
import type { SortState } from "./sort";

interface SortButtonProps {
  label: string;
  sorted: SortState;
  onToggle: () => void;
}

/**
 * Cabecera de columna que ordena la tabla al pulsarla. El nombre puede
 * ocupar dos líneas para que las columnas sean estrechas, como en la hoja.
 */
export function SortButton({ label, sorted, onToggle }: SortButtonProps) {
  const Icon = sorted === "asc" ? ArrowUp : ArrowDown;
  return (
    <button
      type="button"
      onClick={onToggle}
      title={`Ordenar por ${label}`}
      className="hover:text-surface inline-flex min-h-10 w-full cursor-pointer items-center justify-center gap-1 px-2 leading-tight tracking-wide uppercase focus-visible:-outline-offset-2"
    >
      {label}
      {sorted ? <Icon aria-hidden="true" className="size-3 shrink-0" /> : null}
    </button>
  );
}
