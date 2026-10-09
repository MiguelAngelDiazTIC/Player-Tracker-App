// @vitest-environment node
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { riotMatchesSchema } from "../../src/domain/riotMatches";
import type { Env, KeyValueStore } from "./env";
import type { Fetcher } from "./riot";
import { handle } from "./worker";

const ORIGIN = "https://mikalog-sync.example.workers.dev";
const PUUID = "puuid-saiz";
const JETT = "ADD6443A-41BD-E414-F6AD-E58D267F4E95";
const RAZE = "f94c3b30-42be-e959-889c-5aa313dba261";

/** KV en memoria que recuerda con qué caducidad se guardó cada clave. */
function memoryKv() {
  const values = new Map<string, string>();
  const ttls = new Map<string, number | undefined>();
  const kv: KeyValueStore = {
    async get(key) {
      return values.get(key) ?? null;
    },
    async put(key, value, options) {
      values.set(key, value);
      ttls.set(key, options?.expirationTtl);
    },
    async delete(key) {
      values.delete(key);
    },
  };
  return { kv, values, ttls };
}

function riotMatch(
  matchId: string,
  change: {
    queueId?: string;
    start?: number;
    characterId?: string;
    mapId?: string;
    won?: boolean | null;
    completed?: boolean;
    withPlayer?: boolean;
  } = {},
) {
  const won = change.won === undefined ? true : change.won;
  return {
    matchInfo: {
      matchId,
      mapId: change.mapId ?? "/Game/Maps/Ascent/Ascent",
      gameStartMillis: change.start ?? 1_000,
      queueId: change.queueId ?? "competitive",
      isCompleted: change.completed ?? true,
    },
    players: [
      {
        puuid: "otro-jugador",
        teamId: "Blue",
        characterId: RAZE,
        stats: { score: 9999, roundsPlayed: 20, kills: 40, deaths: 1 },
      },
      ...(change.withPlayer === false
        ? []
        : [
            {
              puuid: PUUID,
              gameName: "Saiz",
              tagLine: "EUW",
              teamId: "Red",
              characterId: change.characterId ?? JETT,
              stats: {
                score: 5000,
                roundsPlayed: 20,
                kills: 20,
                deaths: 10,
                assists: 4,
              },
            },
          ]),
    ],
    teams: [
      { teamId: "Red", won: won === true, roundsWon: 13 },
      { teamId: "Blue", won: won === false, roundsWon: 7 },
    ],
  };
}

interface FakeRiot {
  /** Token de refresco que Riot acepta. */
  refreshToken: string;
  /** Token de refresco nuevo que devuelve al renovar, si rota. */
  rotatedTo: string | null;
  history: { matchId: string; gameStartTimeMillis: number; queueId: string }[];
  matches: Record<string, unknown>;
  shard: string | null;
  /** Respuestas forzadas por ruta, para simular fallos. */
  force: Record<string, Response>;
}

