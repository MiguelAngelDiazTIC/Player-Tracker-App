import { z } from "zod";
import { todayIso } from "./dates";
import {
  rankedDayValues,
  type RankedDayValues,
  type RankedSession,
} from "./ranked";
import { SCRIM_RESULTS } from "./scrims";

/**
 * Colas de Riot (`queueId`) que la app sabe traer. Solo las que se juegan a
 * rondas con el mismo K/D y ACS que una ranked; las customs no llegan nunca.
 */
export const RIOT_QUEUES = [
  "competitive",
  "premier",
  "unrated",
  "swiftplay",
] as const;
export type RiotQueue = (typeof RIOT_QUEUES)[number];

export const RIOT_QUEUE_LABELS: Record<RiotQueue, string> = {
  competitive: "Competitivo",
  premier: "Premier",
  unrated: "No competitivo",
  swiftplay: "Swiftplay",
};

/** Cola que cuenta siempre; las demás se añaden en Ajustes. */
export const DEFAULT_RIOT_QUEUE: RiotQueue = "competitive";

/** Ajuste con las colas añadidas a la competitiva. */
export const RIOT_QUEUES_SETTING = "riot.queues";

/** Colas que se sincronizan según los ajustes; la competitiva, siempre. */
export function readRiotQueues(
  settings: Readonly<Record<string, unknown>>,
): RiotQueue[] {
  const stored = settings[RIOT_QUEUES_SETTING];
  const extra = Array.isArray(stored) ? stored : [];
  return RIOT_QUEUES.filter(
    (queue) => queue === DEFAULT_RIOT_QUEUE || extra.includes(queue),
  );
}

const count = z.number().int().min(0);

/**
 * Una partida tal como la entrega el servidor de sincronización: ya reducida
 * a lo que la app usa, con el mapa y el agente por su nombre y solo las cifras
 * del jugador que ha iniciado sesión.
 */
export const riotMatchSchema = z.object({
  matchId: z.string().min(1),
  /** `queueId` de Riot; vacío en las customs. */
  queueId: z.string(),
  /** `gameStartMillis`: cuándo empezó, en milisegundos desde 1970 (UTC). */
  startedAtMillis: z.number().int().min(0),
  map: z.string(),
  agent: z.string(),
  result: z.enum(SCRIM_RESULTS).nullable(),
  kills: count,
  deaths: count,
  /** Puntuación de combate total. ACS = score / rounds. */
  score: count,
  rounds: count,
});

export type RiotMatch = z.infer<typeof riotMatchSchema>;

export const riotMatchesSchema = z.array(riotMatchSchema);

/**
 * De dónde salen las partidas de un día. La app solo conoce esta interfaz, así
 * que cambiar de fuente (el servidor de MikaLog, datos de ejemplo u otra API)
 * no toca nada más.
 */
export interface MatchSource {
  /** Partidas que empezaron ese día, en la hora local del jugador. */
  fetchDay(date: string): Promise<RiotMatch[]>;
}

/** Valor de `external_match_id` de una partida de Riot. */
export function riotExternalId(matchId: string): string {
  return `riot:${matchId}`;
}

/**
 * Día al que pertenece la partida: la fecha local en la que empezó. Una
 * partida que empieza a las 23:50 es de ese día aunque acabe al siguiente.
 */
export function riotMatchDate(match: Pick<RiotMatch, "startedAtMillis">) {
  return todayIso(new Date(match.startedAtMillis));
}

export function toRankedSession(match: RiotMatch, id: string): RankedSession {
  return {
    id,
    date: riotMatchDate(match),
    map: match.map,
    agent: match.agent,
    result: match.result,
    kills: match.kills,
    deaths: match.deaths,
    score: match.score,
    rounds: match.rounds,
    source: "riot",
    externalMatchId: riotExternalId(match.matchId),
  };
}

export interface DaySyncPlan {
  /** Partidas que aún no estaban en la app, en el orden en que se jugaron. */
  newSessions: RankedSession[];
  /** Partidas de ese día y de las colas elegidas, nuevas o no. */
  found: number;
  /** Lo que se escribe en el día, con todas sus partidas ya incluidas. */
  values: RankedDayValues;
}

/**
 * Qué hacer con las partidas que ha devuelto la fuente para un día. No
 * duplica: una partida ya guardada (por su id de Riot) se deja como está, con
 * lo que el jugador haya corregido a mano. Se descartan las de otras colas y
 * las que la fuente devuelva de otro día.
 */
export function planDaySync(
  date: string,
  fetched: readonly RiotMatch[],
  existing: readonly RankedSession[],
  queues: readonly RiotQueue[],
  newId: () => string,
): DaySyncPlan {
  const seen = new Set<string>();
  const matches = fetched
    .filter(
      (match) =>
        (queues as readonly string[]).includes(match.queueId) &&
        riotMatchDate(match) === date,
    )
    // La fuente puede repetir una partida entre páginas.
    .filter((match) => !seen.has(match.matchId) && seen.add(match.matchId))
    .sort((a, b) => a.startedAtMillis - b.startedAtMillis);

  const known = new Set(existing.map((session) => session.externalMatchId));
  const newSessions = matches
    .filter((match) => !known.has(riotExternalId(match.matchId)))
    .map((match) => toRankedSession(match, newId()));

  return {
    newSessions,
    found: matches.length,
    values: rankedDayValues([
      ...existing.filter((session) => session.date === date),
      ...newSessions,
    ]),
  };
}
