import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { cx } from "../../lib/cx";

interface CardProps {
  title?: string;
  /** Controles a la derecha del título. */
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
}

/** Tarjeta bento de cristal. */
export function Card({ title, actions, className, children }: CardProps) {
  return (
    <section
      className={cx("glass flex flex-col gap-4 rounded-md p-4", className)}
    >
      {title || actions ? (
        <div className="flex items-center justify-between gap-2">
          {title ? (
            <h2 className="text-surface/70 font-mono text-xs tracking-wide uppercase">
              {title}
            </h2>
          ) : null}
          {actions}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="bg-surface/10 inline-flex items-center rounded-sm px-2 py-0.5 font-mono text-xs">
      {children}
    </span>
  );
}

type Tone = "info" | "success" | "warning" | "danger";

const TONES: Record<Tone, { box: string; icon: typeof Info; color: string }> = {
  info: { box: "border-surface/20 bg-surface/10", icon: Info, color: "" },
  success: {
    box: "border-success/60 bg-success/20",
    icon: CircleCheck,
    color: "text-success",
  },
  warning: {
    box: "border-warning/60 bg-warning/25",
    icon: TriangleAlert,
    color: "text-warning",
  },
  danger: {
    box: "border-danger bg-danger/25",
    icon: CircleAlert,
    color: "text-danger",
  },
};

interface NoticeProps {
  tone?: Tone;
  className?: string;
  children: ReactNode;
}

/** Mensaje en línea. Los errores se anuncian de inmediato. */
export function Notice({ tone = "info", className, children }: NoticeProps) {
  const { box, icon: Icon, color } = TONES[tone];
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cx(
        "flex items-start gap-2 rounded-md border p-2 text-sm",
        box,
        className,
      )}
    >
      <Icon
        aria-hidden="true"
        className={cx("mt-0.5 size-4 shrink-0", color)}
      />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
