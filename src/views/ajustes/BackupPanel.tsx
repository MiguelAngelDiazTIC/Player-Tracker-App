import { useState } from "react";
import { APP_FILE_PREFIX, APP_NAME } from "../../app/brand";
import { useStore } from "../../app/store";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Card, Notice } from "../../components/ui/surfaces";
import {
  applyImport,
  buildExport,
  findImportConflicts,
  type ImportConflicts,
  type ImportStrategy,
} from "../../data/backup";
import { todayIso } from "../../domain/dates";
import { parseExport, type ExportData } from "../../domain/exportFormat";

type Message = {
  tone: "success" | "danger";
  text: string;
  details?: string[];
} | null;

interface PendingImport {
  fileName: string;
  data: ExportData;
  conflicts: ImportConflicts;
}

const MAX_ERRORS_SHOWN = 8;

function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** Exportar todo a un JSON y volver a cargarlo en esta u otra instalación. */
export function BackupPanel() {
  const { services, reload } = useStore();
  const { repository, platform } = services;
  // Sin registro de scrims no se habla de partidas: no hay dónde verlas.
  const { scrimLog } = services.edition;
  const andMatches = (count: number) =>
    scrimLog ? ` y ${plural(count, "partida", "partidas")}` : "";
  const [message, setMessage] = useState<Message>(null);
  const [pending, setPending] = useState<PendingImport | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(task: () => Promise<void>, failure: string) {
    setBusy(true);
    setMessage(null);
    try {
      await task();
    } catch (cause) {
      setMessage({ tone: "danger", text: `${failure}: ${describe(cause)}` });
    } finally {
      setBusy(false);
    }
  }

  const exportJson = () =>
    run(async () => {
      const data = await buildExport(repository, platform.attachments);
      const path = await platform.saveTextFile({
        title: "Exportar datos",
        defaultName: `${APP_FILE_PREFIX}-${todayIso()}.json`,
        text: JSON.stringify(data, null, 2),
      });
      if (path) {
        setMessage({
          tone: "success",
          text: `Exportados ${plural(data.days.length, "día", "días")}${andMatches(data.scrimMatches.length)} a ${path}`,
        });
      }
    }, "No se pudo exportar");

  const chooseImport = () =>
    run(async () => {
      const file = await platform.pickFile({
        title: "Importar datos",
        extensions: ["json"],
      });
      if (!file) return;

      const result = parseExport(new TextDecoder("utf-8").decode(file.bytes));
      if (!result.ok) {
        const hidden = result.errors.length - MAX_ERRORS_SHOWN;
        setMessage({
          tone: "danger",
          text: `${file.name} no es una exportación válida de ${APP_NAME}. No se ha cambiado nada.`,
          details: [
            ...result.errors.slice(0, MAX_ERRORS_SHOWN),
            ...(hidden > 0 ? [`…y ${hidden} más`] : []),
          ],
        });
        return;
      }
      setPending({
        fileName: file.name,
        data: result.data,
        conflicts: await findImportConflicts(repository, result.data),
      });
    }, "No se pudo leer el archivo");

  const importJson = (strategy: ImportStrategy) =>
    run(async () => {
      if (!pending) return;
      setPending(null);
      const backup = await platform.backupDatabase();
      const summary = await applyImport(
        repository,
        platform.attachments,
        pending.data,
        strategy,
      );
      await reload();
      setMessage({
        tone: "success",
        text: `Importación hecha: ${plural(summary.daysWritten, "día", "días")}${andMatches(summary.scrimsWritten)}.`,
        details: [
          ...(summary.daysSkipped > 0
            ? [
                plural(
                  summary.daysSkipped,
                  "día conservado como estaba.",
                  "días conservados como estaban.",
                ),
              ]
            : []),
          `Copia de seguridad previa: ${backup}`,
        ],
      });
    }, "No se pudo importar");

  const repeated = pending?.conflicts.days.length ?? 0;

  return (
    <Card title="Copia de seguridad">
      <p className="text-ink/70 text-sm">
        Un único archivo JSON con tus días, partidas, campos, ajustes e
        imágenes. Sirve para cambiar de ordenador o guardar una copia.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy} onClick={() => void exportJson()}>
          Exportar JSON
        </Button>
        <Button disabled={busy} onClick={() => void chooseImport()}>
          Importar JSON…
        </Button>
      </div>

      {message ? (
        <Notice tone={message.tone}>
          <p className="break-words">{message.text}</p>
          {message.details ? (
            <ul className="mt-2 list-disc pl-4 font-mono text-xs break-words">
              {message.details.map((detail) => (
                <li key={detail}>{detail}</li>
              ))}
            </ul>
          ) : null}
        </Notice>
      ) : null}

      {pending ? (
        <Dialog
          title="Importar datos"
          onClose={() => setPending(null)}
          actions={
            <>
              <Button onClick={() => setPending(null)}>Cancelar</Button>
              {repeated > 0 ? (
                <>
                  <Button onClick={() => void importJson("keep")}>
                    Conservar los míos
                  </Button>
                  <Button
                    variant="primary"
                    onClick={() => void importJson("replace")}
                  >
                    Sustituir por los del archivo
                  </Button>
                </>
              ) : (
                <Button
                  variant="primary"
                  onClick={() => void importJson("replace")}
                >
                  Importar
                </Button>
              )}
            </>
          }
        >
          <p className="font-mono break-all">{pending.fileName}</p>
          <p>
            Contiene {plural(pending.data.days.length, "día", "días")}
            {scrimLog
              ? `, ${plural(pending.data.scrimMatches.length, "partida", "partidas")}`
              : ""}{" "}
            y {plural(pending.data.fieldDefinitions.length, "campo", "campos")}.
            Los campos y ajustes del archivo sustituyen a los actuales.
          </p>
          {!scrimLog && pending.data.scrimMatches.length > 0 ? (
            <Notice>
              El archivo trae{" "}
              {plural(
                pending.data.scrimMatches.length,
                "partida de scrims o 10mans",
                "partidas de scrims o 10mans",
              )}
              . Esta edición no tiene ese registro: el recuento de cada día pasa
              a la columna de la Tabla y las partidas se guardan sin mostrarse.
            </Notice>
          ) : null}
          {repeated > 0 ? (
            <Notice tone="warning">
              {plural(repeated, "día ya existe", "días ya existen")} en esta
              instalación. Elige si usas la versión del archivo o conservas la
              tuya.
            </Notice>
          ) : null}
          <p>Antes de importar se guarda una copia de tracker.db en backups.</p>
        </Dialog>
      ) : null}
    </Card>
  );
}
