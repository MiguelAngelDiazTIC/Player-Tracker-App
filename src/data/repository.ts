import type { Day } from "../domain/day";
import {
  DEFAULT_FIELDS,
  type FieldDefinition,
  type FieldType,
  type FieldValue,
  type Thresholds,
} from "../domain/fields";
import type { WeeklyReview } from "../domain/review";
import type { ScrimKind, ScrimMatch, ScrimResult } from "../domain/scrims";
import type { SqlDriver, SqlValue } from "./driver";
import { migrate } from "./migrations";

interface FieldRow {
  id: string;
  key: string;
  label: string;
  type: string;
  group: string;
  order: number;
  thresholds: string | null;
  archived: number;
}

interface DayRow {
  date: string;
  values: string;
  feelings_md: string;
  tags: string;
}

interface ScrimRow {
  id: string;
  date: string;
  kind: string;
  opponent: string;
  map: string;
  agent: string;
  result: string | null;
  rounds_won: number | null;
  rounds_lost: number | null;
  kills: number | null;
  deaths: number | null;
  acs: number | null;
  vod_url: string;
  notes: string;
}

/** Filas por sentencia en las inserciones múltiples. */
const CHUNK_SIZE = 100;

export type Settings = Record<string, unknown>;

export interface Repository {
  /** Crea las tablas que falten y, si no hay campos, siembra la plantilla. */
  init(): Promise<void>;
  listFields(): Promise<FieldDefinition[]>;
  saveFields(fields: readonly FieldDefinition[]): Promise<void>;
  listDays(): Promise<Day[]>;
  saveDays(days: readonly Day[]): Promise<void>;
  deleteDay(date: string): Promise<void>;
  listScrims(): Promise<ScrimMatch[]>;
  saveScrims(matches: readonly ScrimMatch[]): Promise<void>;
  deleteScrim(id: string): Promise<void>;
  listReviews(): Promise<WeeklyReview[]>;
  saveReviews(reviews: readonly WeeklyReview[]): Promise<void>;
  deleteReview(weekStart: string): Promise<void>;
  getSettings(): Promise<Settings>;
  setSetting(key: string, value: unknown): Promise<void>;
}