function fakeRiot(change: Partial<FakeRiot> = {}) {
  const riot: FakeRiot = {
    refreshToken: "refresco-1",
    rotatedTo: null,
    history: [],
    matches: {},
    shard: "eu",
    force: {},
    ...change,
  };
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const reply = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status });

  const fetcher: Fetcher = async (input, init = {}) => {
    const url = new URL(input);
    const headers = init.headers ?? {};
    calls.push({ url: input, headers });
    const forced = riot.force[url.pathname];
    if (forced) return forced.clone();

    if (url.host === "auth.riotgames.com" && url.pathname === "/token") {
      if (headers.Authorization !== `Basic ${btoa("cliente:secreto")}`) {
        return reply({ error: "invalid_client" }, 401);
      }
      const form = new URLSearchParams(init.body);
      const valid =
        form.get("grant_type") === "authorization_code"
          ? form.get("code") === "codigo-bueno" &&
            form.get("redirect_uri") === `${ORIGIN}/rso/callback`
          : form.get("refresh_token") === riot.refreshToken;
      if (!valid) return reply({ error: "invalid_grant" }, 400);
      return reply({
        access_token: "acceso",
        refresh_token:
          form.get("grant_type") === "authorization_code"
            ? riot.refreshToken
            : (riot.rotatedTo ?? undefined),
      });
    }

    if (url.pathname === "/riot/account/v1/accounts/me") {
      if (headers.Authorization !== "Bearer acceso") return reply({}, 401);
      return reply({ puuid: PUUID, gameName: "Saiz", tagLine: "EUW" });
    }

    // Todo lo demás va con la clave del servidor.
    if (headers["X-Riot-Token"] !== "clave") return reply({}, 403);

    if (url.pathname.startsWith("/riot/account/v1/active-shards/")) {
      return riot.shard === null
        ? reply({}, 404)
        : reply({ puuid: PUUID, game: "val", activeShard: riot.shard });
    }
    if (url.pathname === `/val/match/v1/matchlists/by-puuid/${PUUID}`) {
      return reply({ puuid: PUUID, history: riot.history });
    }
    if (url.pathname.startsWith("/val/match/v1/matches/")) {
      const match = riot.matches[url.pathname.split("/").pop() ?? ""];
      return match ? reply(match) : reply({}, 404);
    }
    if (url.pathname === "/val/content/v1/contents") {
      return reply({
        characters: [
          { id: JETT, name: "Jett" },
          { id: RAZE.toUpperCase(), name: "Raze" },
        ],
        maps: [
          { id: "m1", name: "Ascent", assetPath: "/Game/Maps/Ascent/Ascent" },
          { id: "m2", name: "Bind", assetPath: "/Game/Maps/Duality/Duality" },
        ],
      });
    }
    return reply({}, 404);
  };
  return { riot, fetcher, calls };
}

