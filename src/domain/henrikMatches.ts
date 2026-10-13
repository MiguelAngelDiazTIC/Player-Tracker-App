import { z } from "zod";
import type { RiotMatch, RiotQueue } from "./riotMatches";

/**
 * Ajustes de la sincronización. El Riot ID y la región son los mismos de
 * cuando la app sincronizaba en la fase 4; la clave no es un ajuste: vive en
 * el almacén de credenciales del sistema.
 */
export const SYNC_SETTINGS = {
  source: "sync.source",
  riotId: "riot.id",
  region: "riot.region",
} as const;

/** Nombre de la clave de HenrikDev en el almacén de credenciales. */
export const HENRIK_KEY_SECRET = "henrikdev-api-key";

/**
 * Ajuste donde la fase 4 guardaba la clave. Una instalación antigua aún puede
 * tenerla ahí: se pasa al almacén de credenciales la primera vez que se lee.
 */
export const LEGACY_HENRIK_KEY_SETTING = "henrikdev.apiKey";

export const HENRIK_REGIONS = ["eu", "na", "latam", "br", "ap", "kr"] as const;
export type HenrikRegion = (typeof HENRIK_REGIONS)[number];

export const HENRIK_REGION_LABELS: Record<HenrikRegion, string> = {
  eu: "Europa",
  na: "Norteamérica",
  latam: "Latinoamérica",
  br: "Brasil",
  ap: "Asia-Pacífico",
  kr: "Corea",
};

export const HENRIK_BASE_URL = "https://api.henrikdev.xyz";

/** Partidas por página al pedir el historial guardado. */
export const HENRIK_PAGE_SIZE = 60;

export interface RiotId {
  name: string;
  tag: string;
}

/** `Nombre#TAG` → nombre y tag; `null` si no tiene esa forma. */
export function parseRiotId(text: string): RiotId | null {
  const match = /^([^#]+)#([^#\s]+)$/.exec(text.trim());
  if (!match) return null;
  const name = match[1].trim();
  return name === "" ? null : { name, tag: match[2] };
}

/** De quién se piden las partidas. */
export interface HenrikAccount extends RiotId {
  region: HenrikRegion;
}

export interface HenrikConfig extends HenrikAccount {
  apiKey: string;
}

/** El Riot ID y la región de los ajustes, o `null` si falta alguno. */
export function readHenrikAccount(
  settings: Readonly<Record<string, unknown>>,
): HenrikAccount | null {
  const riotId = settings[SYNC_SETTINGS.riotId];
  const region = settings[SYNC_SETTINGS.region];
  const parsed = typeof riotId === "string" ? parseRiotId(riotId) : null;
  if (
    parsed === null ||
    !(HENRIK_REGIONS as readonly unknown[]).includes(region)
  ) {
    return null;
  }
  return { ...parsed, region: region as HenrikRegion };
}

/** Una partida del historial guardado de HenrikDev (`stored-matches`). */
export const storedMatchSchema = z.object({
  meta: z.object({
    id: z.string().min(1),
    map: z.object({ name: z.string() }),
    started_at: z.string(),
  }),
  stats: z.object({
    team: z.string(),
    character: z.object({ name: z.string() }),
    score: z.number(),
    kills: z.number(),
    deaths: z.number(),
  }),
  teams: z.object({
    red: z.number().nullable(),
    blue: z.number().nullable(),
  }),
});

export type StoredMatch = z.infer<typeof storedMatchSchema>;

export const storedMatchesSchema = z.object({
  results: z.object({ after: z.number() }),
  data: z.array(storedMatchSchema),
});

export const accountSchema = z.object({
  data: z.object({
    region: z.string(),
    account_level: z.number(),
  }),
});

/** El `mode` de HenrikDev se llama igual que la cola de Riot. */
export function storedMatchesUrl(
  account: HenrikAccount,
  queue: RiotQueue,
  page: number,
): string {
  const path = [account.region, account.name, account.tag]
    .map(encodeURIComponent)
    .join("/");
  return `${HENRIK_BASE_URL}/valorant/v1/stored-matches/${path}?mode=${queue}&size=${HENRIK_PAGE_SIZE}&page=${page}`;
}

export function accountUrl(account: RiotId): string {
  return `${HENRIK_BASE_URL}/valorant/v2/account/${encodeURIComponent(account.name)}/${encodeURIComponent(account.tag)}`;
}

const whole = (value: number) => Math.max(0, Math.round(value));

/**
 * La partida en el formato común de la app. El id de HenrikDev es el de Riot,
 * así que una partida sincronizada por aquí no se duplica si un día llega por
 * la API oficial. `null` si la fecha de inicio no se entiende.
 */
export function toRiotMatch(
  match: StoredMatch,
  queue: RiotQueue,
): RiotMatch | null {
  const startedAtMillis = Date.parse(match.meta.started_at);
  if (!Number.isFinite(startedAtMillis) || startedAtMillis < 0) return null;

  const isRed = match.stats.team.toLowerCase() === "red";
  const mine = isRed ? match.teams.red : match.teams.blue;
  const theirs = isRed ? match.teams.blue : match.teams.red;
  const played = mine !== null && theirs !== null;

  return {
    matchId: match.meta.id,
    // Se pide un modo cada vez, así que la cola es la que se pidió.
    queueId: queue,
    startedAtMillis,
    map: match.meta.map.name,
    agent: match.stats.character.name,
    result: !played
      ? null
      : mine === theirs
        ? "draw"
        : mine > theirs
          ? "win"
          : "loss",
    kills: whole(match.stats.kills),
    deaths: whole(match.stats.deaths),
    score: whole(match.stats.score),
    rounds: played ? whole(mine + theirs) : 0,
  };
}
