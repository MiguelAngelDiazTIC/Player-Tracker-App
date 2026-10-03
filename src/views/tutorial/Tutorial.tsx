import { CalendarPlus, FileJson, FileSpreadsheet } from "lucide-react";
import { useId, useLayoutEffect, useRef, useState } from "react";
import { APP_LOGO_URL, APP_NAME } from "../../app/brand";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { cx } from "../../lib/cx";

/** Cómo quiere empezar el usuario; la app lo lleva ahí al acabar. */
export type StartChoice = "sheet" | "json" | "scratch";

const STARTS: {
  value: StartChoice;
  title: string;
  text: string;
  icon: typeof FileJson;
}[] = [
  {
    value: "sheet",
    title: "Importar mi hoja",
    text: "Trae los días de tu Excel o CSV, con vista previa antes de guardar.",
    icon: FileSpreadsheet,
  },
  {
    value: "json",
    title: "Cargar una copia",
    text: `Un JSON exportado desde ${APP_NAME} en otro ordenador.`,
    icon: FileJson,
  },
  {
    value: "scratch",
    title: "Empezar de cero",
    text: "Crea el día de hoy y lo abre para que lo rellenes.",
    icon: CalendarPlus,
  },
];

interface TourStop {
  /** Valor de `data-tour` del elemento que señala el globo. */
  target: string;
  /** Lado del elemento en el que se coloca el globo. */
  side: "right" | "bottom";
  title: string;
  text: string;
}

const TOUR: TourStop[] = [
  {
    target: "nav-tabla",
    side: "right",
    title: "Tabla",
    text: "Una fila por día, como en tu hoja. Escribe en una celda y pulsa Enter para guardar y bajar a la siguiente.",
  },
  {
    target: "add-day",
    side: "bottom",
    title: "La página del día",
    text: "Con este botón creas el día y abres su página. Ahí escribes los feelings y marcas temas con #etiquetas, como #tilt o #saturado.",
  },
  {
    target: "nav-scrims",
    side: "right",
    title: "Scrims y 10mans",
    text: "Cada partida fuera de ranked se apunta aquí, y el recuento del día se calcula solo.",
  },
  {
    target: "nav-dashboard",
    side: "right",
    title: "Dashboard",
    text: "Tendencias, rachas de hábitos y la comparación con el periodo anterior.",
  },
  {
    target: "nav-insights",
    side: "right",
    title: "Insights",
    text: "Compara tu K/D y tu ACS con y sin cada hábito, y avisa cuando te estás saturando.",
  },
  {
    target: "nav-ajustes",
    side: "right",
    title: "Ajustes",
    text: "Aquí cambias los campos, exportas a Excel o CSV y controlas las copias automáticas. También puedes repetir este tutorial.",
  },
];

const INTRO_STEPS = 2;
const TOTAL_STEPS = INTRO_STEPS + 1;
const GAP = 16;

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(value, Math.max(min, max)));

interface TourBalloonProps {
  index: number;
  onPrevious: () => void;
  onNext: () => void;
  onExit: () => void;
}

/** Globo de cristal que señala un elemento real de la app. */
function TourBalloon({ index, onPrevious, onNext, onExit }: TourBalloonProps) {
  const stop = TOUR[index];
  const isLast = index === TOUR.length - 1;
  const titleId = useId();
  const textId = useId();
  const balloonRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);

  // La posición sale de medir el elemento señalado; se aplica sin pasar por el
  // estado de React para que el globo no parpadee al cambiar de parada.
  useLayoutEffect(() => {
    function place() {
      const balloon = balloonRef.current;
      const ring = ringRef.current;
      if (!balloon || !ring) return;
      const target = document.querySelector(`[data-tour="${stop.target}"]`);
      const size = balloon.getBoundingClientRect();
      const maxLeft = window.innerWidth - size.width - GAP;
      const maxTop = window.innerHeight - size.height - GAP;

      if (!target) {
        ring.style.display = "none";
        balloon.style.left = `${clamp((window.innerWidth - size.width) / 2, GAP, maxLeft)}px`;
        balloon.style.top = `${clamp((window.innerHeight - size.height) / 2, GAP, maxTop)}px`;
        return;
      }

      const box = target.getBoundingClientRect();
      ring.style.display = "";
      ring.style.left = `${box.left - 4}px`;
      ring.style.top = `${box.top - 4}px`;
      ring.style.width = `${box.width + 8}px`;
      ring.style.height = `${box.height + 8}px`;

      const left =
        stop.side === "right" ? box.right + GAP : clamp(box.left, GAP, maxLeft);
      const top =
        stop.side === "right"
          ? box.top + box.height / 2 - size.height / 2
          : box.bottom + GAP;
      balloon.style.left = `${clamp(left, GAP, maxLeft)}px`;
      balloon.style.top = `${clamp(top, GAP, maxTop)}px`;
    }

    place();
    balloonRef.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [stop]);

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.stopPropagation();
      onExit();
    } else if (event.key === "ArrowRight") {
      onNext();
    } else if (event.key === "ArrowLeft") {
      onPrevious();
    } else if (event.key === "Tab" && balloonRef.current) {
      // El foco no sale del globo mientras dura el recorrido.
      const buttons = [...balloonRef.current.querySelectorAll("button")];
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  }

  return (
    <div className="fixed inset-0 z-50" onKeyDown={handleKeyDown}>
      <div
        ref={ringRef}
        aria-hidden="true"
        className="tour-spotlight border-primary pointer-events-none fixed rounded-full border-2"
      />
      <div
        ref={balloonRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={textId}
        className="glass-solid fixed flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2 rounded-md p-4"
      >
        <p className="text-ink/70 font-mono text-xs">
          {index + 1} de {TOUR.length}
        </p>
        <h2 id={titleId} className="text-lg font-bold">
          {stop.title}
        </h2>
        <p id={textId} className="text-ink/80 text-sm">
          {stop.text}
        </p>
        <div className="mt-2 flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={onExit}>
            Salir
          </Button>
          <Button onClick={onPrevious}>Atrás</Button>
          <Button variant="primary" data-autofocus onClick={onNext}>
            {isLast ? "Terminar" : "Siguiente"}
          </Button>
        </div>
      </div>
    </div>
  );
}

