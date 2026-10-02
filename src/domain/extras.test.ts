import { describe, expect, it } from "vitest";
import type { Day } from "./day";
import { daysLeft, readGoals, sortGoals, type Goal } from "./goals";
import {
  backlinksTo,
  emptyNote,
  extractLinks,
  linkDate,
  notesMentioningDay,
  resolveLink,
  type Note,
} from "./notes";
import {
  emptyRankedSession,
  rankedBy,
  rankedTotals,
  sessionAcs,
  type RankedSession,
} from "./ranked";

const session = (id: string, patch: Partial<RankedSession>): RankedSession => ({
  ...emptyRankedSession(id, "2026-09-20"),
  ...patch,
});

describe("partidas de ranked", () => {
  const sessions = [
    session("a", {
      map: "Ascent",
      agent: "Jett",
      result: "win",
      kills: 20,
      deaths: 10,
      score: 5200,
      rounds: 20,
    }),
    session("b", {
      map: "Ascent",
      agent: "Raze",
      result: "loss",
      kills: 10,
      deaths: 20,
      score: 3600,
      rounds: 24,
    }),
    session("c", { map: "Bind", agent: "Jett", result: "win" }),
    session("d", {}),
  ];

  it("calcula el ACS de una partida", () => {
    expect(sessionAcs(sessions[0])).toBe(260);
    expect(sessionAcs(sessions[2])).toBeNull();
    expect(sessionAcs({ score: 100, rounds: 0 })).toBeNull();
  });

  it("calcula K/D y ACS sobre los totales, como el juego", () => {
    expect(rankedTotals(sessions)).toEqual({
      count: 4,
      wins: 2,
      losses: 1,
      draws: 0,
      winRate: (2 / 3) * 100,
      kd: 30 / 30,
      acs: 8800 / 44,
    });
  });

  it("sin datos deja las cifras en null", () => {
    expect(rankedTotals([session("x", {})])).toMatchObject({
      count: 1,
      winRate: null,
      kd: null,
      acs: null,
    });
    expect(rankedTotals([session("y", { kills: 7, deaths: 0 })]).kd).toBe(7);
  });

  it("agrupa por mapa y por agente, del más jugado al menos", () => {
    expect(
      rankedBy(sessions, "map").map((group) => [group.name, group.count]),
    ).toEqual([
      ["Ascent", 2],
      ["Bind", 1],
    ]);
    const [jett, raze] = rankedBy(sessions, "agent");
    expect(jett).toMatchObject({ name: "Jett", count: 2, wins: 2, kd: 2 });
    expect(raze).toMatchObject({ name: "Raze", acs: 150, winRate: 0 });
  });
});

describe("enlaces de las notas", () => {
  it("extrae los destinos sin repetir", () => {
    expect(
      extractLinks(
        "Visto el VOD de [[Team Ñu]] tras el [[14/09/2026]]. Otra vez [[Team Ñu]] y [[ Lineups Ascent ]].",
      ),
    ).toEqual(["Team Ñu", "14/09/2026", "Lineups Ascent"]);
  });

  it("entiende los corchetes escapados que guarda el Markdown", () => {
    const escaped = String.raw`Mirar \[\[Lineups Ascent\]\] mañana`;
    expect(extractLinks(escaped)).toEqual(["Lineups Ascent"]);
  });

  it("ignora corchetes vacíos, sueltos o partidos en dos líneas", () => {
    expect(extractLinks("[[]] [uno] [[dos\ntres]] [[ ]]")).toEqual([]);
  });

  it("reconoce las fechas en los dos formatos", () => {
    expect(linkDate("14/09/2026")).toBe("2026-09-14");
    expect(linkDate("2026-09-14")).toBe("2026-09-14");
    expect(linkDate("Team Ñu")).toBeNull();
  });

  const note = (id: string, title: string, links: string[] = []): Note => ({
    ...emptyNote(id, title),
    links,
  });
  const notes = [
    note("1", "Team Ñu", ["Lineups Ascent", "14/09/2026"]),
    note("2", "Lineups Ascent", ["team nu"]),
    note("3", "Objetivos de la semana", ["2026-09-14", "Nota que no existe"]),
    note("4", ""),
  ];

  it("resuelve un enlace a un día, a una nota o a nada", () => {
    expect(resolveLink("14/09/2026", notes)).toEqual({
      kind: "day",
      target: "14/09/2026",
      date: "2026-09-14",
    });
    expect(resolveLink("lineups ascent", notes)).toMatchObject({
      kind: "note",
      note: { id: "2" },
    });
    expect(resolveLink("Nota que no existe", notes)).toEqual({
      kind: "missing",
      target: "Nota que no existe",
    });
  });

  it("encuentra quién menciona una nota, sin acentos ni mayúsculas", () => {
    const days: Day[] = [
      {
        date: "2026-09-20",
        values: {},
        feelingsMd: String.raw`Scrim contra \[\[Team Ñu\]\]`,
        tags: [],
      },
      { date: "2026-09-21", values: {}, feelingsMd: "Sin enlaces", tags: [] },
    ];
    const result = backlinksTo(notes[0], notes, days);
    expect(result.notes.map((item) => item.id)).toEqual(["2"]);
    expect(result.days.map((item) => item.date)).toEqual(["2026-09-20"]);
  });

  it("una nota sin título no recibe enlaces", () => {
    expect(backlinksTo(notes[3], notes, [])).toEqual({ notes: [], days: [] });
  });

  it("lista las notas que mencionan un día", () => {
    expect(
      notesMentioningDay("2026-09-14", notes).map((item) => item.id),
    ).toEqual(["1", "3"]);
    expect(notesMentioningDay("2026-09-15", notes)).toEqual([]);
  });
});

describe("objetivos", () => {
  const goal = (patch: Partial<Goal>): Goal => ({
    id: "g",
    title: "Llegar a Radiant",
    deadline: null,
    done: false,
    ...patch,
  });

  it("cuenta los días que faltan", () => {
    expect(daysLeft(goal({ deadline: "2026-12-31" }), "2026-10-02")).toBe(90);
    expect(daysLeft(goal({ deadline: "2026-10-01" }), "2026-10-02")).toBe(-1);
    expect(daysLeft(goal({}), "2026-10-02")).toBeNull();
  });

  it("ordena pendientes por fecha y deja los cumplidos al final", () => {
    const sorted = sortGoals([
      goal({ id: "hecho", done: true, deadline: "2026-01-01" }),
      goal({ id: "sin-fecha" }),
      goal({ id: "diciembre", deadline: "2026-12-31" }),
      goal({ id: "octubre", deadline: "2026-10-15" }),
    ]);
    expect(sorted.map((item) => item.id)).toEqual([
      "octubre",
      "diciembre",
      "sin-fecha",
      "hecho",
    ]);
  });

  it("ignora un ajuste que no es una lista de objetivos", () => {
    expect(readGoals(undefined)).toEqual([]);
    expect(readGoals([{ id: "x" }])).toEqual([]);
    expect(readGoals([goal({})])).toEqual([goal({})]);
  });
});
