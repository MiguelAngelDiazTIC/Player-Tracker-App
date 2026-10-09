import type { Config } from "./env";

export type Fetcher = (
  input: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  },
) => Promise<Response>;

const AUTH_URL = "https://auth.riotgames.com";
/** Las cuentas se piden a un clúster regional; cualquiera vale. */
const ACCOUNT_URL = "https://europe.api.riotgames.com";

/** Regiones de VALORANT en las que hay partidas (`activeShard`). */
export const SHARDS = ["ap", "br", "eu", "kr", "latam", "na"] as const;
export type Shard = (typeof SHARDS)[number];

export function isShard(value: unknown): value is Shard {
  return (SHARDS as readonly unknown[]).includes(value);
}

export type RiotErrorKind =
  /** La sesión del jugador ya no vale: tiene que volver a conectar. */
  | "auth"
  | "rate_limit"
  | "not_found"
  /** Riot ha fallado o ha respondido algo que no se entiende. */
  | "riot";

export class RiotError extends Error {
  readonly kind: RiotErrorKind;
  readonly retryAfterSeconds: number | null;

  constructor(
    kind: RiotErrorKind,
    message: string,
    retryAfterSeconds: number | null = null,
  ) {
    super(message);
    this.name = "RiotError";
    this.kind = kind;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function retryAfter(response: Response): number | null {
  const seconds = Number(response.headers.get("Retry-After"));
  return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : null;
}

async function readJson(response: Response, what: string): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new RiotError("riot", `Riot no ha devuelto JSON al pedir ${what}.`);
  }
}

async function request(
  fetcher: Fetcher,
  url: string,
  init: Parameters<Fetcher>[1],
  what: string,
): Promise<Response> {
  let response: Response;
  try {
    response = await fetcher(url, init);
  } catch {
    throw new RiotError(
      "riot",
      `No se pudo conectar con Riot al pedir ${what}.`,
    );
  }
  if (response.status === 429) {
    throw new RiotError(
      "rate_limit",
      "Riot pide esperar antes de volver a preguntar.",
      retryAfter(response),
    );
  }
  return response;
}

export interface Tokens {
  accessToken: string;
  /** `null` si Riot no ha dado uno nuevo: sigue valiendo el anterior. */
  refreshToken: string | null;
}

/** Cambia un código o un token de refresco por tokens, con el secreto. */
async function requestTokens(
  fetcher: Fetcher,
  config: Config,
  grant: Record<string, string>,
): Promise<Tokens> {
  const response = await request(
    fetcher,
    `${AUTH_URL}/token`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${config.clientId}:${config.clientSecret}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(grant).toString(),
    },
    "los tokens",
  );
  // 400 y 401: código caducado o token de refresco revocado o gastado.
  if (response.status === 400 || response.status === 401) {
    throw new RiotError("auth", "Riot no acepta esta sesión.");
  }
  if (!response.ok) {
    throw new RiotError("riot", `Riot ha respondido ${response.status}.`);
  }
  const body = await readJson(response, "los tokens");
  const tokens = body as { access_token?: unknown; refresh_token?: unknown };
  if (typeof tokens.access_token !== "string" || tokens.access_token === "") {
    throw new RiotError("riot", "Riot no ha devuelto un token de acceso.");
  }
  return {
    accessToken: tokens.access_token,
    refreshToken:
      typeof tokens.refresh_token === "string" && tokens.refresh_token !== ""
        ? tokens.refresh_token
        : null,
  };
}

/** URL de la página de inicio de sesión de Riot. */
export function authorizeUrl(
  config: Config,
  redirectUri: string,
  state: string,
): string {
  const query = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid offline_access",
    state,
  });
  return `${AUTH_URL}/authorize?${query.toString()}`;
}

export const exchangeCode = (
  fetcher: Fetcher,
  config: Config,
  code: string,
  redirectUri: string,
) =>
  requestTokens(fetcher, config, {
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  });

export const refreshTokens = (
  fetcher: Fetcher,
  config: Config,
  refreshToken: string,
) =>
  requestTokens(fetcher, config, {
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

async function getJson(
  fetcher: Fetcher,
  url: string,
  headers: Record<string, string>,
  what: string,
): Promise<unknown> {
  const response = await request(fetcher, url, { headers }, what);
  if (response.status === 401 || response.status === 403) {
    // Con el token del jugador es su sesión; con la clave, es cosa del servidor.
    throw "Authorization" in headers
      ? new RiotError("auth", "Riot no acepta esta sesión.")
      : new RiotError("riot", `Riot rechaza la clave al pedir ${what}.`);
  }
  if (response.status === 404) {
    throw new RiotError("not_found", `Riot no encuentra ${what}.`);
  }
  if (!response.ok) {
    throw new RiotError(
      "riot",
      `Riot ha respondido ${response.status} al pedir ${what}.`,
    );
  }
  return readJson(response, what);
}

export interface Account {
  puuid: string;
  gameName: string;
  tagLine: string;
}

/** La cuenta de quien ha iniciado sesión: de aquí sale el único `puuid` que se lee. */
export async function fetchAccount(
  fetcher: Fetcher,
  accessToken: string,
): Promise<Account> {
  const body = (await getJson(
    fetcher,
    `${ACCOUNT_URL}/riot/account/v1/accounts/me`,
    { Authorization: `Bearer ${accessToken}` },
    "la cuenta",
  )) as Partial<Record<keyof Account, unknown>>;
  if (typeof body.puuid !== "string" || body.puuid === "") {
    throw new RiotError("riot", "Riot no ha devuelto la cuenta.");
  }
  return {
    puuid: body.puuid,
    gameName: typeof body.gameName === "string" ? body.gameName : "",
    tagLine: typeof body.tagLine === "string" ? body.tagLine : "",
  };
}

/** Región en la que juega la cuenta; `null` si nunca ha jugado a VALORANT. */
export async function fetchActiveShard(
  fetcher: Fetcher,
  config: Config,
  puuid: string,
): Promise<Shard | null> {
  try {
    const body = (await getJson(
      fetcher,
      `${ACCOUNT_URL}/riot/account/v1/active-shards/by-game/val/by-puuid/${encodeURIComponent(puuid)}`,
      { "X-Riot-Token": config.apiKey },
      "la región de la cuenta",
    )) as { activeShard?: unknown };
    return isShard(body.activeShard) ? body.activeShard : null;
  } catch (cause) {
    if (cause instanceof RiotError && cause.kind === "not_found") return null;
    throw cause;
  }
}

const gameUrl = (shard: Shard, path: string) =>
  `https://${shard}.api.riotgames.com${path}`;

export const fetchMatchlist = (
  fetcher: Fetcher,
  config: Config,
  shard: Shard,
  puuid: string,
) =>
  getJson(
    fetcher,
    gameUrl(
      shard,
      `/val/match/v1/matchlists/by-puuid/${encodeURIComponent(puuid)}`,
    ),
    { "X-Riot-Token": config.apiKey },
    "la lista de partidas",
  );

export const fetchMatch = (
  fetcher: Fetcher,
  config: Config,
  shard: Shard,
  matchId: string,
) =>
  getJson(
    fetcher,
    gameUrl(shard, `/val/match/v1/matches/${encodeURIComponent(matchId)}`),
    { "X-Riot-Token": config.apiKey },
    "una partida",
  );

export const fetchContent = (
  fetcher: Fetcher,
  config: Config,
  shard: Shard,
  locale: string,
) =>
  getJson(
    fetcher,
    gameUrl(shard, `/val/content/v1/contents?locale=${locale}`),
    { "X-Riot-Token": config.apiKey },
    "los nombres de agentes y mapas",
  );