interface TutorialProps {
  /** Cierra el tutorial. `start` es `null` si se saltó o se dejó a medias. */
  onClose: (start: StartChoice | null) => void;
}

/**
 * Tutorial del primer arranque: bienvenida, cómo empezar y un recorrido por
 * la app. Se puede saltar en cualquier paso.
 */
export function Tutorial({ onClose }: TutorialProps) {
  // 0 y 1: pasos en un diálogo. Desde 2: paradas del recorrido.
  const [step, setStep] = useState(0);
  const [start, setStart] = useState<StartChoice>("scratch");
  const groupName = useId();

  if (step >= INTRO_STEPS) {
    const index = step - INTRO_STEPS;
    return (
      <TourBalloon
        index={index}
        onPrevious={() => setStep(step - 1)}
        onNext={() =>
          index === TOUR.length - 1 ? onClose(start) : setStep(step + 1)
        }
        onExit={() => onClose(null)}
      />
    );
  }

  const counter = (
    <p className="text-ink/70 font-mono text-xs">
      Paso {step + 1} de {TOTAL_STEPS}
    </p>
  );
  const actions = (
    <>
      <Button variant="ghost" onClick={() => onClose(null)}>
        Saltar tutorial
      </Button>
      {step > 0 ? (
        <Button onClick={() => setStep(step - 1)}>Atrás</Button>
      ) : null}
      <Button
        variant="primary"
        data-autofocus
        onClick={() => setStep(step + 1)}
      >
        {step === 0 ? "Empezar" : "Siguiente"}
      </Button>
    </>
  );

  if (step === 0) {
    return (
      <Dialog
        key="welcome"
        title={`Te doy la bienvenida a ${APP_NAME}`}
        onClose={() => onClose(null)}
        actions={actions}
        size="xl"
      >
        {counter}
        <div className="flex items-center gap-4">
          <img
            src={APP_LOGO_URL}
            alt=""
            className="shadow-pill size-16 shrink-0 rounded-md"
          />
          <p>
            Tu registro diario de Valorant: partidas, hábitos, sueño y cómo te
            has sentido, en un solo sitio y guardado en tu ordenador. En un par
            de minutos te enseño cómo empezar.
          </p>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog
      key="start"
      title="¿Cómo quieres empezar?"
      onClose={() => onClose(null)}
      actions={actions}
      size="3xl"
    >
      {counter}
      <fieldset>
        <legend className="mb-2">
          Elige una opción; al terminar el tutorial te llevo ahí.
        </legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {STARTS.map(({ value, title, text, icon: Icon }) => {
            const checked = value === start;
            return (
              <label
                key={value}
                className={cx(
                  "flex cursor-pointer flex-col gap-2 rounded-md border p-4",
                  "has-focus-visible:outline-ink has-focus-visible:outline-2 has-focus-visible:outline-offset-2",
                  checked
                    ? "border-primary bg-primary/10"
                    : "border-ink/10 bg-surface/60 hover:border-ink/30",
                )}
              >
                <input
                  type="radio"
                  name={groupName}
                  className="sr-only"
                  checked={checked}
                  onChange={() => setStart(value)}
                />
                <Icon
                  aria-hidden="true"
                  className={cx("size-6", checked && "text-primary")}
                />
                <span className="text-ink font-semibold">{title}</span>
                <span className="text-ink/70 text-xs">{text}</span>
              </label>
            );
          })}
        </div>
      </fieldset>
    </Dialog>
  );
}
