// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  HENRIK_PAGE_SIZE,
  parseRiotId,
  readHenrikConfig,
  storedMatchesUrl,
  toRankedSession,
  toScrimMatch,
  type HenrikConfig,
  type StoredMatch,
} from "../domain/henrik";
import {
  fetchDayMatches,
  syncDay,
  SyncError,
  testConnection,
  type HttpClient,
  type HttpResponse,
} from "./henrikSync";

const config: HenrikConfig = {
  name: "Saiz",
  tag: "ARK",
  region: "eu",
  apiKey: "clave-de-prueba",
};

/** Partida con la forma que devuelve `stored-matches`, a mediodía UTC. */
function stored(
  id: string,
  date: string,
  patch: {
    team?: string;
    red?: number | null;
    blue?: number | null;
    kills?: number;
    deaths?: number;
    score?: number;
    map?: string;
    agent?: string;
    mode?: string;
  } = {},
): StoredMatch {
  return {
    meta: {
      id,
      map: { name: patch.map ?? "Lotus" },
      mode: patch.mode ?? "Competitive",
      started_at: `${date}T12:00:00.000Z`,
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

/** Servidor falso: responde según el modo y la página de la URL. */
function fakeHttp(
  pages: Partial<Record<"competitive" | "custom", HttpResponse[]>>,
) {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const http: HttpClient = {
    async get(url, headers) {
      calls.push({ url, headers });
      const query = new URL(url).searchParams;
      const mode = query.get("mode") as "competitive" | "custom";
      const page = Number(query.get("page"));
      return pages[mode]?.[page - 1] ?? ok([]);
    },
  };
  return { http, calls };
}

describe("Riot ID y configuración", () => {
  it("separa nombre y tag", () => {
    expect(parseRiotId("Saiz#ARK")).toEqual({ name: "Saiz", tag: "ARK" });
    expect(parseRiotId("  Con Espacios#1234 ")).toEqual({
      name: "Con Espacios",
      tag: "1234",
    });
  });

  it("rechaza lo que no es nombre#tag", () => {
    for (const text of ["", "Saiz", "#ARK", "Saiz#", "a#b#c"]) {
      expect(parseRiotId(text)).toBeNull();
    }
  });

  it("solo hay configuración con Riot ID, región y clave", () => {
    const settings = {
      "riot.id": "Saiz#ARK",
      "riot.region": "eu",
      "henrikdev.apiKey": " clave ",
    };
    expect(readHenrikConfig(settings)).toEqual({
      name: "Saiz",
      tag: "ARK",
      region: "eu",
      apiKey: "clave",
    });
    expect(
      readHenrikConfig({ ...settings, "henrikdev.apiKey": "" }),
    ).toBeNull();
    expect(readHenrikConfig({ ...settings, "riot.region": "luna" })).toBeNull();
    expect(readHenrikConfig({ ...settings, "riot.id": "Saiz" })).toBeNull();
  });

  it("codifica el Riot ID en la URL", () => {
    expect(
      storedMatchesUrl({ ...config, name: "Con Espacios" }, "custom", 2),
    ).toBe(
      `https://api.henrikdev.xyz/valorant/v1/stored-matches/eu/Con%20Espacios/ARK?mode=custom&size=${HENRIK_PAGE_SIZE}&page=2`,
    );
  });
});

describe("convertir partidas", () => {
  it("convierte una ranked: resultado, rondas y puntuación total", () => {
    expect(toRankedSession(stored("m1", "2026-10-01"), "id-1")).toEqual({
      id: "id-1",
      date: "2026-10-01",
      map: "Lotus",
      agent: "Fade",
      result: "win",
      kills: 15,
      deaths: 11,
      score: 3931,
      rounds: 18,
      source: "henrikdev",
      externalMatchId: "m1",
    });
  });

  it("decide el resultado desde el equipo del jugador", () => {
    const result = (patch: Parameters<typeof stored>[2]) =>
      toRankedSession(stored("m", "2026-10-01", patch), "id").result;
    expect(result({ team: "Blue", red: 13, blue: 5 })).toBe("loss");
    expect(result({ team: "Blue", red: 11, blue: 13 })).toBe("win");
    expect(result({ team: "Red", red: 12, blue: 12 })).toBe("draw");
    expect(result({ red: null, blue: null })).toBeNull();
  });

  it("convierte una custom en partida de scrims con su ACS", () => {
    expect(
      toScrimMatch(
        stored("c1", "2025-09-11", {
          mode: "Custom Game",
          map: "Haven",
          agent: "Sova",
          team: "Blue",
          red: 13,
          blue: 8,
          kills: 13,
          deaths: 18,
          score: 4187,
        }),
      ),
    ).toMatchObject({
      id: "henrikdev:c1",
      date: "2025-09-11",
      kind: "10mans",
      map: "Haven",
      agent: "Sova",
      result: "loss",
      roundsWon: 8,
      roundsLost: 13,
      kills: 13,
      deaths: 18,
      acs: 199,
      notes: "Sincronizada de HenrikDev",
    });
  });
});

describe("fetchDayMatches", () => {
  it("se queda con las partidas del día y para al dejarlo atrás", async () => {
    const { http, calls } = fakeHttp({
      competitive: [
        ok(
          [
            stored("a", "2026-10-01"),
            stored("b", "2026-09-26"),
            stored("c", "2026-09-26"),
            stored("d", "2026-09-25"),
          ],
          500,
        ),
      ],
    });

    const matches = await fetchDayMatches(
      http,
      config,
      "competitive",
      "2026-09-26",
    );

    expect(matches.map((match) => match.meta.id)).toEqual(["b", "c"]);
    expect(calls).toHaveLength(1);
    expect(calls[0].headers).toEqual({ Authorization: "clave-de-prueba" });
  });

  it("pasa de página mientras no llegue a días anteriores", async () => {
    const full = Array.from({ length: HENRIK_PAGE_SIZE }, (_, index) =>
      stored(`nuevo-${index}`, "2026-10-01"),
    );
    const { http, calls } = fakeHttp({
      competitive: [
        ok(full, 100),
        ok([stored("x", "2026-09-26"), stored("y", "2026-09-20")], 0),
      ],
    });

    const matches = await fetchDayMatches(
      http,
      config,
      "competitive",
      "2026-09-26",
    );

    expect(matches.map((match) => match.meta.id)).toEqual(["x"]);
    expect(
      calls.map((call) => new URL(call.url).searchParams.get("page")),
    ).toEqual(["1", "2"]);
  });
});

describe("syncDay", () => {
  // Ocho rankeds de un mismo día: kills, muertes, puntuación y rondas por equipo.
  const day = [
    [14, 12, 4100, 13, 8],
    [18, 15, 4600, 13, 10],
    [12, 14, 3300, 9, 13],
    [21, 13, 5200, 13, 7],
    [9, 15, 2700, 5, 13],
    [17, 12, 4300, 13, 9],
    [15, 13, 3900, 13, 11],
    [11, 15, 3050, 8, 13],
  ].map(([kills, deaths, score, red, blue], index) =>
    stored(`r${index}`, "2026-09-26", { kills, deaths, score, red, blue }),
  );

  it("crea las partidas del día y calcula K/D y ACS sobre los totales", async () => {
    const { http } = fakeHttp({
      competitive: [ok([...day, stored("antes", "2026-09-25")])],
    });
    let next = 0;

    const result = await syncDay(
      http,
      config,
      "2026-09-26",
      { sessions: [], scrims: [] },
      () => `id-${(next += 1)}`,
    );

    expect(result.rankedsFound).toBe(8);
    expect(result.newSessions).toHaveLength(8);
    // La primera en guardarse es la más antigua (la última de la lista).
    expect(result.newSessions[0]).toMatchObject({
      id: "id-1",
      externalMatchId: "r7",
    });
    expect(result.totals.count).toBe(8);
    expect(result.totals.kd).toBeCloseTo(117 / 109);
    expect(result.totals.acs).toBeCloseTo(31150 / 171);
  });

  it("repetir la sincronización no duplica partidas", async () => {
    const { http } = fakeHttp({ competitive: [ok(day)] });
    const first = await syncDay(
      http,
      config,
      "2026-09-26",
      { sessions: [], scrims: [] },
      () => crypto.randomUUID(),
    );

    const second = await syncDay(
      http,
      config,
      "2026-09-26",
      { sessions: first.newSessions, scrims: [] },
      () => crypto.randomUUID(),
    );

    expect(second.newSessions).toEqual([]);
    expect(second.rankedsFound).toBe(8);
    expect(second.totals).toEqual(first.totals);
  });

  it("respeta lo corregido a mano en una partida ya sincronizada", async () => {
    const { http } = fakeHttp({ competitive: [ok(day.slice(0, 1))] });
    const edited = {
      ...toRankedSession(day[0], "mi-id"),
      agent: "Corregido a mano",
    };

    const result = await syncDay(
      http,
      config,
      "2026-09-26",
      { sessions: [edited], scrims: [] },
      () => "otro",
    );

    expect(result.newSessions).toEqual([]);
    expect(result.totals.count).toBe(1);
  });

  it("manda las customs al registro de scrims, sin los duelos de práctica", async () => {
    const { http } = fakeHttp({
      custom: [
        ok([
          stored("c2", "2026-09-26", { mode: "Custom Game", map: "Haven" }),
          stored("sk", "2026-09-26", {
            mode: "Custom Game",
            map: "Skirmish C",
          }),
          stored("c1", "2026-09-26", { mode: "Custom Game", map: "Ascent" }),
        ]),
      ],
    });

    const result = await syncDay(
      http,
      config,
      "2026-09-26",
      {
        sessions: [],
        scrims: [toScrimMatch(stored("c1", "2026-09-26", { map: "Ascent" }))],
      },
      () => "id",
    );

    expect(result.customsFound).toBe(2);
    expect(result.newScrims.map((scrim) => scrim.id)).toEqual(["henrikdev:c2"]);
    expect(result.newSessions).toEqual([]);
  });
});

describe("errores", () => {
  const failing = (response: Partial<HttpResponse>): HttpClient => ({
    async get() {
      return { status: 200, body: null, retryAfterSeconds: null, ...response };
    },
  });
  const attempt = (http: HttpClient) =>
    fetchDayMatches(http, config, "competitive", "2026-09-26").catch(
      (cause: unknown) => cause,
    );

  it("explica cada fallo en palabras del usuario", async () => {
    const cases: [Partial<HttpResponse>, string, string][] = [
      [{ status: 401 }, "auth", "HenrikDev no acepta la clave"],
      [{ status: 403 }, "auth", "HenrikDev no acepta la clave"],
      [{ status: 404 }, "not-found", "no encuentra la cuenta Saiz#ARK"],
      [
        { status: 429, retryAfterSeconds: 42 },
        "rate-limit",
        "Vuelve a intentarlo en 42 segundos",
      ],
      [{ status: 500 }, "network", "ha respondido con un error (500)"],
      [{ status: 200, body: { otra: "cosa" } }, "format", "no es la esperada"],
    ];
    for (const [response, kind, text] of cases) {
      const error = await attempt(failing(response));
      expect(error).toBeInstanceOf(SyncError);
      expect((error as SyncError).kind).toBe(kind);
      expect((error as SyncError).message).toContain(text);
    }
  });

  it("explica un fallo de red", async () => {
    const error = await attempt({
      async get() {
        throw new Error("sin conexión");
      },
    });
    expect((error as SyncError).kind).toBe("network");
    expect((error as SyncError).message).toContain("sin conexión");
  });

  it("probar la conexión devuelve la región y el nivel de la cuenta", async () => {
    const http = failing({
      body: { status: 200, data: { region: "eu", account_level: 917 } },
    });
    expect(await testConnection(http, config)).toEqual({
      region: "eu",
      level: 917,
    });
  });
});
