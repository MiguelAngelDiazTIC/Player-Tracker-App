interface TooltipRow {
  label: string;
  value: string;
  /** Color de la serie, como trazo corto junto al nombre. */
  color: string;
}

interface ChartTooltipProps {
  title: string;
  rows: readonly TooltipRow[];
}

/** Lectura al pasar el ratón: el valor manda y el nombre de la serie acompaña. */
export function ChartTooltip({ title, rows }: ChartTooltipProps) {
  return (
    <div className="border-surface/20 bg-canvas rounded-md border p-2 text-xs">
      <p className="text-surface/70 font-mono">{title}</p>
      <ul className="mt-1 flex flex-col gap-1">
        {rows.map((row) => (
          <li key={row.label} className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="h-0.5 w-3 shrink-0"
              style={{ backgroundColor: row.color }}
            />
            <span className="font-mono text-sm font-semibold">{row.value}</span>
            <span className="text-surface/70">{row.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
