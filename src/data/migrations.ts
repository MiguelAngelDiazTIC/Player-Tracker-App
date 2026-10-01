import type { SqlDriver } from "./driver";

export interface Migration {
  version: number;
  name: string;
  /**
   * Una sentencia por elemento. El plugin de SQL reparte las llamadas entre
   * varias conexiones, así que no hay transacción entre sentencias: cada una
   * debe poder repetirse sin romper nada (`IF NOT EXISTS`).
   */
  statements: readonly string[];
}

/** Añade migraciones al final; no edites las ya publicadas. */
export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    name: "Tablas de la fase 1",
    statements: [
      `CREATE TABLE IF NOT EXISTS field_definitions (
        id TEXT PRIMARY KEY,
        key TEXT NOT NULL UNIQUE,
        label TEXT NOT NULL,
        type TEXT NOT NULL,
        "group" TEXT NOT NULL DEFAULT '',
        "order" INTEGER NOT NULL DEFAULT 0,
        thresholds TEXT,
        archived INTEGER NOT NULL DEFAULT 0
      )`,
      `CREATE TABLE IF NOT EXISTS days (
        date TEXT PRIMARY KEY,
        "values" TEXT NOT NULL DEFAULT '{}',
        feelings_md TEXT NOT NULL DEFAULT '',
        tags TEXT NOT NULL DEFAULT '[]'
      )`,
      `CREATE TABLE IF NOT EXISTS scrim_matches (
        id TEXT PRIMARY KEY,
        date TEXT NOT NULL,
        kind TEXT NOT NULL,
        opponent TEXT NOT NULL DEFAULT '',
        map TEXT NOT NULL DEFAULT '',
        agent TEXT NOT NULL DEFAULT '',
        result TEXT,
        rounds_won INTEGER,
        rounds_lost INTEGER,
        kills INTEGER,
        deaths INTEGER,
        acs INTEGER,
        vod_url TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT ''
      )`,
      `CREATE INDEX IF NOT EXISTS scrim_matches_date ON scrim_matches (date)`,
      `CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )`,
    ],
  },
];

/** Aplica las migraciones pendientes y devuelve las versiones aplicadas. */
export async function migrate(
  driver: SqlDriver,
  migrations: readonly Migration[] = MIGRATIONS,
): Promise<number[]> {
  await driver.execute(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    )`,
  );
  const rows = await driver.select<{ version: number }>(
    "SELECT version FROM schema_migrations",
  );
  const done = new Set(rows.map((row) => row.version));

  const applied: number[] = [];
  const pending = [...migrations]
    .sort((a, b) => a.version - b.version)
    .filter((migration) => !done.has(migration.version));

  for (const migration of pending) {
    for (const statement of migration.statements) {
      await driver.execute(statement);
    }
    await driver.execute(
      "INSERT OR IGNORE INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)",
      [migration.version, migration.name, new Date().toISOString()],
    );
    applied.push(migration.version);
  }
  return applied;
}
