// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  HENRIK_PAGE_SIZE,
  parseRiotId,
  readHenrikAccount,
  storedMatchesUrl,
  toRiotMatch,
  type HenrikConfig,
  type StoredMatch,
} from "../domain/henrikMatches";
import { planSync, riotMatchDate } from "../domain/riotMatches";
import {
  createHenrikSource,
  SyncError,
  testConnection,
  type HttpClient,
  type HttpResponse,
} from "./henrikSource";

const config: HenrikConfig = {
  name: "Saiz",
  tag: "ARK",
  region: "eu",
  apiKey: "HDEV-clave-de-prueba",
};

/** Hora local de octubre de 2026, como la daría HenrikDev (ISO en UTC). */
const at = (day: number, hour = 12, minute = 0) =>
  new Date(2026, 9, day, hour, minute).toISOString();

/** Partida con la forma que devuelve `stored-matches`. */
function stored(
  id: string,
  startedAt: string,
  patch: {
    team?: string;
    red?: number | null;
    blue?: number | null;
    kills?: number;
    deaths?: number;
    score?: number;
    map?: string;
    agent?: string;
  } = {},
): StoredMatch {
  return {
    meta: {
      id,
      map: { name: patch.map ?? "Lotus" },
      started_at: startedAt,
    },
    stats: {
      team: patch.team ?? "Red",
      character: { name: patch.agent ?? "Fade" },
      score: patch.score ?? 3931,
      kills: patch.kills ?? 15,
      deaths: patch.deaths ?? 11,
    },
    teams: {
      red: patch.red === undefined ? 13 : patch.red,
      blue: patch.blue === undefined ? 5 : patch.blue,
    },
  };
}

function ok(data: StoredMatch[], after = 0): HttpResponse {
  return {
    status: 200,
    body: { status: 200, results: { after }, data },
    retryAfterSeconds: null,
  };
}

const failure = (
  status: number,
  retryAfterSeconds: number | null = null,
): HttpResponse => ({ status, body: null, retryAfterSeconds });

/** Servidor falso: responde según el modo y la página de la URL. */
function fakeHttp(pages: Record<string, HttpResponse[]>) {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const http: HttpClient = {
    async get(url, headers) {
      calls.push({ url, headers });
      const query = new URL(url).searchParams;
      const mode = query.get("mode") ?? "account";
      return pages[mode]?.[Number(query.get("page") ?? 1) - 1] ?? ok([]);
    },
  };
  return { http, calls };
}

describe("Riot ID y cuenta", () => {
  it("separa nombre y tag", () => {
    expect(parseRiotId(" Saiz#ARK ")).toEqual({ name: "Saiz", tag: "ARK" });
    expect(parseRiotId("Con espacios#EUW")).toEqual({
      name: "Con espacios",
      tag: "EUW",
    });
    expect(parseRiotId("sin-tag")).toBeNull();
    expect(parseRiotId("#EUW")).toBeNull();
    expect(parseRiotId("a#b#c")).toBeNull();
  });

  it("lee la cuenta de los ajustes solo si está completa", () => {
    expect(
      readHenrikAccount({ "riot.id": "Saiz#ARK", "riot.region": "eu" }),
    ).toEqual({ name: "Saiz", tag: "ARK", region: "eu" });
    expect(readHenrikAccount({ "riot.id": "Saiz#ARK" })).toBeNull();
    expect(
      readHenrikAccount({ "riot.id": "Saiz", "riot.region": "eu" }),
    ).toBeNull();
    expect(
      readHenrikAccount({ "riot.id": "Saiz#ARK", "riot.region": "marte" }),
    ).toBeNull();
  });

  it("escapa el Riot ID en la URL", () => {
    expect(
      storedMatchesUrl({ ...config, name: "Con espacios" }, "competitive", 2),
    ).toBe(
      "https://api.henrikdev.xyz/valorant/v1/stored-matches/eu/Con%20espacios/ARK?mode=competitive&size=60&page=2",
    );
  });
});