function setup(change: Partial<FakeRiot> = {}, configured = true) {
  const store = memoryKv();
  const fake = fakeRiot(change);
  const env: Env = {
    KV: store.kv,
    ...(configured
      ? {
          RIOT_API_KEY: "clave",
          RSO_CLIENT_ID: "cliente",
          RSO_CLIENT_SECRET: "secreto",
        }
      : {}),
  };
  const get = (path: string) =>
    handle(new Request(`${ORIGIN}${path}`), env, fake.fetcher);
  const post = (path: string, body: unknown) =>
    handle(
      new Request(`${ORIGIN}${path}`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
      env,
      fake.fetcher,
    );
  return { ...store, ...fake, env, get, post };
}

const VERIFIER = "v".repeat(43);
const CHALLENGE = createHash("sha256").update(VERIFIER).digest("base64url");

/** Dos partidas el día pedido, una fuera y una de otra cola. */
function playedDay(): Partial<FakeRiot> {
  return {
    history: [
      { matchId: "m3", gameStartTimeMillis: 3_000, queueId: "competitive" },
      { matchId: "m2", gameStartTimeMillis: 2_000, queueId: "competitive" },
      { matchId: "m1", gameStartTimeMillis: 1_000, queueId: "competitive" },
      { matchId: "u1", gameStartTimeMillis: 1_500, queueId: "unrated" },
      { matchId: "viejo", gameStartTimeMillis: 10, queueId: "competitive" },
    ],
    matches: {
      m1: riotMatch("m1", { start: 1_000 }),
      m2: riotMatch("m2", {
        start: 2_000,
        won: false,
        characterId: RAZE,
        mapId: "/Game/Maps/Duality/Duality",
      }),
      m3: riotMatch("m3", { start: 3_000, won: null }),
      u1: riotMatch("u1", { start: 1_500, queueId: "unrated" }),
      viejo: riotMatch("viejo", { start: 10 }),
    },
  };
}

const syncBody = (change: Record<string, unknown> = {}) => ({
  refreshToken: "refresco-1",
  shard: "eu",
  from: 1_000,
  to: 5_000,
  ...change,
});

describe("estado del servidor", () => {
  it("dice si está configurado, sin dar nada más", async () => {
    const response = await setup().get("/");
    expect(await response.json()).toEqual({
      name: "mikalog-sync",
      configured: true,
    });
    expect(await (await setup({}, false).get("/")).json()).toMatchObject({
      configured: false,
    });
  });

  it("sin los secretos responde 503 y no llama a Riot", async () => {
    const server = setup({}, false);

    for (const response of [
      await server.get(`/rso/login?challenge=${CHALLENGE}`),
      await server.post("/rso/result", { verifier: VERIFIER }),
      await server.post("/sync", syncBody()),
    ]) {
      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({ error: "not_configured" });
    }
    expect(server.calls).toEqual([]);
  });

  it("no conoce otras rutas", async () => {
    const server = setup();
    expect((await server.get("/otra")).status).toBe(404);
    expect((await server.get("/sync")).status).toBe(404);
  });
});

describe("inicio de sesión", () => {
  it("manda al navegador a Riot con el reto de la app como state", async () => {
    const response = await setup().get(`/rso/login?challenge=${CHALLENGE}`);

    expect(response.status).toBe(302);
    const target = new URL(response.headers.get("Location") ?? "");
    expect(target.origin + target.pathname).toBe(
      "https://auth.riotgames.com/authorize",
    );
    expect(Object.fromEntries(target.searchParams)).toEqual({
      client_id: "cliente",
      redirect_uri: `${ORIGIN}/rso/callback`,
      response_type: "code",
      scope: "openid offline_access",
      state: CHALLENGE,
    });
  });

  it("rechaza un reto con otra forma", async () => {
    const server = setup();
    expect((await server.get("/rso/login?challenge=corto")).status).toBe(400);
    expect((await server.get("/rso/login")).status).toBe(400);
  });

  it("guarda la cuenta cinco minutos y la entrega una sola vez", async () => {
    const server = setup();

    expect(
      await (await server.post("/rso/result", { verifier: VERIFIER })).json(),
    ).toEqual({ status: "pending" });

    const page = await server.get(
      `/rso/callback?code=codigo-bueno&state=${CHALLENGE}`,
    );
    expect(page.status).toBe(200);
    expect(await page.text()).toContain("Ya puedes volver a MikaLog");
    expect(server.ttls.get(`login:${CHALLENGE}`)).toBe(300);

    const collected = await server.post("/rso/result", { verifier: VERIFIER });
    expect(await collected.json()).toEqual({
      status: "ready",
      account: { gameName: "Saiz", tagLine: "EUW", shard: "eu" },
      refreshToken: "refresco-1",
    });
    expect(collected.headers.get("Cache-Control")).toBe("no-store");

    // Recogido: ya no queda nada en el servidor.
    expect(server.values.size).toBe(0);
    expect(
      await (await server.post("/rso/result", { verifier: VERIFIER })).json(),
    ).toEqual({ status: "pending" });
  });

  it("solo entrega el resultado a quien tiene el secreto del reto", async () => {
    const server = setup();
    await server.get(`/rso/callback?code=codigo-bueno&state=${CHALLENGE}`);

    // El reto viaja por el navegador; con él no basta.
    expect(
      await (await server.post("/rso/result", { verifier: CHALLENGE })).json(),
    ).toEqual({ status: "pending" });
    expect(
      await (
        await server.post("/rso/result", { verifier: "x".repeat(43) })
      ).json(),
    ).toEqual({ status: "pending" });
    expect(server.values.has(`login:${CHALLENGE}`)).toBe(true);
    expect((await server.post("/rso/result", {})).status).toBe(400);
  });

  it("avisa a la app si el jugador no da permiso", async () => {
    const server = setup();

    const page = await server.get(
      `/rso/callback?error=access_denied&state=${CHALLENGE}`,
    );
    expect(await page.text()).toContain("No has dado permiso");
    expect(
      await (await server.post("/rso/result", { verifier: VERIFIER })).json(),
    ).toEqual({ status: "error", error: "denied" });
  });

  it("avisa si Riot no acepta el código o la cuenta no juega a VALORANT", async () => {
    const failed = setup();
    const page = await failed.get(
      `/rso/callback?code=codigo-malo&state=${CHALLENGE}`,
    );
    expect(page.status).toBe(502);
    expect(
      await (await failed.post("/rso/result", { verifier: VERIFIER })).json(),
    ).toEqual({ status: "error", error: "failed" });

    const empty = setup({ shard: null });
    await empty.get(`/rso/callback?code=codigo-bueno&state=${CHALLENGE}`);
    expect(
      await (await empty.post("/rso/result", { verifier: VERIFIER })).json(),
    ).toEqual({ status: "error", error: "no_valorant" });
  });
});

describe("sincronizar", () => {
  it("devuelve las partidas del intervalo con el formato de la app", async () => {
    const server = setup(playedDay());

    const response = await server.post("/sync", syncBody());
    expect(response.status).toBe(200);
    const body = (await response.json()) as { matches: unknown };

    expect(body).toEqual({
      matches: [
        {
          matchId: "m1",
          queueId: "competitive",
          startedAtMillis: 1_000,
          map: "Ascent",
          agent: "Jett",
          result: "win",
          kills: 20,
          deaths: 10,
          score: 5000,
          rounds: 20,
        },
        expect.objectContaining({
          matchId: "m2",
          map: "Bind",
          agent: "Raze",
          result: "loss",
        }),
        expect.objectContaining({ matchId: "m3", result: "draw" }),
      ],
      truncated: false,
      refreshToken: null,
    });
    expect(riotMatchesSchema.safeParse(body.matches).success).toBe(true);
  });

  it("solo lee al jugador de la sesión, en su región y con la clave", async () => {
    const server = setup(playedDay());
    await server.post("/sync", syncBody());

    const game = server.calls.filter((call) => call.url.includes("/val/"));
    expect(game.every((call) => call.url.startsWith("https://eu.api."))).toBe(
      true,
    );
    expect(game.every((call) => call.headers["X-Riot-Token"] === "clave")).toBe(
      true,
    );
    expect(
      game.filter((call) => call.url.includes("/matchlists/")),
    ).toHaveLength(1);
    expect(game.find((call) => call.url.includes("/matchlists/"))?.url).toBe(
      `https://eu.api.riotgames.com/val/match/v1/matchlists/by-puuid/${PUUID}`,
    );
    // Ni la partida vieja ni la de otra cola se piden a Riot.
    expect(
      game
        .filter((call) => call.url.includes("/matches/"))
        .map((call) => call.url.split("/").pop())
        .sort(),
    ).toEqual(["m1", "m2", "m3"]);
  });

  it("no guarda nada del jugador: en KV solo quedan los nombres del juego", async () => {
    const server = setup(playedDay());
    await server.post("/sync", syncBody());

    expect([...server.values.keys()]).toEqual(["content:es-ES"]);
    expect(server.ttls.get("content:es-ES")).toBe(86_400);
    expect(server.values.get("content:es-ES")).not.toContain(PUUID);

    // La segunda vez los nombres salen de la caché.
    server.calls.length = 0;
    await server.post("/sync", syncBody());
    expect(server.calls.some((call) => call.url.includes("/content/"))).toBe(
      false,
    );
  });

  it("trae otras colas si se piden y se salta las partidas ya guardadas", async () => {
    const server = setup(playedDay());

    const body = (await (
      await server.post(
        "/sync",
        syncBody({ queues: ["competitive", "unrated"], known: ["m1", "m3"] }),
      )
    ).json()) as { matches: { matchId: string }[] };

    expect(body.matches.map((match) => match.matchId)).toEqual(["u1", "m2"]);
  });

  it("sin partidas nuevas no pide ni los nombres", async () => {
    const server = setup(playedDay());

    const response = await server.post(
      "/sync",
      syncBody({ known: ["m1", "m2", "m3"] }),
    );

    expect(await response.json()).toMatchObject({ matches: [] });
    expect(server.calls.some((call) => call.url.includes("/content/"))).toBe(
      false,
    );
  });

  it("entrega el token nuevo cuando Riot lo cambia", async () => {
    const server = setup({ ...playedDay(), rotatedTo: "refresco-2" });

    expect(await (await server.post("/sync", syncBody())).json()).toMatchObject(
      { refreshToken: "refresco-2" },
    );
  });

  it("una partida sin terminar llega sin resultado; sin el jugador, no llega", async () => {
    const server = setup({
      history: [
        { matchId: "a", gameStartTimeMillis: 1_000, queueId: "competitive" },
        { matchId: "b", gameStartTimeMillis: 2_000, queueId: "competitive" },
      ],
      matches: {
        a: riotMatch("a", { completed: false }),
        b: riotMatch("b", { withPlayer: false }),
      },
    });

    const body = (await (await server.post("/sync", syncBody())).json()) as {
      matches: { matchId: string; result: unknown }[];
    };

    expect(body.matches).toEqual([
      expect.objectContaining({ matchId: "a", result: null }),
    ]);
  });

  it("corta en 30 partidas y avisa de que quedan más", async () => {
    const history = Array.from({ length: 34 }, (_, index) => ({
      matchId: `p${index}`,
      gameStartTimeMillis: 1_000 + index,
      queueId: "competitive",
    }));
    const server = setup({
      history,
      matches: Object.fromEntries(
        history.map((entry) => [
          entry.matchId,
          riotMatch(entry.matchId, { start: entry.gameStartTimeMillis }),
        ]),
      ),
    });

    const first = (await (await server.post("/sync", syncBody())).json()) as {
      matches: { matchId: string }[];
      truncated: boolean;
    };
    expect(first.matches).toHaveLength(30);
    expect(first.truncated).toBe(true);

    // La app repite con lo que ya tiene y recibe el resto.
    const rest = (await (
      await server.post(
        "/sync",
        syncBody({ known: first.matches.map((match) => match.matchId) }),
      )
    ).json()) as { matches: unknown[]; truncated: boolean };
    expect(rest.matches).toHaveLength(4);
    expect(rest.truncated).toBe(false);
  });

  it("con una sesión que Riot ya no acepta, pide volver a conectar", async () => {
    const server = setup(playedDay());

    const response = await server.post(
      "/sync",
      syncBody({ refreshToken: "revocado" }),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: "auth" });
    expect(server.calls.some((call) => call.url.includes("/val/"))).toBe(false);
  });

  it("respeta el Retry-After de Riot", async () => {
    const server = setup({
      ...playedDay(),
      force: {
        [`/val/match/v1/matchlists/by-puuid/${PUUID}`]: new Response("{}", {
          status: 429,
          headers: { "Retry-After": "17" },
        }),
      },
    });

    const response = await server.post("/sync", syncBody());

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("17");
    expect(await response.json()).toMatchObject({
      error: "rate_limit",
      retryAfterSeconds: 17,
    });
  });

  it("si Riot falla responde 502 sin detalles del jugador", async () => {
    const server = setup({
      ...playedDay(),
      force: {
        "/val/match/v1/matches/m2": new Response("no es json", { status: 500 }),
      },
    });

    const response = await server.post("/sync", syncBody());

    expect(response.status).toBe(502);
    const text = await response.text();
    expect(JSON.parse(text)).toMatchObject({ error: "riot" });
    expect(text).not.toContain(PUUID);
  });

  it("una cuenta sin historial en esa región no es un error", async () => {
    const server = setup({
      force: {
        [`/val/match/v1/matchlists/by-puuid/${PUUID}`]: new Response("{}", {
          status: 404,
        }),
      },
    });

    expect(await (await server.post("/sync", syncBody())).json()).toMatchObject(
      { matches: [], truncated: false },
    );
  });

  it.each([
    ["sin sesión", { refreshToken: "" }],
    ["región desconocida", { shard: "marte" }],
    ["intervalo al revés", { from: 5_000, to: 1_000 }],
    ["intervalo de más de dos días", { from: 0, to: 49 * 60 * 60 * 1000 }],
    ["cola que no se sincroniza", { queues: ["deathmatch"] }],
    ["sin colas", { queues: [] }],
    ["partidas guardadas que no son texto", { known: [1, 2] }],
  ])("rechaza una petición con %s", async (_name, change) => {
    const server = setup(playedDay());

    const response = await server.post("/sync", syncBody(change));

    expect(response.status).toBe(400);
    expect(server.calls).toEqual([]);
  });

  it("rechaza un cuerpo que no es JSON", async () => {
    const server = setup();
    const response = await handle(
      new Request(`${ORIGIN}/sync`, { method: "POST", body: "hola" }),
      server.env,
      server.fetcher,
    );
    expect(response.status).toBe(400);
  });
});
