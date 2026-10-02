import { z } from "zod";
import { isoDateSchema } from "./day";

/** La revisión semanal pide tres conclusiones. */
export const REVIEW_CONCLUSIONS = 3;

export const weeklyReviewSchema = z.object({
  /** Lunes de la semana revisada. */
  weekStart: isoDateSchema,
  conclusions: z.array(z.string()),
});

export type WeeklyReview = z.infer<typeof weeklyReviewSchema>;

export function emptyReview(weekStart: string): WeeklyReview {
  return {
    weekStart,
    conclusions: Array.from({ length: REVIEW_CONCLUSIONS }, () => ""),
  };
}

/** Una revisión sin nada escrito no se guarda. */
export function isEmptyReview(review: WeeklyReview): boolean {
  return review.conclusions.every((conclusion) => conclusion.trim() === "");
}
