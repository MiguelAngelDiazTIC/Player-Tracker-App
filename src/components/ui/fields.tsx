import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from "react";
import { cx } from "../../lib/cx";

const CONTROL =
  "h-9 w-full rounded-full border border-ink/10 bg-surface/80 px-3 text-sm text-ink placeholder:text-ink/70 hover:border-ink/30 disabled:opacity-50 aria-invalid:border-danger";

export function TextInput({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx(CONTROL, className)} {...props} />;
}

export function Select({
  className,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  // Las opciones se pintan con los colores del sistema: fondo y texto fijos.
  return (
    <select
      className={cx(
        CONTROL,
        "[&>option]:bg-surface [&>option]:text-ink",
        className,
      )}
      {...props}
    />
  );
}

interface LabeledProps {
  label: string;
  /** Texto de ayuda o de error bajo el control. */
  hint?: ReactNode;
  className?: string;
  children: ReactNode;
}

/** Etiqueta visible encima de un control. */
export function Labeled({ label, hint, className, children }: LabeledProps) {
  return (
    <label className={cx("flex flex-col gap-2", className)}>
      <span className="text-ink/70 text-xs font-semibold tracking-wide uppercase">
        {label}
      </span>
      {children}
      {hint ? <span className="text-ink/70 text-xs">{hint}</span> : null}
    </label>
  );
}
