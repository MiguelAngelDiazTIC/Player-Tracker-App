import { useState } from "react";
import { saveSheet, saveWorkbook } from "../../app/exportFiles";
import { useStore } from "../../app/store";
import { Button } from "../../components/ui/Button";
import { Labeled, Select } from "../../components/ui/fields";
import { Card, Notice } from "../../components/ui/surfaces";
import { countScrimsByDate } from "../../domain/scrims";
import {
  daysSheet,
  rankedsSheet,
  reviewsSheet,
  scrimsSheet,
  type ExportSheet,
} from "../../domain/sheetExport";

type Message = { tone: "success" | "danger"; text: string } | null;

const byDate = <T extends { date: string }>(items: readonly T[]) =>
  [...items].sort((a, b) => a.date.localeCompare(b.date));

/** Excel con todo, o un CSV por registro, para mirar los datos fuera de la app. */
export function ExportPanel() {
  const { fields, days, scrims, sessions, reviews, services } = useStore();
  const [record, setRecord] = useState(0);
  const [message, setMessage] = useState<Message>(null);
  const [busy, setBusy] = useState(false);

  const sheets = (): ExportSheet[] => [
    daysSheet(fields, days, countScrimsByDate(scrims)),
    ...(services.edition.scrimLog ? [scrimsSheet(byDate(scrims))] : []),
    rankedsSheet(byDate(sessions)),
    reviewsSheet(
      [...reviews].sort((a, b) => a.weekStart.localeCompare(b.weekStart)),
    ),
  ];
  const names = sheets().map((sheet) => sheet.name);

  async function run(save: () => Promise<string | null>) {
    setBusy(true);
    setMessage(null);
    try {
      const path = await save();
      if (path) setMessage({ tone: "success", text: `Guardado en ${path}` });
    } catch (cause) {
      setMessage({
        tone: "danger",
        text: `No se pudo exportar: ${cause instanceof Error ? cause.message : String(cause)}`,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Exportar a Excel o CSV">
      <p className="text-ink/70 text-sm">
        Para mirar o compartir tus datos fuera de la app. La hoja de días sale
        con el formato de tu hoja original, así que se puede volver a importar.
        Para cambiar de ordenador usa la copia en JSON.
      </p>
      <div>
        <Button
          variant="primary"
          disabled={busy}
          onClick={() =>
            void run(() => saveWorkbook(services.platform, sheets()))
          }
        >
          Exportar todo a Excel
        </Button>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <Labeled label="Registro" className="w-48">
          <Select
            value={record}
            onChange={(event) => setRecord(Number(event.target.value))}
          >
            {names.map((name, index) => (
              <option key={name} value={index}>
                {name}
              </option>
            ))}
          </Select>
        </Labeled>
        <Button
          disabled={busy}
          onClick={() =>
            void run(() =>
              saveSheet(services.platform, sheets()[record], "csv"),
            )
          }
        >
          Exportar CSV
        </Button>
      </div>
      {message ? (
        <Notice tone={message.tone}>
          <p className="break-words">{message.text}</p>
        </Notice>
      ) : null}
    </Card>
  );
}
