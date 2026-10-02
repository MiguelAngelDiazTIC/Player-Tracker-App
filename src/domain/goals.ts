import { z } from "zod";
import { isoDateSchema } from "./day";

export const goalSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  /** Fecha límite, si la tiene. */
  deadline: isoDateSchema.nullable(),
  done: z.boolean(),
});

export type Goal = z.infer<typeof goalSchema>;

/** Los objetivos se guardan en los ajustes, así viajan con la exportación. */
export const GOALS_SETTING = "goals";

/** Objetivos guardados; lo que no tenga la forma esperada se ignora. */
export function readGoals(setting: unknown): Goal[] {
  const result = z.array(goalSchema).safeParse(setting);
  return result.success ? result.data : [];
}

/** Días que faltan hasta la fecha límite; negativo si ya pasó. */
export function daysLeft(goal: Goal, today: string): number | null {
  if (goal.deadline === null) return null;
  const toDays = (iso: string) => {
    const [year, month, day] = iso.split("-").map(Number);
    return Date.UTC(year, month - 1, day) / 86_400_000;
  };
  return toDays(goal.deadline) - toDays(today);
}

/** Pendientes primero (los de fecha más cercana antes); cumplidos al final. */
export function sortGoals(goals: readonly Goal[]): Goal[] {
  return [...goals].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    if (a.deadline === b.deadline) return a.title.localeCompare(b.title);
    if (a.deadline === null) return 1;
    if (b.deadline === null) return -1;
    return a.deadline.localeCompare(b.deadline);
  });
}
