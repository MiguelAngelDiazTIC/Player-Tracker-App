export type SortState = false | "asc" | "desc";

/** Valor de `aria-sort` para la cabecera de una columna ordenable. */
export function ariaSort(sorted: SortState) {
  if (sorted === "asc") return "ascending" as const;
  if (sorted === "desc") return "descending" as const;
  return "none" as const;
}
