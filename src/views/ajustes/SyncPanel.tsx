import { useEffect, useState } from "react";
import {
  HENRIK_GUIDE,
  HENRIK_INTRO,
  HENRIK_KEY_PREFIX,
  HENRIK_PRIVACY,
} from "../../app/henrikGuide";
import { useStore } from "../../app/store";
import { readHenrikKey } from "../../app/sync";
import { EditableText } from "../../components/cells";
import { Button } from "../../components/ui/Button";
import { Labeled, Select, TextInput } from "../../components/ui/fields";
import { Card, Notice } from "../../components/ui/surfaces";
import { testConnection } from "../../data/henrikSource";
import {
  HENRIK_KEY_SECRET,
  HENRIK_REGION_LABELS,
  HENRIK_REGIONS,
  parseRiotId,
  readHenrikAccount,
  SYNC_SETTINGS,
} from "../../domain/henrikMatches";
import { failed, parsed, type ParseResult } from "../../domain/parse";
import {
  DEFAULT_RIOT_QUEUE,
  readRiotQueues,
  RIOT_QUEUE_LABELS,
  RIOT_QUEUES,
  RIOT_QUEUES_SETTING,
} from "../../domain/riotMatches";

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

const describe = (cause: unknown) =>
  cause instanceof Error ? cause.message : String(cause);

/** Riot ID, región y clave de HenrikDev, con la guía para sacar la clave. */
export function SyncPanel() {
  const { settings, setSetting, services } = useStore();
  const { platform } = services;
  // `null` mientras se lee el almacén de credenciales.
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [keyError, setKeyError] = useState<string | null>(null);
  const [check, setCheck] = useState<Check>({ step: "idle" });

  const account = readHenrikAccount(settings);
  const riotId = text(settings[SYNC_SETTINGS.riotId]);
  const queues = readRiotQueues(settings);

  useEffect(() => {
    let active = true;
    readHenrikKey({ platform, settings, setSetting })
      .catch(() => "")
      .then((stored) => {
        if (!active) return;
        setApiKey(stored);
        setDraft(stored);
      });
    return () => {
      active = false;
    };
    // Solo al abrir la tarjeta: los ajustes cambian al escribir en ella.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [platform]);

  /** `typed` es lo que hay en la caja al salir de ella, se haya pintado o no. */
  async function saveKey(typed: string) {
    const next = typed.trim();
    if (apiKey === null || next === apiKey) return;
    try {
      await platform.secrets.set(HENRIK_KEY_SECRET, next === "" ? null : next);
      setApiKey(next);
      setDraft(next);
      setKeyError(null);
      setCheck({ step: "idle" });
    } catch (cause) {
      setKeyError(`No se pudo guardar la clave: ${describe(cause)}`);
    }
  }

  async function test() {
    if (account === null || !apiKey) return;
    setCheck({ step: "busy" });
    try {
      const found = await testConnection(platform.http, { ...account, apiKey });
      setSetting(SYNC_SETTINGS.source, "henrikdev");
      setCheck({
        step: "ok",
        message: `Conectada: ${account.name}#${account.tag}, nivel ${found.level}, región ${found.region}. Ya puedes pulsar «Sincronizar» en la página de un día.`,
      });
    } catch (cause) {
      setCheck({ step: "failed", message: describe(cause) });
    }
  }

  const ready = account !== null && Boolean(apiKey);
  const oddKey =
    draft.trim() !== "" && !draft.trim().startsWith(HENRIK_KEY_PREFIX);

  return (
    <Card title="Sincronizar partidas">
      <p className="text-ink/70 text-sm">{HENRIK_INTRO}</p>

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">
          Cómo sacar tu clave (gratis, una sola vez)
        </h3>
        <ol className="flex list-decimal flex-col gap-2 pl-6 text-sm">
          {HENRIK_GUIDE.map((step) => (
            <li key={step.text}>
              {step.text}
              {step.copy ? (
                <span className="mt-1 block font-mono text-xs break-all select-all">
                  {step.copy}
                </span>
              ) : null}
            </li>
          ))}
        </ol>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Labeled label="Riot ID">
          <EditableText<string>
            value={riotId === "" ? null : riotId}
            format={(value) => value}
            parse={parseRiotIdText}
            onCommit={(value) => {
              setSetting(SYNC_SETTINGS.riotId, value ?? "");
              setCheck({ step: "idle" });
            }}
            label="Riot ID"
            variant="form"
            placeholder="nombre#tag"
          />
        </Labeled>
        <Labeled label="Región">
          <Select
            value={text(settings[SYNC_SETTINGS.region])}
            onChange={(event) => {
              setSetting(SYNC_SETTINGS.region, event.target.value);
              setCheck({ step: "idle" });
            }}
          >
            <option value="">Elige una región</option>
            {HENRIK_REGIONS.map((region) => (
              <option key={region} value={region}>
                {HENRIK_REGION_LABELS[region]}
              </option>
            ))}
          </Select>
        </Labeled>
        <Labeled
          label="Clave de HenrikDev"
          hint={
            oddKey
              ? `Las claves empiezan por ${HENRIK_KEY_PREFIX}. Comprueba que la has copiado entera.`
              : undefined
          }
        >
          <TextInput
            type="password"
            value={draft}
            disabled={apiKey === null}
            autoComplete="off"
            spellCheck={false}
            placeholder={`${HENRIK_KEY_PREFIX}…`}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={(event) => void saveKey(event.target.value)}
            className="font-mono"
          />
        </Labeled>
      </div>

      <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <legend className="text-ink/70 mb-2 text-xs font-semibold tracking-wide uppercase">
          Qué partidas cuentan
        </legend>
        {RIOT_QUEUES.map((queue) => (
          <label key={queue} className="flex items-center gap-2">
            <input
              type="checkbox"
              className="accent-primary size-4"
              checked={queues.includes(queue)}
              // El competitivo cuenta siempre.
              disabled={queue === DEFAULT_RIOT_QUEUE}
              onChange={(event) =>
                setSetting(
                  RIOT_QUEUES_SETTING,
                  RIOT_QUEUES.filter(
                    (other) =>
                      other !== DEFAULT_RIOT_QUEUE &&
                      (other === queue
                        ? event.target.checked
                        : queues.includes(other)),
                  ),
                )
              }
            />
            {RIOT_QUEUE_LABELS[queue]}
          </label>
        ))}
      </fieldset>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="primary"
          disabled={!ready || check.step === "busy"}
          onClick={() => void test()}
        >
          {check.step === "busy" ? "Probando…" : "Probar conexión"}
        </Button>
        {ready ? null : (
          <span className="text-ink/70 text-sm">
            Rellena el Riot ID, la región y la clave para poder sincronizar.
          </span>
        )}
      </div>

      {keyError ? <Notice tone="danger">{keyError}</Notice> : null}
      {check.step === "ok" ? (
        <Notice tone="success">{check.message}</Notice>
      ) : check.step === "failed" ? (
        <Notice tone="danger">{check.message}</Notice>
      ) : null}

      <p className="text-ink/70 text-xs">{HENRIK_PRIVACY}</p>
    </Card>
  );
}