export function createRepository(driver: SqlDriver): Repository {
  /** `INSERT ... ON CONFLICT DO UPDATE` de muchas filas, por tandas. */
  async function upsertMany(
    table: string,
    columns: readonly string[],
    conflictColumn: string,
    rows: readonly SqlValue[][],
  ): Promise<void> {
    const columnList = columns.join(", ");
    const placeholders = `(${columns.map(() => "?").join(", ")})`;
    const updates = columns
      .filter((column) => column !== conflictColumn)
      .map((column) => `${column} = excluded.${column}`)
      .join(", ");

    for (let start = 0; start < rows.length; start += CHUNK_SIZE) {
      const chunk = rows.slice(start, start + CHUNK_SIZE);
      await driver.execute(
        `INSERT INTO ${table} (${columnList}) VALUES ${chunk.map(() => placeholders).join(", ")}
         ON CONFLICT (${conflictColumn}) DO UPDATE SET ${updates}`,
        chunk.flat(),
      );
    }
  }

  const repository: Repository = {
    async init() {
      await migrate(driver);
      const [{ total }] = await driver.select<{ total: number }>(
        "SELECT COUNT(*) AS total FROM field_definitions",
      );
      if (total === 0) await repository.saveFields(DEFAULT_FIELDS);
    },

    async listFields() {
      const rows = await driver.select<FieldRow>(
        'SELECT * FROM field_definitions ORDER BY "order", key',
      );
      return rows.map((row) => ({
        id: row.id,
        key: row.key,
        label: row.label,
        type: row.type as FieldType,
        group: row.group,
        order: row.order,
        thresholds:
          row.thresholds === null
            ? null
            : (JSON.parse(row.thresholds) as Thresholds),
        archived: row.archived === 1,
      }));
    },

    async saveFields(fields) {
      await upsertMany(
        "field_definitions",
        [
          "id",
          "key",
          "label",
          "type",
          '"group"',
          '"order"',
          "thresholds",
          "archived",
        ],
        "id",
        fields.map((field) => [
          field.id,
          field.key,
          field.label,
          field.type,
          field.group,
          field.order,
          field.thresholds === null ? null : JSON.stringify(field.thresholds),
          field.archived ? 1 : 0,
        ]),
      );
    },

    async listDays() {
      const rows = await driver.select<DayRow>(
        "SELECT * FROM days ORDER BY date",
      );
      return rows.map((row) => ({
        date: row.date,
        values: JSON.parse(row.values) as Record<string, FieldValue>,
        feelingsMd: row.feelings_md,
        tags: JSON.parse(row.tags) as string[],
      }));
    },

    async saveDays(days) {
      await upsertMany(
        "days",
        ["date", '"values"', "feelings_md", "tags"],
        "date",
        days.map((day) => [
          day.date,
          JSON.stringify(day.values),
          day.feelingsMd,
          JSON.stringify(day.tags),
        ]),
      );
    },

    async deleteDay(date) {
      await driver.execute("DELETE FROM days WHERE date = ?", [date]);
    },

    async listScrims() {
      const rows = await driver.select<ScrimRow>(
        "SELECT * FROM scrim_matches ORDER BY date, rowid",
      );
      return rows.map((row) => ({
        id: row.id,
        date: row.date,
        kind: row.kind as ScrimKind,
        opponent: row.opponent,
        map: row.map,
        agent: row.agent,
        result: row.result as ScrimResult | null,
        roundsWon: row.rounds_won,
        roundsLost: row.rounds_lost,
        kills: row.kills,
        deaths: row.deaths,
        acs: row.acs,
        vodUrl: row.vod_url,
        notes: row.notes,
      }));
    },

    async saveScrims(matches) {
      await upsertMany(
        "scrim_matches",
        [
          "id",
          "date",
          "kind",
          "opponent",
          "map",
          "agent",
          "result",
          "rounds_won",
          "rounds_lost",
          "kills",
          "deaths",
          "acs",
          "vod_url",
          "notes",
        ],
        "id",
        matches.map((match) => [
          match.id,
          match.date,
          match.kind,
          match.opponent,
          match.map,
          match.agent,
          match.result,
          match.roundsWon,
          match.roundsLost,
          match.kills,
          match.deaths,
          match.acs,
          match.vodUrl,
          match.notes,
        ]),
      );
    },

    async deleteScrim(id) {
      await driver.execute("DELETE FROM scrim_matches WHERE id = ?", [id]);
    },

    async listReviews() {
      const rows = await driver.select<{
        week_start: string;
        conclusions: string;
      }>("SELECT * FROM weekly_reviews ORDER BY week_start");
      return rows.map((row) => ({
        weekStart: row.week_start,
        conclusions: JSON.parse(row.conclusions) as string[],
      }));
    },

    async saveReviews(reviews) {
      await upsertMany(
        "weekly_reviews",
        ["week_start", "conclusions"],
        "week_start",
        reviews.map((review) => [
          review.weekStart,
          JSON.stringify(review.conclusions),
        ]),
      );
    },

    async deleteReview(weekStart) {
      await driver.execute("DELETE FROM weekly_reviews WHERE week_start = ?", [
        weekStart,
      ]);
    },

    async getSettings() {
      const rows = await driver.select<{ key: string; value: string }>(
        "SELECT key, value FROM settings ORDER BY key",
      );
      const settings: Settings = {};
      for (const row of rows) settings[row.key] = JSON.parse(row.value);
      return settings;
    },

    async setSetting(key, value) {
      await upsertMany("settings", ["key", "value"], "key", [
        [key, JSON.stringify(value)],
      ]);
    },
  };

  return repository;
}
