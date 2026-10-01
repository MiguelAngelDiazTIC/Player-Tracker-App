import type { ButtonHTMLAttributes } from "react";
import { cx } from "../../lib/cx";

type Variant = "primary" | "secondary" | "ghost" | "danger";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  /** Botón cuadrado para un icono; necesita `aria-label`. */
  iconOnly?: boolean;
}

const VARIANTS: Record<Variant, string> = {
  primary: "bg-primary text-surface hover:bg-primary/85 active:bg-primary/70",
  secondary:
    "border border-surface/20 bg-surface/10 text-surface hover:bg-surface/20 active:bg-surface/25",
  ghost:
    "text-surface/80 hover:bg-surface/10 hover:text-surface active:bg-surface/15",
  danger:
    "border border-danger bg-danger/20 text-surface hover:bg-danger/30 active:bg-danger/40",
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
        "inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-md text-sm font-semibold whitespace-nowrap",
        "disabled:pointer-events-none disabled:opacity-50",
        iconOnly ? "w-9" : "px-4",
        VARIANTS[variant],
        className,
      )}
      {...props}
    />
  );
}
