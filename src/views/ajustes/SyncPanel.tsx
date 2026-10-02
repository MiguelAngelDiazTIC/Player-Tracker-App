import { useState } from "react";
import { useStore } from "../../app/store";
import { EditableText } from "../../components/cells";
import { Button } from "../../components/ui/Button";
import { Labeled, Select } from "../../components/ui/fields";
import { Card, Notice } from "../../components/ui/surfaces";
import { testConnection } from "../../data/henrikSync";
import {
  HENRIK_REGION_LABELS,
  HENRIK_REGIONS,
  HENRIK_SETTINGS,
  parseRiotId,
  readHenrikConfig,
} from "../../domain/henrik";
import { failed, parsed, type ParseResult } from "../../domain/parse";

type Check =
  { step: "idle" | "busy" } | { step: "ok" | "failed"; message: string };

function parseRiotIdText(text: string): ParseResult<string> {
  const trimmed = text.trim();
  if (trimmed === "") return parsed(null);
  return parseRiotId(trimmed)
    ? parsed(trimmed)
    : failed("Escríbelo como nombre#tag, por ejemplo Jugador#EUW");
}

const text = (value: unknown) => (typeof value === "string" ? value : "");

/** Riot ID, región y clave de HenrikDev para traer K/D y ACS de cada día. */
export function SyncPanel() {
  const { settings, setSetting, services } = useStore();
  const [check, setCheck] = useState<Check>({ step: "idle" });
  const config = readHenrikConfig(settings);
  const riotId = text(settings[HENRIK_SETTINGS.riotId]);
  const apiKey = text(settings[HENRIK_SETTINGS.apiKey]);

  async function test() {
    if (config === null) return;
    setCheck({ step: "busy" });
    try {
      const account = await testConnection(services.platform.http, config);
      setCheck({
        step: "ok",
        message: `Conexión correcta: ${config.name}#${config.tag}, nivel ${account.level}, región ${account.region}.`,
      });
    } catch (cause) {
      setCheck({
        step: "failed",
        message: cause instanceof Error ? cause.message : String(cause),
      });
    }
  }

  return (
    <Card title="Sincronización con HenrikDev">
      <p className="text-surface/70 text-sm">
        Opcional. Con una clave de HenrikDev (un servicio no oficial), el botón
        «Sincronizar» de cada día trae sus rankeds y calcula el K/D y el ACS.
        Solo se conecta cuando lo pulsas. La clave se pide en
        api.henrikdev.xyz/dashboard y nunca sale en la exportación.
      </p>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Labeled label="Riot ID">
          <EditableText<string>
            value={riotId === "" ? null : riotId}
            format={(value) => value}
            parse={parseRiotIdText}
            onCommit={(value) =>
              setSetting(HENRIK_SETTINGS.riotId, value ?? "")
            }
            label="Riot ID"
            variant="form"
            placeholder="nombre#tag"
          />
        </Labeled>
        <Labeled label="Región">
          <Select
            value={text(settings[HENRIK_SETTINGS.region])}
            onChange={(event) =>
              setSetting(HENRIK_SETTINGS.region, event.target.value)
            }
          >
            <option value="">Elige una región</option>
            {HENRIK_REGIONS.map((region) => (
              <option key={region} value={region}>
                {HENRIK_REGION_LABELS[region]}
              </option>
            ))}
          </Select>
        </Labeled>
        <Labeled label="Clave de HenrikDev">
          <input
            type="password"
            // Sin controlar: la clave se guarda al salir, no en cada tecla.
            key={apiKey}
            defaultValue={apiKey}
            autoComplete="off"
            spellCheck={false}
            onBlur={(event) => {
              const next = event.target.value.trim();
              if (next !== apiKey) setSetting(HENRIK_SETTINGS.apiKey, next);
            }}
            className="border-surface/20 bg-surface/5 hover:border-surface/40 h-9 w-full rounded-md border px-2 font-mono text-sm"
          />
        </Labeled>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          disabled={config === null || check.step === "busy"}
          onClick={() => void test()}
        >
          {check.step === "busy" ? "Probando…" : "Probar conexión"}
        </Button>
        {config === null ? (
          <span className="text-surface/70 text-sm">
            Rellena los tres campos para poder sincronizar.
          </span>
        ) : null}
      </div>

      {check.step === "ok" ? (
        <Notice tone="success">{check.message}</Notice>
      ) : check.step === "failed" ? (
        <Notice tone="danger">{check.message}</Notice>
      ) : null}
    </Card>
  );
}
