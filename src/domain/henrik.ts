import { z } from "zod";
import { todayIso } from "./dates";
import type { RankedSession } from "./ranked";
import { emptyScrimMatch, type ScrimMatch, type ScrimResult } from "./scrims";

/** Ajustes de la sincronización. La clave nunca sale en la exportación. */
export const HENRIK_SETTINGS = {
  riotId: "riot.id",
  region: "riot.region",
  apiKey: "henrikdev.apiKey",
} as const;

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

export interface HenrikConfig extends RiotId {
  region: HenrikRegion;
  apiKey: string;
}

/** La configuración completa, o `null` si falta el Riot ID, la región o la clave. */
export function readHenrikConfig(
  settings: Readonly<Record<string, unknown>>,
): HenrikConfig | null {
  const riotId = settings[HENRIK_SETTINGS.riotId];
  const region = settings[HENRIK_SETTINGS.region];
  const apiKey = settings[HENRIK_SETTINGS.apiKey];
  const parsed = typeof riotId === "string" ? parseRiotId(riotId) : null;
  if (
    parsed === null ||
    typeof apiKey !== "string" ||
    apiKey.trim() === "" ||
    !(HENRIK_REGIONS as readonly unknown[]).includes(region)
  ) {
    return null;
  }
  return { ...parsed, region: region as HenrikRegion, apiKey: apiKey.trim() };
}

/** Una partida del historial guardado de HenrikDev (`stored-matches`). */
export const storedMatchSchema = z.object({
  meta: z.object({
    id: z.string().min(1),
    map: z.object({ name: z.string() }),
    mode: z.string(),
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

export type HenrikMode = "competitive" | "custom";

export function storedMatchesUrl(
  config: HenrikConfig,
  mode: HenrikMode,
  page: number,
): string {
  const path = [config.region, config.name, config.tag]
    .map(encodeURIComponent)
    .join("/");
  return `${HENRIK_BASE_URL}/valorant/v1/stored-matches/${path}?mode=${mode}&size=${HENRIK_PAGE_SIZE}&page=${page}`;
}

export function accountUrl(config: RiotId): string {
  return `${HENRIK_BASE_URL}/valorant/v2/account/${encodeURIComponent(config.name)}/${encodeURIComponent(config.tag)}`;
}

/** Fecha local en la que empezó la partida: el día al que pertenece. */
export function matchDate(match: StoredMatch): string {
  return todayIso(new Date(match.meta.started_at));
}

function rounds(match: StoredMatch) {
  const { red, blue } = match.teams;
  const mine = match.stats.team.toLowerCase() === "red" ? red : blue;
  const theirs = match.stats.team.toLowerCase() === "red" ? blue : red;
  return { mine, theirs };
}

function resultOf(match: StoredMatch): ScrimResult | null {
  const { mine, theirs } = rounds(match);
  if (mine === null || theirs === null) return null;
  if (mine === theirs) return "draw";
  return mine > theirs ? "win" : "loss";
}

function totalRounds(match: StoredMatch): number | null {
  const { mine, theirs } = rounds(match);
  return mine === null || theirs === null ? null : mine + theirs;
}

/** Id de la partida de scrims creada a partir de una custom de HenrikDev. */
export function scrimIdFor(match: StoredMatch): string {
  return `henrikdev:${match.meta.id}`;
}

/** Los duelos de entrenamiento ("Skirmish") no son 10mans ni scrims. */
export function isSkirmish(match: StoredMatch): boolean {
  return match.meta.map.name.toLowerCase().startsWith("skirmish");
}

export function toRankedSession(match: StoredMatch, id: string): RankedSession {
  return {
    id,
    date: matchDate(match),
    map: match.meta.map.name,
    agent: match.stats.character.name,
    result: resultOf(match),
    kills: match.stats.kills,
    deaths: match.stats.deaths,
    score: match.stats.score,
    rounds: totalRounds(match),
    source: "henrikdev",
    externalMatchId: match.meta.id,
  };
}

export function toScrimMatch(match: StoredMatch): ScrimMatch {
  const { mine, theirs } = rounds(match);
  const total = totalRounds(match);
  return {
    ...emptyScrimMatch(scrimIdFor(match), matchDate(match)),
    map: match.meta.map.name,
    agent: match.stats.character.name,
    result: resultOf(match),
    roundsWon: mine,
    roundsLost: theirs,
    kills: match.stats.kills,
    deaths: match.stats.deaths,
    acs: total ? Math.round(match.stats.score / total) : null,
    notes: "Sincronizada de HenrikDev",
  };
}
