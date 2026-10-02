import type { ButtonHTMLAttributes } from "react";
import { cx } from "../../lib/cx";

type Variant = "primary" | "secondary" | "ghost" | "danger";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  /** Botón cuadrado para un icono; necesita `aria-label`. */
  iconOnly?: boolean;
}

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-primary text-surface shadow-pill hover:bg-primary/90 active:bg-primary/80",
  secondary:
    "border border-ink/10 bg-surface/80 text-ink shadow-pill hover:bg-surface active:bg-ink/5",
  ghost: "text-ink/80 hover:bg-surface/70 hover:text-ink active:bg-ink/10",
  danger:
    "border border-danger/40 bg-danger/10 text-danger hover:bg-danger/20 active:bg-danger/30",
};

export function Button({
  variant = "secondary",
  iconOnly = false,
  className,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(
        "inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-full text-sm font-semibold whitespace-nowrap",
        "disabled:pointer-events-none disabled:opacity-50",
        iconOnly ? "w-9" : "px-4",
        VARIANTS[variant],
        className,
      )}
      {...props}
    />
  );
}
