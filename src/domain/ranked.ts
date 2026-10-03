import { z } from "zod";
import { isoDateSchema } from "./day";
import { SCRIM_RESULTS } from "./scrims";

export const RANKED_SOURCES = ["manual", "henrikdev"] as const;

const count = z.number().int().min(0).nullable();

export const rankedSessionSchema = z.object({
  id: z.string().min(1),
  date: isoDateSchema,
  map: z.string(),
  agent: z.string(),
  result: z.enum(SCRIM_RESULTS).nullable(),
  kills: count,
  deaths: count,
  /** Puntuación de combate total de la partida. ACS = score / rounds. */
  score: count,
  rounds: count,
  source: z.enum(RANKED_SOURCES),
  /** Id de la partida en HenrikDev, de cuando la app sincronizaba. */
  externalMatchId: z.string().nullable(),
});

export type RankedSession = z.infer<typeof rankedSessionSchema>;

export function emptyRankedSession(id: string, date: string): RankedSession {
  return {
    id,
    date,
    map: "",
    agent: "",
    result: null,
    kills: null,
    deaths: null,
    score: null,
    rounds: null,
    source: "manual",
    externalMatchId: null,
  };
}

function ratio(top: number, bottom: number): number {
  return bottom === 0 ? top : top / bottom;
}

/** ACS de una partida: puntuación entre rondas. */
export function sessionAcs(
  session: Pick<RankedSession, "score" | "rounds">,
): number | null {
  if (session.score === null || !session.rounds) return null;
  return session.score / session.rounds;
}

export interface RankedTotals {
  count: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number | null;
  /** Kills totales entre muertes totales. */
  kd: number | null;
  /** Puntuación total entre rondas totales. */
  acs: number | null;
}

/**
 * Cifras de un grupo de partidas. El K/D y el ACS se calculan sobre los
 * totales, como hace el juego, no promediando el de cada partida.
 */
export function rankedTotals(sessions: readonly RankedSession[]): RankedTotals {
  const results = (result: RankedSession["result"]) =>
    sessions.filter((session) => session.result === result).length;
  const wins = results("win");
  const losses = results("loss");
  const draws = results("draw");
  const decided = wins + losses + draws;

  const withKd = sessions.filter(
    (session) => session.kills !== null && session.deaths !== null,
  );
  const withAcs = sessions.filter((session) => sessionAcs(session) !== null);
  const sum = (list: readonly RankedSession[], key: keyof RankedSession) =>
    list.reduce((total, session) => total + ((session[key] as number) ?? 0), 0);

  return {
    count: sessions.length,
    wins,
    losses,
    draws,
    winRate: decided === 0 ? null : (wins / decided) * 100,
    kd:
      withKd.length === 0
        ? null
        : ratio(sum(withKd, "kills"), sum(withKd, "deaths")),
    acs:
      withAcs.length === 0
        ? null
        : sum(withAcs, "score") / sum(withAcs, "rounds"),
  };
}

export interface RankedGroup extends RankedTotals {
  name: string;
}

/** Cifras por mapa o por agente, del más jugado al menos. */
export function rankedBy(
  sessions: readonly RankedSession[],
  key: "map" | "agent",
): RankedGroup[] {
  const groups = new Map<string, RankedSession[]>();
  for (const session of sessions) {
    const name = session[key];
    if (name === "") continue;
    groups.set(name, [...(groups.get(name) ?? []), session]);
  }
  return [...groups.entries()]
    .map(([name, list]) => ({ name, ...rankedTotals(list) }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}
