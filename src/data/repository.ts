import type { Day } from "../domain/day";
import {
  DEFAULT_FIELDS,
  type FieldDefinition,
  type FieldType,
  type FieldValue,
  type Thresholds,
} from "../domain/fields";
import type { Note } from "../domain/notes";
import type { RankedSession } from "../domain/ranked";
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

interface RankedRow {
  id: string;
  date: string;
  map: string;
  agent: string;
  result: string | null;
  kills: number | null;
  deaths: number | null;
  score: number | null;
  rounds: number | null;
  source: string;
  external_match_id: string | null;
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
  listRankedSessions(): Promise<RankedSession[]>;
  saveRankedSessions(sessions: readonly RankedSession[]): Promise<void>;
  deleteRankedSession(id: string): Promise<void>;
  listNotes(): Promise<Note[]>;
  saveNotes(notes: readonly Note[]): Promise<void>;
  deleteNote(id: string): Promise<void>;
  getSettings(): Promise<Settings>;
  setSetting(key: string, value: unknown): Promise<void>;
}

export function createRepository(
  driver: SqlDriver,
  /** Plantilla con la que se siembra una base de datos sin campos. */
  defaultFields: readonly FieldDefinition[] = DEFAULT_FIELDS,
): Repository {
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
      if (total === 0) await repository.saveFields(defaultFields);
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

    async listRankedSessions() {
      const rows = await driver.select<RankedRow>(
        "SELECT * FROM ranked_sessions ORDER BY date, rowid",
      );
      return rows.map((row) => ({
        id: row.id,
        date: row.date,
        map: row.map,
        agent: row.agent,
        result: row.result as ScrimResult | null,
        kills: row.kills,
        deaths: row.deaths,
        score: row.score,
        rounds: row.rounds,
        source: row.source as RankedSession["source"],
        externalMatchId: row.external_match_id,
      }));
    },

    async saveRankedSessions(sessions) {
      await upsertMany(
        "ranked_sessions",
        [
          "id",
          "date",
          "map",
          "agent",
          "result",
          "kills",
          "deaths",
          "score",
          "rounds",
          "source",
          "external_match_id",
        ],
        "id",
        sessions.map((session) => [
          session.id,
          session.date,
          session.map,
          session.agent,
          session.result,
          session.kills,
          session.deaths,
          session.score,
          session.rounds,
          session.source,
          session.externalMatchId,
        ]),
      );
    },

    async deleteRankedSession(id) {
      await driver.execute("DELETE FROM ranked_sessions WHERE id = ?", [id]);
    },

    async listNotes() {
      const rows = await driver.select<{
        id: string;
        title: string;
        body_md: string;
        links: string;
      }>("SELECT * FROM notes ORDER BY rowid");
      return rows.map((row) => ({
        id: row.id,
        title: row.title,
        bodyMd: row.body_md,
        links: JSON.parse(row.links) as string[],
      }));
    },

    async saveNotes(notes) {
      await upsertMany(
        "notes",
        ["id", "title", "body_md", "links"],
        "id",
        notes.map((note) => [
          note.id,
          note.title,
          note.bodyMd,
          JSON.stringify(note.links),
        ]),
      );
    },

    async deleteNote(id) {
      await driver.execute("DELETE FROM notes WHERE id = ?", [id]);
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