describe("toRiotMatch", () => {
  it("convierte una partida al formato común, con el id de Riot", () => {
    expect(toRiotMatch(stored("m1", at(8, 18)), "competitive")).toEqual({
      matchId: "m1",
      queueId: "competitive",
      startedAtMillis: new Date(2026, 9, 8, 18).getTime(),
      map: "Lotus",
      agent: "Fade",
      result: "win",
      kills: 15,
      deaths: 11,
      score: 3931,
      rounds: 18,
    });
  });

  it("saca el resultado del equipo del jugador", () => {
    const result = (patch: Parameters<typeof stored>[2]) =>
      toRiotMatch(stored("m", at(8), patch), "competitive")?.result;

    expect(result({ team: "Blue" })).toBe("loss");
    expect(result({ team: "blue", red: 9, blue: 13 })).toBe("win");
    expect(result({ red: 12, blue: 12 })).toBe("draw");
    expect(result({ red: null, blue: null })).toBeNull();
  });

  it("una partida que empieza antes de medianoche es de ese día", () => {
    const late = toRiotMatch(stored("m", at(8, 23, 50)), "competitive");
    const early = toRiotMatch(stored("m", at(9, 0, 5)), "competitive");

    expect(late && riotMatchDate(late)).toBe("2026-10-08");
    expect(early && riotMatchDate(early)).toBe("2026-10-09");
  });

  it("descarta una partida con una fecha que no se entiende", () => {
    expect(toRiotMatch(stored("m", "ayer"), "competitive")).toBeNull();
  });
});

