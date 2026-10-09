import type { RiotMatch } from "../../src/domain/riotMatches";

/** Nombres del juego: agente por `characterId` y mapa por `mapId`. */
export interface ContentNames {
  agents: Record<string, string>;
  maps: Record<string, string>;
}

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const text = (value: unknown) => (typeof value === "string" ? value : "");

/** Entero no negativo; lo que no sea un número cuenta como cero. */
function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.round(value))
    : 0;
}

const list = (value: unknown): Json[] =>
  Array.isArray(value) ? value.filter(isObject) : [];

/** De `VAL-CONTENT-V1` solo se guardan los nombres de agentes y mapas. */
export function reduceContent(raw: unknown): ContentNames {
  const names: ContentNames = { agents: {}, maps: {} };
  if (!isObject(raw)) return names;
  for (const character of list(raw.characters)) {
    const id = text(character.id).toLowerCase();
    if (id && text(character.name)) names.agents[id] = text(character.name);
  }
  for (const map of list(raw.maps)) {
    // Las partidas identifican el mapa por su ruta (`/Game/Maps/Ascent/Ascent`).
    const path = text(map.assetPath).toLowerCase();
    if (path && text(map.name)) names.maps[path] = text(map.name);
  }
  return names;
}

/** Sin nombre en el contenido, el último tramo de la ruta del mapa. */
function mapName(mapId: string, names: ContentNames): string {
  return names.maps[mapId.toLowerCase()] ?? mapId.split("/").pop() ?? "";
}

export interface HistoryEntry {
  matchId: string;
  startedAtMillis: number;
  queueId: string;
}

/** Entradas de la lista de partidas (`matchlists/by-puuid`). */
export function reduceHistory(raw: unknown): HistoryEntry[] {
  if (!isObject(raw)) return [];
  return list(raw.history)
    .map((entry) => ({
      matchId: text(entry.matchId),
      startedAtMillis: count(entry.gameStartTimeMillis),
      queueId: text(entry.queueId),
    }))
    .filter((entry) => entry.matchId !== "");
}

/**
 * De una partida de `VAL-MATCH-V1`, lo único que la app usa y solo del
 * jugador que pregunta. `null` si la respuesta no es una partida suya.
 */
export function reduceMatch(
  raw: unknown,
  puuid: string,
  names: ContentNames,
): RiotMatch | null {
  if (!isObject(raw) || !isObject(raw.matchInfo)) return null;
  const info = raw.matchInfo;
  const player = list(raw.players).find((other) => other.puuid === puuid);
  const matchId = text(info.matchId);
  if (!player || matchId === "") return null;

  const stats = isObject(player.stats) ? player.stats : {};
  const teams = list(raw.teams);
  const mine = teams.find((team) => team.teamId === player.teamId);
  const result =
    info.isCompleted === false || !mine
      ? null
      : mine.won === true
        ? "win"
        : teams.some((team) => team.won === true)
          ? "loss"
          : "draw";

  return {
    matchId,
    queueId: text(info.queueId),
    startedAtMillis: count(info.gameStartMillis),
    map: mapName(text(info.mapId), names),
    agent: names.agents[text(player.characterId).toLowerCase()] ?? "",
    result,
    kills: count(stats.kills),
    deaths: count(stats.deaths),
    score: count(stats.score),
    rounds: count(stats.roundsPlayed),
  };
}
