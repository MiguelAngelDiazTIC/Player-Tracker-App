import { createHenrikSource } from "../data/henrikSource";
import type { FieldDefinition, FieldValue } from "../domain/fields";
import {
  HENRIK_KEY_SECRET,
  LEGACY_HENRIK_KEY_SETTING,
  readHenrikAccount,
} from "../domain/henrikMatches";
import type { RankedSession } from "../domain/ranked";
import { planSync, readRiotQueues } from "../domain/riotMatches";
import { datesBetween } from "../domain/stats";
import { newId } from "../lib/id";
import type { Platform } from "./services";

/** Lo que la sincronización necesita del estado de la app. */
export interface SyncContext {
  platform: Pick<Platform, "http" | "secrets">;
  settings: Readonly<Record<string, unknown>>;
  fields: readonly FieldDefinition[];
  sessions: readonly RankedSession[];
  addSessions(sessions: readonly RankedSession[]): void;
  setDayValue(date: string, key: string, value: FieldValue): void;
  setSetting(key: string, value: unknown): void;
}

export type SyncOutcome =
  /** Falta el Riot ID, la región o la clave. */
  | { status: "unconfigured" }
  | {
      status: "done";
      /** Partidas del periodo que tiene HenrikDev, nuevas o no. */
      found: number;
      added: number;
      /** Días cuyas cifras se han escrito. */
      days: number;
    }
  | { status: "failed"; message: string };

/**
 * La clave de HenrikDev, del almacén de credenciales. Una instalación de la
 * fase 4 la tenía entre los ajustes: se pasa al almacén y se borra de ahí.
 */
export async function readHenrikKey(
  context: Pick<SyncContext, "platform" | "settings" | "setSetting">,
): Promise<string> {
  const stored = await context.platform.secrets.get(HENRIK_KEY_SECRET);
  if (stored) return stored;
  const legacy = context.settings[LEGACY_HENRIK_KEY_SETTING];
  if (typeof legacy !== "string" || legacy.trim() === "") return "";
  await context.platform.secrets.set(HENRIK_KEY_SECRET, legacy.trim());
  context.setSetting(LEGACY_HENRIK_KEY_SETTING, "");
  return legacy.trim();
}

/**
 * Trae las partidas de un periodo (días incluidos), guarda las nuevas y
 * escribe en cada día con partidas sus rankeds, K/D, ACS, agentes y mapas.
 * Solo se llama cuando el usuario pulsa un botón.
 */
export async function syncMatches(
  context: SyncContext,
  from: string,
  to: string,
): Promise<SyncOutcome> {
  try {
    const account = readHenrikAccount(context.settings);
    const apiKey = account === null ? "" : await readHenrikKey(context);
    if (account === null || apiKey === "") return { status: "unconfigured" };

    const source = createHenrikSource(context.platform.http, {
      ...account,
      apiKey,
    });
    const queues = readRiotQueues(context.settings);
    const plan = planSync(
      datesBetween(from, to),
      await source.fetchDays(from, to, queues),
      context.sessions,
      queues,
      newId,
      source.source,
    );

    context.addSessions(plan.newSessions);
    for (const day of plan.days) {
      for (const [key, value] of Object.entries(day.values)) {
        const has = context.fields.some(
          (field) => field.key === key && !field.archived,
        );
        if (has && value !== null) context.setDayValue(day.date, key, value);
      }
    }
    return {
      status: "done",
      found: plan.found,
      added: plan.newSessions.length,
      days: plan.days.length,
    };
  } catch (cause) {
    return {
      status: "failed",
      message: cause instanceof Error ? cause.message : String(cause),
    };
  }
}
