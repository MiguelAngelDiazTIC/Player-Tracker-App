import { Download } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import {
  saveSheet,
  SHEET_FORMAT_LABELS,
  type SheetFormat,
} from "../app/exportFiles";
import { useStore } from "../app/store";
import type { ExportSheet } from "../domain/sheetExport";
import { Button } from "./ui/Button";
import { Notice } from "./ui/surfaces";

interface ExportButtonProps {
  /** La hoja con las filas que se ven ahora, ya filtradas y ordenadas. */
  sheet: () => ExportSheet;
  disabled?: boolean;
}

type Result = { tone: "success" | "danger"; text: string } | null;

const FORMATS: SheetFormat[] = ["xlsx", "csv"];

/** «Exportar lo que ves»: guarda las filas visibles en Excel o CSV. */
export function ExportButton({ sheet, disabled = false }: ExportButtonProps) {
  const { services } = useStore();
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<Result>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const shown = open || result !== null;

  useEffect(() => {
    if (!shown) return;
    // Un clic fuera cierra el menú o el aviso.
    function onPointerDown(event: PointerEvent) {
      if (
        event.target instanceof Node &&
        rootRef.current?.contains(event.target)
      ) {
        return;
      }
      setOpen(false);
      setResult(null);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [shown]);

  const focusButton = () =>
    rootRef.current?.querySelector<HTMLElement>("button")?.focus();

  async function exportAs(format: SheetFormat) {
    setOpen(false);
    focusButton();
    try {
      const path = await saveSheet(services.platform, sheet(), format);
      if (path) setResult({ tone: "success", text: `Guardado en ${path}` });
    } catch (cause) {
      setResult({
        tone: "danger",
        text: `No se pudo exportar: ${cause instanceof Error ? cause.message : String(cause)}`,
      });
    }
  }

  return (
    <div
      ref={rootRef}
      className="relative"
      onKeyDown={(event) => {
        if (event.key === "Escape" && shown) {
          event.stopPropagation();
          setOpen(false);
          setResult(null);
          focusButton();
        }
      }}
    >
      <Button
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        title="Exporta las filas que ves, con sus filtros y su orden"
        onClick={() => {
          setResult(null);
          setOpen(!open);
        }}
      >
        <Download aria-hidden="true" className="size-4" />
        Exportar lo que ves
      </Button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label="Formato de exportación"
          className="glass-solid absolute top-full right-0 z-40 mt-2 flex w-44 flex-col gap-1 rounded-md p-2"
        >
          {FORMATS.map((format, index) => (
            <button
              key={format}
              type="button"
              role="menuitem"
              // El foco entra en el menú al abrirlo.
              autoFocus={index === 0}
              onClick={() => void exportAs(format)}
              className="text-ink hover:bg-ink/10 active:bg-ink/15 h-9 rounded-full px-3 text-left text-sm font-medium"
            >
              {SHEET_FORMAT_LABELS[format]}
            </button>
          ))}
        </div>
      ) : result ? (
        <div className="glass-solid absolute top-full right-0 z-40 mt-2 w-80 rounded-md p-2">
          <Notice tone={result.tone}>
            <p className="break-words">{result.text}</p>
          </Notice>
        </div>
      ) : null}
    </div>
  );
}
