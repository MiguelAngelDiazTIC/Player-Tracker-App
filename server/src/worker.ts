import type { RiotMatch, RiotQueue } from "../../src/domain/riotMatches";
import { readConfig, type Config, type Env } from "./env";
import {
  reduceContent,
  reduceHistory,
  reduceMatch,
  type ContentNames,
  type HistoryEntry,
} from "./reduce";
import {
  authorizeUrl,
  exchangeCode,
  fetchAccount,
  fetchActiveShard,
  fetchContent,
  fetchMatch,
  fetchMatchlist,
  isShard,
  refreshTokens,
  RiotError,
  type Fetcher,
  type Shard,
} from "./riot";

/** Colas que se pueden pedir; las mismas que conoce la app. */
const QUEUES = [
  "competitive",
  "premier",
  "unrated",
  "swiftplay",
] as const satisfies readonly RiotQueue[];

/** Lo que dura en KV un inicio de sesión que la app aún no ha recogido. */
const LOGIN_TTL_SECONDS = 300;
/** Los nombres de agentes y mapas cambian con cada parche, no cada día. */
const CONTENT_TTL_SECONDS = 86_400;
const CONTENT_LOCALE = "es-ES";
/** Un día local dura como mucho 25 horas; se deja margen. */
const MAX_WINDOW_MILLIS = 48 * 60 * 60 * 1000;
/** Tope de partidas por petición, para no pasar de los límites del Worker. */
const MAX_MATCHES = 30;
const MAX_KNOWN = 500;
const MAX_BODY_CHARS = 32_000;
/** Partidas que se piden a Riot a la vez. */
const PARALLEL = 5;

/** `state` de RSO: el SHA-256 en base64url del secreto que guarda la app. */
const CHALLENGE = /^[A-Za-z0-9_-]{43}$/;
const VERIFIER = /^[A-Za-z0-9._~-]{43,128}$/;

type ErrorCode =
  | "bad_request"
  | "not_found"
  | "not_configured"
  | "auth"
  | "rate_limit"
  | "riot";

const STATUS: Record<ErrorCode, number> = {
  bad_request: 400,
  not_found: 404,
  not_configured: 503,
  auth: 401,
  rate_limit: 429,
  riot: 502,
};

function json(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...headers,
    },
  });
}

function fail(
  error: ErrorCode,
  message: string,
  retryAfterSeconds: number | null = null,
): Response {
  return json(
    { error, message, retryAfterSeconds },
    STATUS[error],
    retryAfterSeconds === null
      ? {}
      : { "Retry-After": String(retryAfterSeconds) },
  );
}

function failFrom(cause: unknown): Response {
  if (cause instanceof RiotError) {
    return cause.kind === "not_found"
      ? fail("riot", cause.message)
      : fail(cause.kind, cause.message, cause.retryAfterSeconds);
  }
  // Sin detalles: el mensaje de un fallo inesperado podría llevar datos.
  return fail("riot", "El servidor ha fallado al hablar con Riot.");
}

