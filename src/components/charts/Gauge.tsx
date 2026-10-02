interface GaugeProps {
  /** De 0 a 100. */
  value: number;
  /** Qué mide: "Preparación de hoy". */
  label: string;
  /** Texto bajo la cifra: "de 100". */
  caption: string;
}

const RADIUS = 80;
const STROKE = 16;
const WIDTH = 2 * RADIUS + STROKE;
const HEIGHT = RADIUS + STROKE;
/** Longitud del semicírculo. */
const LENGTH = Math.PI * RADIUS;

/** Medidor en semicírculo para la cifra con la que abre una vista. */
export function Gauge({ value, label, caption }: GaugeProps) {
  const clamped = Math.min(100, Math.max(0, value));
  const arc = `M ${STROKE / 2} ${HEIGHT - STROKE / 2} A ${RADIUS} ${RADIUS} 0 0 1 ${WIDTH - STROKE / 2} ${HEIGHT - STROKE / 2}`;

  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped)}
      className="relative w-56 max-w-full"
    >
      <svg
        aria-hidden="true"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        fill="none"
        strokeWidth={STROKE}
        strokeLinecap="round"
        className="w-full"
      >
        <path d={arc} className="stroke-ink/10" />
        <path
          d={arc}
          className="stroke-primary"
          strokeDasharray={LENGTH}
          strokeDashoffset={LENGTH * (1 - clamped / 100)}
        />
      </svg>
      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center">
        <span className="text-5xl leading-none font-semibold">
          {Math.round(clamped)}
        </span>
        <span className="text-ink/70 text-xs font-semibold tracking-wide uppercase">
          {caption}
        </span>
      </div>
    </div>
  );
}
