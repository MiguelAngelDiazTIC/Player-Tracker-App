// @vitest-environment node
import { describe, expect, it } from "vitest";
import { emptyRankedSession, type RankedSession } from "./ranked";
import {
  planDaySync,
  readRiotQueues,
  RIOT_QUEUES_SETTING,
  riotMatchDate,
  riotMatchesSchema,
  toRankedSession,
  type RiotMatch,
} from "./riotMatches";

/** Milisegundos de una hora local, como los daría Riot para ese instante. */
const at = (day: number, hour: number, minute = 0) =>
  new Date(2026, 9, day, hour, minute).getTime();

function match(change: Partial<RiotMatch> = {}): RiotMatch {
  return {
    matchId: "m1",
    queueId: "competitive",
    startedAtMillis: at(8, 18),
    map: "Ascent",
    agent: "Jett",
    result: "win",
    kills: 20,
    deaths: 10,
    score: 5000,
    rounds: 20,
    ...change,
  };
}

const ids = () => {
  let next = 0;
  return () => `nueva-${(next += 1)}`;
};

describe("toRankedSession", () => {
  it("convierte una partida en una fila de Rankeds", () => {
    expect(toRankedSession(match(), "s1")).toEqual({
      id: "s1",
      date: "2026-10-08",
      map: "Ascent",
      agent: "Jett",
      result: "win",
      kills: 20,
      deaths: 10,
      score: 5000,
      rounds: 20,
      source: "riot",
      externalMatchId: "riot:m1",
    });
  });

  it("la partida es del día en que empieza, aunque acabe al siguiente", () => {
    expect(riotMatchDate(match({ startedAtMillis: at(8, 23, 50) }))).toBe(
      "2026-10-08",
    );
    expect(riotMatchDate(match({ startedAtMillis: at(9, 0, 5) }))).toBe(
      "2026-10-09",
    );
  });
});

describe("planDaySync", () => {
  const queues = readRiotQueues({});

  it("resume un día con varias partidas y agentes sobre los totales", () => {
    const plan = planDaySync(
      "2026-10-08",
      [
        // Llegan de la más reciente a la más antigua.
        match({
          matchId: "m4",
          startedAtMillis: at(8, 22),
          agent: "Raze",
          map: "Bind",
          kills: 10,
          deaths: 20,
          score: 3000,
          rounds: 24,
          result: "loss",
        }),
        match({ matchId: "m3", startedAtMillis: at(8, 21), map: "Bind" }),
        match({ matchId: "m2", startedAtMillis: at(8, 20) }),
        match({ matchId: "m1", startedAtMillis: at(8, 18) }),
      ],
      [],
      queues,
      ids(),
    );

    expect(plan.found).toBe(4);
    // En el orden en que se jugaron.
    expect(plan.newSessions.map((session) => session.externalMatchId)).toEqual([
      "riot:m1",
      "riot:m2",
      "riot:m3",
      "riot:m4",
    ]);
    expect(plan.values).toEqual({
      rankeds: 4,
      // 70 kills entre 50 muertes; 18000 de puntuación entre 84 rondas.
      kd: 1.4,
      acs: 214,
      agents: "Jett ×3, Raze ×1",
      maps: "Ascent ×2, Bind ×2",
    });
  });

  it("deja fuera las partidas de otro día", () => {
    const plan = planDaySync(
      "2026-10-08",
      [
        match({ matchId: "antes", startedAtMillis: at(7, 23, 59) }),
        match({ matchId: "tarde", startedAtMillis: at(8, 23, 50) }),
        match({ matchId: "despues", startedAtMillis: at(9, 0, 1) }),
      ],
      [],
      queues,
      ids(),
    );

    expect(plan.newSessions.map((session) => session.externalMatchId)).toEqual([
      "riot:tarde",
    ]);
  });

  it("por defecto solo cuenta el competitivo; las demás colas se añaden", () => {
    const fetched = [
      match({ matchId: "ranked" }),
      match({ matchId: "premier", queueId: "premier" }),
      match({ matchId: "unrated", queueId: "unrated" }),
      match({ matchId: "custom", queueId: "" }),
      match({ matchId: "dm", queueId: "deathmatch" }),
    ];

    expect(planDaySync("2026-10-08", fetched, [], queues, ids()).found).toBe(1);

    const withPremier = readRiotQueues({ [RIOT_QUEUES_SETTING]: ["premier"] });
    expect(withPremier).toEqual(["competitive", "premier"]);
    expect(
      planDaySync("2026-10-08", fetched, [], withPremier, ids()).found,
    ).toBe(2);
  });

  it("un ajuste de colas que no se entiende no quita el competitivo", () => {
    expect(readRiotQueues({ [RIOT_QUEUES_SETTING]: "premier" })).toEqual([
      "competitive",
    ]);
    expect(
      readRiotQueues({ [RIOT_QUEUES_SETTING]: ["deathmatch", 3, ""] }),
    ).toEqual(["competitive"]);
  });

  it("al repetir no duplica ni pisa lo corregido a mano", () => {
    const fetched = [
      match({ matchId: "m2", startedAtMillis: at(8, 20) }),
      match(),
    ];
    const first = planDaySync("2026-10-08", fetched, [], queues, ids());

    // El jugador corrige el agente de la primera partida.
    const saved: RankedSession[] = first.newSessions.map((session, index) =>
      index === 0 ? { ...session, agent: "Neon" } : session,
    );
    const again = planDaySync("2026-10-08", fetched, saved, queues, ids());

    expect(again.newSessions).toEqual([]);
    expect(again.found).toBe(2);
    expect(again.values.rankeds).toBe(2);
    expect(again.values.agents).toBe("Jett ×1, Neon ×1");
  });

  it("no cuenta dos veces una partida que la fuente repite", () => {
    const plan = planDaySync(
      "2026-10-08",
      [match(), match()],
      [],
      queues,
      ids(),
    );

    expect(plan.newSessions).toHaveLength(1);
  });

  it("suma las partidas del día apuntadas a mano", () => {
    const manual: RankedSession = {
      ...emptyRankedSession("manual-1", "2026-10-08"),
      agent: "Sova",
      kills: 10,
      deaths: 10,
    };
    const otherDay = emptyRankedSession("manual-2", "2026-10-07");
    const plan = planDaySync(
      "2026-10-08",
      [match()],
      [manual, otherDay],
      queues,
      ids(),
    );

    expect(plan.values).toMatchObject({
      rankeds: 2,
      kd: 1.5,
      agents: "Jett ×1, Sova ×1",
      maps: "Ascent ×1",
    });
  });

  it("sin partidas, el día queda en cero rankeds y lo demás sin tocar", () => {
    expect(planDaySync("2026-10-08", [], [], queues, ids())).toEqual({
      newSessions: [],
      found: 0,
      values: { rankeds: 0, kd: null, acs: null, agents: null, maps: null },
    });
  });
});

describe("riotMatchesSchema", () => {
  it("acepta lo que entrega el servidor y rechaza lo que no", () => {
    expect(riotMatchesSchema.safeParse([match()]).success).toBe(true);
    expect(
      riotMatchesSchema.safeParse([{ ...match(), kills: -1 }]).success,
    ).toBe(false);
    expect(
      riotMatchesSchema.safeParse([{ ...match(), result: "victoria" }]).success,
    ).toBe(false);
  });
});