function page(title: string, text: string, status = 200): Response {
  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${title} · MikaLog</title>
<style>
body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,sans-serif;background:#f4f1fb;color:#141414}
main{max-width:28rem;margin:1rem;padding:2rem;border-radius:1rem;background:#fff;box-shadow:0 8px 32px #3a344e22}
h1{margin:0 0 .5rem;font-size:1.5rem}
p{margin:.5rem 0;line-height:1.5}
small{color:#3a344e}
</style>
</head>
<body>
<main>
<h1>${title}</h1>
<p>${text}</p>
<p><small>MikaLog no está avalado por Riot Games ni refleja sus opiniones. MikaLog isn't endorsed by Riot Games.</small></p>
</main>
</body>
</html>`;
  return new Response(html, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}

const loginKey = (challenge: string) => `login:${challenge}`;

/** Lo que la app recoge tras iniciar sesión. */
type LoginResult =
  | {
      status: "ready";
      account: { gameName: string; tagLine: string; shard: Shard };
      refreshToken: string;
    }
  | { status: "error"; error: "denied" | "no_valorant" | "failed" };

async function sha256Base64Url(text: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  const text = await request.text();
  if (text.length > MAX_BODY_CHARS) return {};
  try {
    const body: unknown = JSON.parse(text);
    return typeof body === "object" && body !== null && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

interface Context {
  env: Env;
  config: Config;
  fetcher: Fetcher;
  /** Origen público del servidor, de donde sale la URL de vuelta de RSO. */
  origin: string;
}

const redirectUri = (context: Context) => `${context.origin}/rso/callback`;

/** Paso 1: manda al navegador a la página de inicio de sesión de Riot. */
function login(url: URL, context: Context): Response {
  const challenge = url.searchParams.get("challenge") ?? "";
  if (!CHALLENGE.test(challenge)) {
    return page(
      "Enlace no válido",
      "Vuelve a MikaLog y pulsa «Conectar con Riot» otra vez.",
      400,
    );
  }
  return new Response(null, {
    status: 302,
    headers: {
      Location: authorizeUrl(context.config, redirectUri(context), challenge),
      "Cache-Control": "no-store",
    },
  });
}

/** Paso 2: Riot vuelve con el código; se guarda el resultado unos minutos. */
async function callback(url: URL, context: Context): Promise<Response> {
  const challenge = url.searchParams.get("state") ?? "";
  if (!CHALLENGE.test(challenge)) {
    return page(
      "Enlace no válido",
      "Vuelve a MikaLog y pulsa «Conectar con Riot» otra vez.",
      400,
    );
  }
  const store = (result: LoginResult) =>
    context.env.KV.put(loginKey(challenge), JSON.stringify(result), {
      expirationTtl: LOGIN_TTL_SECONDS,
    });

  const code = url.searchParams.get("code");
  if (!code) {
    await store({ status: "error", error: "denied" });
    return page(
      "No se ha conectado",
      "No has dado permiso, así que MikaLog no leerá tus partidas. Puedes cerrar esta pestaña.",
    );
  }

  try {
    const tokens = await exchangeCode(
      context.fetcher,
      context.config,
      code,
      redirectUri(context),
    );
    if (tokens.refreshToken === null) {
      throw new RiotError("riot", "Riot no ha dado un token de refresco.");
    }
    const account = await fetchAccount(context.fetcher, tokens.accessToken);
    const shard = await fetchActiveShard(
      context.fetcher,
      context.config,
      account.puuid,
    );
    if (shard === null) {
      await store({ status: "error", error: "no_valorant" });
      return page(
        "Cuenta sin partidas",
        "Esta cuenta de Riot no tiene partidas de VALORANT. Puedes cerrar esta pestaña.",
      );
    }
    await store({
      status: "ready",
      account: { gameName: account.gameName, tagLine: account.tagLine, shard },
      refreshToken: tokens.refreshToken,
    });
    return page(
      "Cuenta conectada",
      "Ya puedes volver a MikaLog y cerrar esta pestaña. You can go back to MikaLog now.",
    );
  } catch {
    await store({ status: "error", error: "failed" });
    return page(
      "No se ha podido conectar",
      "Riot no ha completado el inicio de sesión. Vuelve a MikaLog e inténtalo de nuevo.",
      502,
    );
  }
}

/** Paso 3: la app recoge el resultado con su secreto, una sola vez. */
async function result(request: Request, context: Context): Promise<Response> {
  const { verifier } = await readBody(request);
  if (typeof verifier !== "string" || !VERIFIER.test(verifier)) {
    return fail("bad_request", "Falta el código de la app.");
  }
  const key = loginKey(await sha256Base64Url(verifier));
  const stored = await context.env.KV.get(key);
  if (stored === null) return json({ status: "pending" });
  await context.env.KV.delete(key);
  return json(JSON.parse(stored) as LoginResult);
}

async function contentNames(
  context: Context,
  shard: Shard,
): Promise<ContentNames> {
  const key = `content:${CONTENT_LOCALE}`;
  const cached = await context.env.KV.get(key);
  if (cached !== null) return JSON.parse(cached) as ContentNames;
  const names = reduceContent(
    await fetchContent(context.fetcher, context.config, shard, CONTENT_LOCALE),
  );
  await context.env.KV.put(key, JSON.stringify(names), {
    expirationTtl: CONTENT_TTL_SECONDS,
  });
  return names;
}

interface SyncRequest {
  refreshToken: string;
  shard: Shard;
  from: number;
  to: number;
  queues: string[];
  known: Set<string>;
}

const isMillis = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

const strings = (value: unknown): string[] | null =>
  Array.isArray(value) && value.every((item) => typeof item === "string")
    ? (value as string[])
    : null;

function readSync(body: Record<string, unknown>): SyncRequest | string {
  const { refreshToken, shard, from, to } = body;
  if (typeof refreshToken !== "string" || refreshToken === "") {
    return "Falta la sesión de Riot.";
  }
  if (!isShard(shard)) return "Región no válida.";
  if (!isMillis(from) || !isMillis(to) || to <= from) {
    return "El intervalo de fechas no es válido.";
  }
  if (to - from > MAX_WINDOW_MILLIS) {
    return "El intervalo es demasiado largo: pide un día cada vez.";
  }
  const queues =
    body.queues === undefined ? ["competitive"] : strings(body.queues);
  if (
    queues === null ||
    queues.length === 0 ||
    queues.some((queue) => !(QUEUES as readonly string[]).includes(queue))
  ) {
    return "Colas no válidas.";
  }
  const known = body.known === undefined ? [] : strings(body.known);
  if (known === null || known.length > MAX_KNOWN) {
    return "La lista de partidas ya guardadas no es válida.";
  }
  return { refreshToken, shard, from, to, queues, known: new Set(known) };
}

/**
 * Partidas de quien pregunta en un intervalo. El `puuid` sale siempre de su
 * propia sesión de Riot, así que nadie puede pedir las partidas de otro.
 */
async function sync(request: Request, context: Context): Promise<Response> {
  const input = readSync(await readBody(request));
  if (typeof input === "string") return fail("bad_request", input);
  const { fetcher, config } = context;

  try {
    const tokens = await refreshTokens(fetcher, config, input.refreshToken);
    const account = await fetchAccount(fetcher, tokens.accessToken);

    let history: HistoryEntry[];
    try {
      history = reduceHistory(
        await fetchMatchlist(fetcher, config, input.shard, account.puuid),
      );
    } catch (cause) {
      // Sin historial en esa región no hay nada que traer.
      if (!(cause instanceof RiotError) || cause.kind !== "not_found") {
        throw cause;
      }
      history = [];
    }

    const wanted = history
      .filter(
        (entry) =>
          entry.startedAtMillis >= input.from &&
          entry.startedAtMillis < input.to &&
          input.queues.includes(entry.queueId) &&
          !input.known.has(entry.matchId),
      )
      .sort((a, b) => a.startedAtMillis - b.startedAtMillis);
    const batch = wanted.slice(0, MAX_MATCHES);

    const matches: RiotMatch[] = [];
    if (batch.length > 0) {
      const names = await contentNames(context, input.shard);
      for (let start = 0; start < batch.length; start += PARALLEL) {
        const raw = await Promise.all(
          batch
            .slice(start, start + PARALLEL)
            .map((entry) =>
              fetchMatch(fetcher, config, input.shard, entry.matchId),
            ),
        );
        for (const item of raw) {
          const match = reduceMatch(item, account.puuid, names);
          if (match) matches.push(match);
        }
      }
    }

    return json({
      matches,
      /** `true` si quedan partidas del intervalo: basta con volver a pedir. */
      truncated: wanted.length > batch.length,
      /** Token nuevo si Riot lo ha cambiado; la app sustituye el suyo. */
      refreshToken: tokens.refreshToken,
    });
  } catch (cause) {
    return failFrom(cause);
  }
}

/** El servidor entero: recibe la petición y con qué hablar con Riot. */
export async function handle(
  request: Request,
  env: Env,
  fetcher: Fetcher,
): Promise<Response> {
  const url = new URL(request.url);
  const route = `${request.method} ${url.pathname}`;
  const config = readConfig(env);

  if (route === "GET /") {
    return json({ name: "mikalog-sync", configured: config !== null });
  }

  const routes: Record<
    string,
    (context: Context) => Response | Promise<Response>
  > = {
    "GET /rso/login": (context) => login(url, context),
    "GET /rso/callback": (context) => callback(url, context),
    "POST /rso/result": (context) => result(request, context),
    "POST /sync": (context) => sync(request, context),
  };
  const run = routes[route];
  if (!run) return fail("not_found", "No existe esa ruta.");
  if (config === null) {
    return fail(
      "not_configured",
      "La sincronización con Riot aún no está disponible.",
    );
  }
  return run({ env, config, fetcher, origin: url.origin });
}
