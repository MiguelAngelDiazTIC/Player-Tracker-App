import type { ReactNode } from "react";

interface ChartCardProps {
  title: string;
  /** Cifra que resume la gráfica: "Media 1.15", "Total 47". */
  summary?: string;
  /** Frase que describe la gráfica a quien no la ve. */
  description: string;
  /** Sin datos, la tarjeta lo dice en vez de dibujar unos ejes vacíos. */
  empty: boolean;
  legend?: ReactNode;
  children: ReactNode;
}

/** Marco de una gráfica: título, cifra de resumen, leyenda y el dibujo. */
export function ChartCard({
  title,
  summary,
  description,
  empty,
  legend,
  children,
}: ChartCardProps) {
  return (
    <figure className="glass-solid flex flex-col gap-2 rounded-md p-4">
      <figcaption className="flex items-baseline justify-between gap-2">
        <h3 className="truncate text-sm font-semibold" title={title}>
          {title}
        </h3>
        {summary ? (
          <span className="text-surface/70 shrink-0 font-mono text-xs">
            {summary}
          </span>
        ) : null}
      </figcaption>
      {empty ? (
        <p className="text-surface/70 flex h-44 items-center justify-center text-sm">
          Sin datos en este rango
        </p>
      ) : (
        <>
          <div role="img" aria-label={description} className="h-44">
            {children}
          </div>
          {legend}
        </>
      )}
    </figure>
  );
}

interface LegendItem {
  label: string;
  /** Clase de color de fondo de la muestra. */
  swatch: string;
  /** Las líneas llevan una muestra fina; las barras, un cuadrado. */
  shape: "line" | "rect";
}

/** Leyenda bajo la gráfica. El texto va en color de texto, no en el de la serie. */
export function ChartLegend({ items }: { items: readonly LegendItem[] }) {
  return (
    <ul className="text-surface/70 flex flex-wrap gap-4 text-xs">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className={`${item.swatch} ${
              item.shape === "line" ? "h-0.5 w-4" : "size-2 rounded-sm"
            }`}
          />
          {item.label}
        </li>
      ))}
    </ul>
  );
}
