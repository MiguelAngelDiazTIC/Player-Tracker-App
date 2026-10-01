import { useEffect, useId, useRef, type ReactNode } from "react";
import { cx } from "../../lib/cx";

interface DialogProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Botones de acción, alineados al final. */
  actions: ReactNode;
  className?: string;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Diálogo modal: atrapa el foco, se cierra con Escape y lo devuelve al salir. */
export function Dialog({
  title,
  onClose,
  children,
  actions,
  className,
}: DialogProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previous = document.activeElement;
    panelRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    return () => {
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, []);

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== "Tab" || !panelRef.current) return;

    const focusable = [
      ...panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE),
    ];
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }

  return (
    <div className="bg-canvas/70 fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={handleKeyDown}
        className={cx(
          "glass-solid flex max-h-full w-full max-w-md flex-col gap-4 overflow-auto rounded-md p-4",
          className,
        )}
      >
        <h2 id={titleId} className="text-lg font-bold">
          {title}
        </h2>
        <div className="text-surface/80 flex flex-col gap-2 text-sm">
          {children}
        </div>
        <div className="flex flex-wrap justify-end gap-2">{actions}</div>
      </div>
    </div>
  );
}
