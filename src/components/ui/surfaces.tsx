import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";
import { useId, type ReactNode } from "react";
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
  const titleId = useId();
  return (
    <section
      // Con título, la tarjeta es una región con nombre para lectores de pantalla.
      aria-labelledby={title ? titleId : undefined}
      className={cx("glass flex flex-col gap-4 rounded-md p-4", className)}
    >
      {title || actions ? (
        <div className="flex items-center justify-between gap-2">
          {title ? (
            <h2
              id={titleId}
              className="text-ink/70 text-xs font-semibold tracking-wide uppercase"
            >
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
    <span className="bg-ink/5 border-ink/10 inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium">
      {children}
    </span>
  );
}

type Tone = "info" | "success" | "warning" | "danger";

const TONES: Record<Tone, { box: string; icon: typeof Info; color: string }> = {
  info: { box: "border-ink/10 bg-surface/70", icon: Info, color: "" },
  success: {
    box: "border-success/30 bg-success/10",
    icon: CircleCheck,
    color: "text-success",
  },
  warning: {
    box: "border-warning/30 bg-warning/10",
    icon: TriangleAlert,
    color: "text-warning",
  },
  danger: {
    box: "border-danger/30 bg-danger/10",
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
        "flex items-start gap-2 rounded-md border px-4 py-2 text-sm",
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
