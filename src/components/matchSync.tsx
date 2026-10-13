import { RefreshCw } from "lucide-react";
import { useState } from "react";
import { useStore } from "../app/store";
import { syncMatches, type SyncOutcome } from "../app/sync";
import { Button } from "./ui/Button";
import { Notice } from "./ui/surfaces";

type SyncState =
  { step: "idle" | "busy" } | { step: "done"; outcome: SyncOutcome };

const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;

/** Sincronización de un periodo. Solo se lanza al llamar a `run`. */
// eslint-disable-next-line react-refresh/only-export-components
export function useMatchSync(from: string, to: string) {
  const store = useStore();
  const [state, setState] = useState<SyncState>({ step: "idle" });

  async function run() {
    setState({ step: "busy" });
    const outcome = await syncMatches(
      { ...store, platform: store.services.platform },
      from,
      to,
    );
    setState({ step: "done", outcome });
  }

  return { state, run };
}

interface SyncButtonProps {
  state: SyncState;
  label: string;
  onRun: () => void;
}

export function SyncButton({ state, label, onRun }: SyncButtonProps) {
  return (
    <Button
      variant="primary"
      disabled={state.step === "busy"}
      title="Trae tus partidas de HenrikDev. Solo se conecta al pulsar."
      onClick={onRun}
    >
      <RefreshCw aria-hidden="true" className="size-4" />
      {state.step === "busy" ? "Sincronizando…" : label}
    </Button>
  );
}

interface SyncNoticeProps {
  state: SyncState;
  /** Cómo se nombra el periodo: "este día", "los últimos 7 días". */
  period: string;
  /** Lleva a la tarjeta de Ajustes donde se pone la clave. */
  onOpenSettings: () => void;
}

/** Qué ha pasado al sincronizar; nada hasta que se pulsa. */
export function SyncNotice({ state, period, onOpenSettings }: SyncNoticeProps) {
  if (state.step !== "done") return null;
  const { outcome } = state;

  if (outcome.status === "unconfigured") {
    return (
      <Notice>
        <div className="flex flex-wrap items-center gap-2">
          <p className="min-w-0 flex-1">
            Para sincronizar hacen falta tu Riot ID, tu región y una clave de
            HenrikDev. Es gratis y se saca una sola vez.
          </p>
          <Button variant="ghost" onClick={onOpenSettings}>
            Ir a Ajustes
          </Button>
        </div>
      </Notice>
    );
  }
  if (outcome.status === "failed") {
    return <Notice tone="danger">{outcome.message}</Notice>;
  }
  return (
    <Notice tone="success">
      {outcome.found === 0
        ? `HenrikDev no tiene partidas de ${period}. Si acabas de jugar, tarda unos minutos en tenerlas.`
        : `${plural(outcome.found, "partida encontrada", "partidas encontradas")}, ${plural(outcome.added, "nueva", "nuevas")}. Rankeds, K/D, ACS, agentes y mapas actualizados en ${plural(outcome.days, "día", "días")}.`}
    </Notice>
  );
}
