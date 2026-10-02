import { useState } from "react";
import { useStore } from "../../app/store";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Card, Notice } from "../../components/ui/surfaces";

interface Pending {
  folder: string;
  hasData: boolean;
}

function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

/** Dónde viven `tracker.db` y `attachments/`, y cómo llevarlos a otro sitio. */
export function DataFolderPanel() {
  const { platform } = useStore().services;
  const [pending, setPending] = useState<Pending | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function choose() {
    setError(null);
    try {
      const folder = await platform.pickFolder("Nueva carpeta de datos");
      if (!folder || folder === platform.dataFolder) return;
      setPending({ folder, hasData: await platform.folderHasData(folder) });
    } catch (cause) {
      setError(`No se pudo abrir la carpeta: ${describe(cause)}`);
    }
  }

  function apply(mode: "copy" | "use") {
    if (!pending) return;
    platform.switchDataFolder(pending.folder, mode).catch((cause: unknown) => {
      setError(`No se pudo cambiar la carpeta: ${describe(cause)}`);
    });
    setPending(null);
  }

  return (
    <Card title="Carpeta de datos">
      <p className="text-ink/70 text-sm">
        Todos tus datos están en esta carpeta de tu ordenador. Puedes copiarla o
        sincronizarla con Drive.
      </p>
      <p className="bg-surface/60 border-ink/10 rounded-md border px-4 py-2 font-mono text-sm break-all">
        {platform.dataFolder}
      </p>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <div>
        <Button onClick={() => void choose()}>Cambiar carpeta…</Button>
      </div>

      {pending ? (
        <Dialog
          title="Cambiar la carpeta de datos"
          onClose={() => setPending(null)}
          actions={
            <>
              <Button onClick={() => setPending(null)}>Cancelar</Button>
              {pending.hasData ? (
                <Button variant="primary" onClick={() => apply("use")}>
                  Abrir esos datos
                </Button>
              ) : (
                <Button variant="primary" onClick={() => apply("copy")}>
                  Copiar mis datos ahí
                </Button>
              )}
            </>
          }
        >
          <p className="font-mono break-all">{pending.folder}</p>
          <p>
            {pending.hasData
              ? "Esa carpeta ya tiene datos de Player Tracker. La app se reiniciará y los abrirá; los de la carpeta actual se quedan donde están."
              : "Tus datos actuales se copiarán a esa carpeta y la app se reiniciará usándola. La carpeta antigua no se borra."}
          </p>
        </Dialog>
      ) : null}
    </Card>
  );
}
