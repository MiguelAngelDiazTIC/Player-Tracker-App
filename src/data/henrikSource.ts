import {
  accountSchema,
  accountUrl,
  HENRIK_PAGE_SIZE,
  storedMatchesSchema,
  storedMatchesUrl,
  toRiotMatch,
  type HenrikConfig,
} from "../domain/henrikMatches";
import {
  riotMatchDate,
  type MatchSource,
  type RiotMatch,
  type RiotQueue,
} from "../domain/riotMatches";

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

/** Tope de páginas por si el periodo pedido queda muy atrás en el historial. */
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
        "Clave no válida: HenrikDev no la acepta. Vuelve a copiarla desde Discord y pégala en Ajustes.",
      );
    case 404:
      throw new SyncError(
        "not-found",
        `HenrikDev no encuentra la cuenta ${config.name}#${config.tag} en esa región. Revisa el Riot ID y la región en Ajustes.`,
      );
    case 429:
      throw new SyncError(
        "rate-limit",
        response.retryAfterSeconds === null
          ? "Demasiadas peticiones: la clave tiene un límite por minuto. Espera un minuto y vuelve a pulsar."
          : `Demasiadas peticiones: la clave tiene un límite por minuto. Vuelve a pulsar dentro de ${response.retryAfterSeconds} segundos.`,
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
 * Partidas de una cola entre dos días. El historial llega de la más reciente
 * a la más antigua, así que se pasan páginas hasta dejar atrás el primer día.
 */
async function fetchQueue(
  http: HttpClient,
  config: HenrikConfig,
  queue: RiotQueue,
  from: string,
  to: string,
): Promise<RiotMatch[]> {
  const found: RiotMatch[] = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const body = await request(
      http,
      config,
      storedMatchesUrl(config, queue, page),
    );
    const parsed = storedMatchesSchema.safeParse(body);
    if (!parsed.success) {
      throw new SyncError(
        "format",
        "La respuesta de HenrikDev no es la esperada.",
      );
    }

    const { data, results } = parsed.data;
    const matches = data.flatMap((item) => toRiotMatch(item, queue) ?? []);
    found.push(
      ...matches.filter((match) => {
        const date = riotMatchDate(match);
        return date >= from && date <= to;
      }),
    );
    const reachedOlder = matches.some((match) => riotMatchDate(match) < from);
    if (reachedOlder || data.length < HENRIK_PAGE_SIZE || results.after === 0) {
      break;
    }
  }
  return found;
}

/** HenrikDev como fuente de partidas: una petición (o varias páginas) por cola. */
export function createHenrikSource(
  http: HttpClient,
  config: HenrikConfig,
): MatchSource {
  return {
    source: "henrikdev",
    async fetchDays(from, to, queues) {
      const matches: RiotMatch[] = [];
      for (const queue of queues) {
        matches.push(...(await fetchQueue(http, config, queue, from, to)));
      }
      return matches;
    },
  };
}
