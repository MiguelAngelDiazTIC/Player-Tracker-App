import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import { cx } from "../../lib/cx";

export interface Delta {
  /** Texto con signo: "+0.12", "−1h05", "igual". */
  text: string;
  direction: "up" | "down" | "flat";
  /** ¿El cambio es bueno, malo o indiferente? Decide el color del icono. */
  tone: "good" | "bad" | "neutral";
  /** Con qué se compara: "que los 7 días anteriores". */
  versus: string;
}

interface SparklineProps {
  /** Valores en orden; `null` es un día sin dato. */
  values: readonly (number | null)[];
  /** Cuántos puntos del final son el periodo actual. */
  current: number;
}

const SPARK_WIDTH = 120;
const SPARK_HEIGHT = 32;
const SPARK_PAD = 4;

/** Tendencia en miniatura: el periodo anterior en gris y el actual en color. */
function Sparkline({ values, current }: SparklineProps) {
  const known = values.filter((value): value is number => value !== null);
  if (known.length < 2) return null;

  const min = Math.min(...known);
  const max = Math.max(...known);
  const points = values
    .map((value, index) =>
      value === null
        ? null
        : {
            index,
            x:
              SPARK_PAD +
              (index / (values.length - 1)) * (SPARK_WIDTH - 2 * SPARK_PAD),
            y:
              max === min
                ? SPARK_HEIGHT / 2
                : SPARK_HEIGHT -
                  SPARK_PAD -
                  ((value - min) / (max - min)) *
                    (SPARK_HEIGHT - 2 * SPARK_PAD),
          },
    )
    .filter((point) => point !== null);

  const path = (list: typeof points) =>
    list.map((point) => `${point.x},${point.y}`).join(" ");
  const firstCurrent = values.length - current;
  // El tramo actual arranca en el último punto anterior, para que no haya corte.
  const split = points.findIndex((point) => point.index >= firstCurrent);
  const currentPoints = split <= 0 ? points : points.slice(split - 1);
  const last = points[points.length - 1];

  return (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${SPARK_WIDTH} ${SPARK_HEIGHT}`}
      className="h-8 w-30"
      fill="none"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points={path(points)} className="stroke-surface/35" />
      {split !== -1 ? (
        <polyline points={path(currentPoints)} className="stroke-chart" />
      ) : null}
      {last.index >= firstCurrent ? (
        <circle cx={last.x} cy={last.y} r={3} className="fill-chart" />
      ) : null}
    </svg>
  );
}

interface StatTileProps {
  label: string;
  value: string;
  /** De qué es la cifra: "media de 5 días", "total". */
  hint?: string;
  delta?: Delta | null;
  trend?: SparklineProps;
}

const DELTA_ICON = { up: TrendingUp, down: TrendingDown, flat: Minus } as const;
const DELTA_TONE = {
  good: "text-success",
  bad: "text-danger",
  neutral: "text-surface/70",
} as const;

/** Una cifra con su contexto: valor, cambio respecto al periodo anterior y tendencia. */
export function StatTile({ label, value, hint, delta, trend }: StatTileProps) {
  const Icon = delta ? DELTA_ICON[delta.direction] : null;
  return (
    <div className="glass flex flex-col gap-2 rounded-md p-4">
      <p className="text-surface/70 truncate font-mono text-xs tracking-wide uppercase">
        {label}
      </p>
      <p className="text-3xl font-semibold">{value}</p>
      {hint ? <p className="text-surface/70 text-xs">{hint}</p> : null}
      {delta && Icon ? (
        <p className="flex items-center gap-1 text-xs">
          <Icon
            aria-hidden="true"
            className={cx("size-4 shrink-0", DELTA_TONE[delta.tone])}
          />
          <span className="font-mono font-semibold">{delta.text}</span>
          <span className="text-surface/70">{delta.versus}</span>
        </p>
      ) : null}
      {trend ? <Sparkline {...trend} /> : null}
    </div>
  );
}
