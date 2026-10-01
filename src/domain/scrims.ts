import { z } from "zod";
import { isoDateSchema } from "./day";

export const SCRIM_KINDS = ["10mans", "scrim"] as const;
export type ScrimKind = (typeof SCRIM_KINDS)[number];

export const SCRIM_KIND_LABELS: Record<ScrimKind, string> = {
  "10mans": "10mans",
  scrim: "Scrim",
};

export const SCRIM_RESULTS = ["win", "loss", "draw"] as const;
export type ScrimResult = (typeof SCRIM_RESULTS)[number];

export const SCRIM_RESULT_LABELS: Record<ScrimResult, string> = {
  win: "Victoria",
  loss: "Derrota",
  draw: "Empate",
};

const count = z.number().int().min(0).nullable();

export const scrimMatchSchema = z.object({
  id: z.string().min(1),
  date: isoDateSchema,
  kind: z.enum(SCRIM_KINDS),
  opponent: z.string(),
  map: z.string(),
  agent: z.string(),
  result: z.enum(SCRIM_RESULTS).nullable(),
  roundsWon: count,
  roundsLost: count,
  kills: count,
  deaths: count,
  acs: count,
  vodUrl: z.string(),
  notes: z.string(),
});

export type ScrimMatch = z.infer<typeof scrimMatchSchema>;

export function emptyScrimMatch(id: string, date: string): ScrimMatch {
  return {
    id,
    date,
    kind: "10mans",
    opponent: "",
    map: "",
    agent: "",
    result: null,
    roundsWon: null,
    roundsLost: null,
    kills: null,
    deaths: null,
    acs: null,
    vodUrl: "",
    notes: "",
  };
}

/** Partidas por fecha: es lo único que la fila del día muestra de los scrims. */
export function countScrimsByDate(
  matches: readonly Pick<ScrimMatch, "date">[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const match of matches) {
    counts[match.date] = (counts[match.date] ?? 0) + 1;
  }
  return counts;
}

/** K/D = kills / deaths. Sin muertes, el K/D es el número de kills. */
export function kdRatio(
  kills: number | null,
  deaths: number | null,
): number | null {
  if (kills === null || deaths === null) return null;
  return deaths === 0 ? kills : kills / deaths;
}

/**
 * La hoja solo guardaba cuántos 10mans/scrims hubo cada día. Al importarla se
 * crean partidas vacías hasta igualar ese número, para rellenarlas después.
 */
export function planScrimPlaceholders(
  countsFromSheet: Readonly<Record<string, number>>,
  existing: readonly Pick<ScrimMatch, "date">[],
  newId: () => string,
): ScrimMatch[] {
  const already = countScrimsByDate(existing);
  const placeholders: ScrimMatch[] = [];
  for (const [date, wanted] of Object.entries(countsFromSheet)) {
    const missing = wanted - (already[date] ?? 0);
    for (let index = 0; index < missing; index += 1) {
      placeholders.push({
        ...emptyScrimMatch(newId(), date),
        notes: "Importada de la hoja",
      });
    }
  }
  return placeholders;
}

export const VALORANT_MAPS = [
  "Abyss",
  "Ascent",
  "Bind",
  "Breeze",
  "Corrode",
  "Fracture",
  "Haven",
  "Icebox",
  "Lotus",
  "Pearl",
  "Split",
  "Sunset",
] as const;

export const VALORANT_AGENTS = [
  "Astra",
  "Breach",
  "Brimstone",
  "Chamber",
  "Clove",
  "Cypher",
  "Deadlock",
  "Fade",
  "Gekko",
  "Harbor",
  "Iso",
  "Jett",
  "KAY/O",
  "Killjoy",
  "Neon",
  "Omen",
  "Phoenix",
  "Raze",
  "Reyna",
  "Sage",
  "Skye",
  "Sova",
  "Tejo",
  "Veto",
  "Viper",
  "Vyse",
  "Waylay",
  "Yoru",
] as const;
