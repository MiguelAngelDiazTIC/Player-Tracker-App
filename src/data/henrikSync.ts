import {
  accountSchema,
  accountUrl,
  HENRIK_PAGE_SIZE,
  isSkirmish,
  matchDate,
  scrimIdFor,
  storedMatchesSchema,
  storedMatchesUrl,
  toRankedSession,
  toScrimMatch,
  type HenrikConfig,
  type HenrikMode,
  type StoredMatch,
} from "../domain/henrik";
import {
  rankedTotals,
  type RankedSession,
  type RankedTotals,
} from "../domain/ranked";
import type { ScrimMatch } from "../domain/scrims";

export interface HttpResponse {
  status: number;
  /** Cuerpo JSON ya leído, o `null` si no lo era. */
  body: unknown;
  /** Segundos hasta que se pueda volver a pedir, si el servidor lo dice. */
  retryAfterSeconds: number | null;
}

/** Lo único que la sincronización necesita de la red: un GET con cabeceras. */
export interface HttpClient {
  get(url: string, headers: Record<string, string>): Promise<HttpResponse>;
}

export type SyncErrorKind =
  "auth" | "not-found" | "rate-limit" | "network" | "format";

/** Fallo de la sincronización, con un mensaje pensado para el usuario. */
export class SyncError extends Error {
  readonly kind: SyncErrorKind;

  constructor(kind: SyncErrorKind, message: string) {
    super(message);
    this.name = "SyncError";
    this.kind = kind;
  }
}

/** Tope de páginas por si el día pedido queda muy atrás en el historial. */
const MAX_PAGES = 20;

async function request(
  http: HttpClient,
  config: HenrikConfig,
  url: string,
): Promise<unknown> {
  let response: HttpResponse;
  try {
    response = await http.get(url, { Authorization: config.apiKey });
  } catch (cause) {
    throw new SyncError(
      "network",
      `No se pudo conectar con HenrikDev: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
  }

  switch (response.status) {
    case 200:
      return response.body;
    case 401:
    case 403:
      throw new SyncError(
        "auth",
        "HenrikDev no acepta la clave. Revísala en Ajustes.",
      );
    case 404:
      throw new SyncError(
        "not-found",
        `HenrikDev no encuentra la cuenta ${config.name}#${config.tag} en esa región.`,
      );
    case 429:
      throw new SyncError(
        "rate-limit",
        response.retryAfterSeconds === null
          ? "Se ha alcanzado el límite de peticiones de la clave. Espera un minuto y vuelve a intentarlo."
          : `Se ha alcanzado el límite de peticiones de la clave. Vuelve a intentarlo en ${response.retryAfterSeconds} segundos.`,
      );
    default:
      throw new SyncError(
        "network",
        `HenrikDev ha respondido con un error (${response.status}). Prueba más tarde.`,
      );
  }
}

/** Comprueba la clave y el Riot ID pidiendo la cuenta. */
export async function testConnection(
  http: HttpClient,
  config: HenrikConfig,
): Promise<{ region: string; level: number }> {
  const body = await request(http, config, accountUrl(config));
  const account = accountSchema.safeParse(body);
  if (!account.success) {
    throw new SyncError(
      "format",
      "La respuesta de HenrikDev no es la esperada.",
    );
  }
  return {
    region: account.data.data.region,
    level: account.data.data.account_level,
  };
}

/**
 * Partidas de un modo jugadas en una fecha. El historial llega de la más
 * reciente a la más antigua, así que se pasan páginas hasta dejar atrás el día.
 */
export async function fetchDayMatches(
  http: HttpClient,
  config: HenrikConfig,
  mode: HenrikMode,
  date: string,
): Promise<StoredMatch[]> {
  const found: StoredMatch[] = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const body = await request(
      http,
      config,
      storedMatchesUrl(config, mode, page),
    );
    const parsed = storedMatchesSchema.safeParse(body);
    if (!parsed.success) {
      throw new SyncError(
        "format",
        "La respuesta de HenrikDev no es la esperada.",
      );
    }

    const { data, results } = parsed.data;
    found.push(...data.filter((match) => matchDate(match) === date));
    const reachedOlder = data.some((match) => matchDate(match) < date);
    if (reachedOlder || data.length < HENRIK_PAGE_SIZE || results.after === 0) {
      break;
    }
  }
  return found;
}

export interface DaySync {
  /** Partidas de ranked nuevas, que aún no estaban en la app. */
  newSessions: RankedSession[];
  /** Customs nuevas, para el registro de scrims y 10mans. */
  newScrims: ScrimMatch[];
  /** Rankeds que HenrikDev tiene de ese día, nuevas o no. */
  rankedsFound: number;
  customsFound: number;
  /** Cifras del día con todas sus partidas de ranked, ya incluidas las nuevas. */
  totals: RankedTotals;
}

/**
 * Trae las partidas de un día. No duplica: una ranked ya guardada (por su id
 * de HenrikDev) o una custom ya importada se dejan como están, con lo que el
 * usuario haya corregido a mano.
 */
export async function syncDay(
  http: HttpClient,
  config: HenrikConfig,
  date: string,
  existing: {
    sessions: readonly RankedSession[];
    scrims: readonly ScrimMatch[];
  },
  newId: () => string,
): Promise<DaySync> {
  const ranked = await fetchDayMatches(http, config, "competitive", date);
  const customs = (await fetchDayMatches(http, config, "custom", date)).filter(
    (match) => !isSkirmish(match),
  );

  const knownMatches = new Set(
    existing.sessions.map((session) => session.externalMatchId),
  );
  const knownScrims = new Set(existing.scrims.map((scrim) => scrim.id));

  // De la más antigua a la más reciente, como se jugaron.
  const newSessions = ranked
    .filter((match) => !knownMatches.has(match.meta.id))
    .reverse()
    .map((match) => toRankedSession(match, newId()));
  const newScrims = customs
    .filter((match) => !knownScrims.has(scrimIdFor(match)))
    .reverse()
    .map(toScrimMatch);

  return {
    newSessions,
    newScrims,
    rankedsFound: ranked.length,
    customsFound: customs.length,
    totals: rankedTotals([
      ...existing.sessions.filter((session) => session.date === date),
      ...newSessions,
    ]),
  };
}