describe("createHenrikSource", () => {
  it("pide el día con la clave en la cabecera y devuelve sus partidas", async () => {
    const { http, calls } = fakeHttp({
      competitive: [
        ok([
          stored("hoy-2", at(8, 21)),
          stored("hoy-1", at(8, 18)),
          stored("ayer", at(7, 20)),
        ]),
      ],
    });
    const source = createHenrikSource(http, config);

    const matches = await source.fetchDays("2026-10-08", "2026-10-08", [
      "competitive",
    ]);

    expect(source.source).toBe("henrikdev");
    expect(matches.map((match) => match.matchId)).toEqual(["hoy-2", "hoy-1"]);
    expect(calls).toEqual([
      {
        url: storedMatchesUrl(config, "competitive", 1),
        headers: { Authorization: "HDEV-clave-de-prueba" },
      },
    ]);
  });

  it("pasa páginas hasta dejar atrás el primer día", async () => {
    const full = (prefix: string, day: number) =>
      Array.from({ length: HENRIK_PAGE_SIZE }, (_, index) =>
        stored(`${prefix}-${index}`, at(day, 12, index % 60)),
      );
    const { http, calls } = fakeHttp({
      competitive: [
        ok(full("nueve", 9), 200),
        ok([...full("ocho", 8).slice(1), stored("siete", at(7))], 200),
        ok(full("seis", 6), 200),
      ],
    });

    const matches = await createHenrikSource(http, config).fetchDays(
      "2026-10-08",
      "2026-10-09",
      ["competitive"],
    );

    expect(matches).toHaveLength(HENRIK_PAGE_SIZE * 2 - 1);
    // La tercera página ya no hace falta.
    expect(calls).toHaveLength(2);
  });

  it("para en una página a medias aunque no haya partidas más antiguas", async () => {
    const { http, calls } = fakeHttp({
      competitive: [ok([stored("a", at(8))], 200)],
    });

    await createHenrikSource(http, config).fetchDays(
      "2026-10-01",
      "2026-10-08",
      ["competitive"],
    );

    expect(calls).toHaveLength(1);
  });

  it("hace una petición por cola y marca cada partida con la suya", async () => {
    const { http, calls } = fakeHttp({
      competitive: [ok([stored("ranked", at(8, 18))])],
      premier: [ok([stored("premier", at(8, 20))])],
    });

    const matches = await createHenrikSource(http, config).fetchDays(
      "2026-10-08",
      "2026-10-08",
      ["competitive", "premier"],
    );

    expect(matches.map((match) => [match.matchId, match.queueId])).toEqual([
      ["ranked", "competitive"],
      ["premier", "premier"],
    ]);
    expect(
      calls.map((call) => new URL(call.url).searchParams.get("mode")),
    ).toEqual(["competitive", "premier"]);
  });

  it("repetir la sincronización no duplica partidas", async () => {
    const { http } = fakeHttp({
      competitive: [
        ok([stored("b", at(8, 21)), stored("a", at(8, 18))]),
        // No hay segunda página: cada sincronización pide la primera.
      ],
    });
    const source = createHenrikSource(http, config);
    let next = 0;
    const sync = async (existing: Parameters<typeof planSync>[2]) =>
      planSync(
        ["2026-10-08"],
        await source.fetchDays("2026-10-08", "2026-10-08", ["competitive"]),
        existing,
        ["competitive"],
        () => `id-${(next += 1)}`,
        source.source,
      );

    const first = await sync([]);
    expect(first.newSessions).toMatchObject([
      { source: "henrikdev", externalMatchId: "riot:a" },
      { source: "henrikdev", externalMatchId: "riot:b" },
    ]);

    const again = await sync(first.newSessions);
    expect(again.newSessions).toEqual([]);
    expect(again.found).toBe(2);
    expect(again.days).toEqual([
      { date: "2026-10-08", values: first.days[0].values },
    ]);
  });

  it.each([
    [401, "auth", /Clave no válida/],
    [403, "auth", /Clave no válida/],
    [404, "not-found", /no encuentra la cuenta Saiz#ARK/],
    [500, "network", /error \(500\)/],
  ])("con un %i avisa de forma clara", async (status, kind, message) => {
    const { http } = fakeHttp({ competitive: [failure(status)] });

    const error = await createHenrikSource(http, config)
      .fetchDays("2026-10-08", "2026-10-08", ["competitive"])
      .catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(SyncError);
    expect(error).toMatchObject({ kind });
    expect((error as SyncError).message).toMatch(message);
  });

  it("con un 429 dice cuánto hay que esperar", async () => {
    const wait = async (retryAfter: number | null) => {
      const { http } = fakeHttp({ competitive: [failure(429, retryAfter)] });
      return createHenrikSource(http, config)
        .fetchDays("2026-10-08", "2026-10-08", ["competitive"])
        .catch((cause: SyncError) => cause);
    };

    expect(await wait(23)).toMatchObject({
      kind: "rate-limit",
      message: expect.stringContaining("dentro de 23 segundos") as string,
    });
    expect(await wait(null)).toMatchObject({
      message: expect.stringContaining("Espera un minuto") as string,
    });
  });

  it("avisa si no hay conexión o la respuesta no es la esperada", async () => {
    const offline: HttpClient = {
      async get() {
        throw new Error("sin red");
      },
    };
    await expect(
      createHenrikSource(offline, config).fetchDays(
        "2026-10-08",
        "2026-10-08",
        ["competitive"],
      ),
    ).rejects.toMatchObject({
      kind: "network",
      message: "No se pudo conectar con HenrikDev: sin red",
    });

    const { http } = fakeHttp({
      competitive: [
        { status: 200, body: { otra: "cosa" }, retryAfterSeconds: null },
      ],
    });
    await expect(
      createHenrikSource(http, config).fetchDays("2026-10-08", "2026-10-08", [
        "competitive",
      ]),
    ).rejects.toMatchObject({ kind: "format" });
  });
});

describe("testConnection", () => {
  it("devuelve el nivel y la región de la cuenta", async () => {
    const { http, calls } = fakeHttp({
      account: [
        {
          status: 200,
          body: { data: { region: "eu", account_level: 312 } },
          retryAfterSeconds: null,
        },
      ],
    });

    expect(await testConnection(http, config)).toEqual({
      region: "eu",
      level: 312,
    });
    expect(calls[0]).toEqual({
      url: "https://api.henrikdev.xyz/valorant/v2/account/Saiz/ARK",
      headers: { Authorization: "HDEV-clave-de-prueba" },
    });
  });

  it("falla con la clave equivocada", async () => {
    const { http } = fakeHttp({ account: [failure(401)] });
    await expect(testConnection(http, config)).rejects.toMatchObject({
      kind: "auth",
    });
  });
});
