import { useEffect, useState } from "react";
import { useStore } from "../../app/store";
import { Button } from "../../components/ui/Button";
import { Labeled, Select } from "../../components/ui/fields";
import { Segmented } from "../../components/ui/Segmented";
import { Card, Notice } from "../../components/ui/surfaces";
import { writeBackup } from "../../data/autoBackup";
import {
  AUTO_BACKUP_SETTING,
  backupDate,
  BACKUPS_TO_KEEP,
  lastBackupDate,
  readAutoBackup,
} from "../../domain/autoBackup";
import { formatDate, todayIso } from "../../domain/dates";

type Message = { tone: "success" | "danger"; text: string } | null;

const FREQUENCIES: { days: number; label: string }[] = [
  { days: 1, label: "Cada día" },
  { days: 3, label: "Cada 3 días" },
  { days: 7, label: "Cada semana" },
  { days: 14, label: "Cada 2 semanas" },
  { days: 30, label: "Cada mes" },
];

/** Copias JSON que la app guarda sola en `copias/` al abrirse. */
export function AutoBackupPanel() {
  const { settings, setSetting, services } = useStore();
  const { repository, platform } = services;
  const config = readAutoBackup(settings[AUTO_BACKUP_SETTING]);
  // `null` mientras se lee la carpeta.
  const [names, setNames] = useState<string[] | null>(null);
  const [message, setMessage] = useState<Message>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    platform.backupFolder
      .list()
      .catch((): string[] => [])
      .then((list) => {
        if (active) setNames(list);
      });
    return () => {
      active = false;
    };
  }, [platform]);

  async function backupNow() {
    setBusy(true);
    setMessage(null);
    try {
      const name = await writeBackup(
        repository,
        platform.attachments,
        platform.backupFolder,
        todayIso(),
      );
      setNames(await platform.backupFolder.list());
      setMessage({ tone: "success", text: `Copia guardada: ${name}` });
    } catch (cause) {
      setMessage({
        tone: "danger",
        text: `No se pudo hacer la copia: ${cause instanceof Error ? cause.message : String(cause)}`,
      });
    } finally {
      setBusy(false);
    }
  }

  const copies = (names ?? []).filter((name) => backupDate(name) !== null);
  const last = lastBackupDate(copies);
  const frequencies = FREQUENCIES.some((item) => item.days === config.everyDays)
    ? FREQUENCIES
    : [
        ...FREQUENCIES,
        { days: config.everyDays, label: `Cada ${config.everyDays} días` },
      ];

  return (
    <Card title="Copias automáticas">
      <p className="text-ink/70 text-sm">
        Al abrir la app, si toca, se guarda una copia completa en JSON dentro de
        la carpeta «copias» de tu carpeta de datos. Se conservan las{" "}
        {BACKUPS_TO_KEEP} más recientes.
      </p>
      <div className="flex flex-wrap items-end gap-4">
        <Segmented
          label="Copias"
          value={config.enabled ? "on" : "off"}
          options={[
            { value: "on", label: "Activadas" },
            { value: "off", label: "Desactivadas" },
          ]}
          onChange={(value) =>
            setSetting(AUTO_BACKUP_SETTING, {
              ...config,
              enabled: value === "on",
            })
          }
        />
        <Labeled label="Frecuencia" className="w-44">
          <Select
            value={config.everyDays}
            disabled={!config.enabled}
            onChange={(event) =>
              setSetting(AUTO_BACKUP_SETTING, {
                ...config,
                everyDays: Number(event.target.value),
              })
            }
          >
            {frequencies.map((item) => (
              <option key={item.days} value={item.days}>
                {item.label}
              </option>
            ))}
          </Select>
        </Labeled>
      </div>
      <p className="text-sm" role="status">
        {names === null
          ? "Buscando copias…"
          : last === null
            ? "Aún no hay ninguna copia."
            : `Última copia: ${formatDate(last)} · ${copies.length} ${copies.length === 1 ? "copia guardada" : "copias guardadas"}`}
      </p>
      <div>
        <Button disabled={busy} onClick={() => void backupNow()}>
          Hacer una copia ahora
        </Button>
      </div>
      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
    </Card>
  );
}
