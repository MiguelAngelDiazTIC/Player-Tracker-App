import { useEffect, useState, type ReactNode } from "react";
import type { Services } from "../app/services";
import { Button } from "../components/ui/Button";
import { Labeled, TextInput } from "../components/ui/fields";
import { Card, Notice } from "../components/ui/surfaces";
import {
  folderHasData,
  openDataFolder,
  pickFolder,
  readConfiguredFolder,
  suggestDataFolder,
} from "./tauri";

type State =
  | { step: "loading" }
  | { step: "choose"; folder: string; hasData: boolean; error: string | null }
  | { step: "ready"; services: Services };

function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

interface BootstrapProps {
  children: (services: Services) => ReactNode;
}

/** Abre la carpeta de datos; en el primer arranque pregunta dónde crearla. */
export function Bootstrap({ children }: BootstrapProps) {
  const [state, setState] = useState<State>({ step: "loading" });

  function chooseStep(folder: string, error: string | null = null) {
    setState({ step: "choose", folder, hasData: false, error });
    void folderHasData(folder)
      .catch(() => false)
      .then((hasData) => {
        setState((current) =>
          current.step === "choose" && current.folder === folder
            ? { ...current, hasData }
            : current,
        );
      });
  }

  async function start(folder: string) {
    setState({ step: "loading" });
    try {
      setState({ step: "ready", services: await openDataFolder(folder) });
    } catch (cause) {
      chooseStep(folder, `No se pudo abrir esa carpeta: ${describe(cause)}`);
    }
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const configured = await readConfiguredFolder().catch(() => null);
      if (cancelled) return;
      if (configured) await start(configured);
      else chooseStep(await suggestDataFolder());
    })();
    return () => {
      cancelled = true;
    };
    // Solo al arrancar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (state.step === "ready") return children(state.services);

  if (state.step === "loading") {
    return (
      <p role="status" className="text-ink/70 p-4">
        Abriendo tus datos…
      </p>
    );
  }

  const { folder, hasData, error } = state;
  return (
    <main className="flex h-full items-center justify-center p-4">
      <Card className="w-full max-w-xl">
        <div>
          <h1 className="text-3xl font-bold">Player Tracker</h1>
          <p className="text-ink/70">
            Tus datos se guardan en una carpeta de tu ordenador, sin cuentas ni
            servidores. Elige dónde.
          </p>
        </div>

        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void start(folder.trim());
          }}
        >
          <Labeled
            label="Carpeta de datos"
            hint="Ahí se crean tracker.db y la carpeta attachments."
          >
            <TextInput
              value={folder}
              onChange={(event) => chooseStep(event.target.value)}
              spellCheck={false}
              className="font-mono"
            />
          </Labeled>

          {hasData ? (
            <Notice>Esa carpeta ya tiene datos: se abrirán tal cual.</Notice>
          ) : null}
          {error ? <Notice tone="danger">{error}</Notice> : null}

          <div className="flex justify-end gap-2">
            <Button
              onClick={() =>
                void pickFolder("Carpeta de datos").then((picked) => {
                  if (picked) chooseStep(picked);
                })
              }
            >
              Elegir carpeta…
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={folder.trim() === ""}
            >
              Empezar aquí
            </Button>
          </div>
        </form>
      </Card>
    </main>
  );
}
