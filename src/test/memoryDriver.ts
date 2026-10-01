import { DatabaseSync } from "node:sqlite";
import type { AttachmentStore } from "../data/backup";
import type { SqlDriver, SqlValue } from "../data/driver";

/** SQLite en memoria con la misma interfaz que el driver de Tauri. */
export function createMemoryDriver(): SqlDriver {
  const database = new DatabaseSync(":memory:");
  return {
    async execute(sql, params = []) {
      database.prepare(sql).run(...params);
    },
    async select<T>(sql: string, params: readonly SqlValue[] = []) {
      return database
        .prepare(sql)
        .all(...params)
        .map((row) => ({ ...row })) as T[];
    },
    async close() {
      database.close();
    },
  };
}

export function createMemoryAttachments(
  files: Record<string, Uint8Array> = {},
): AttachmentStore & { files: Record<string, Uint8Array> } {
  return {
    files,
    async list() {
      return Object.keys(files);
    },
    async read(name) {
      return files[name];
    },
    async write(name, bytes) {
      files[name] = bytes;
    },
  };
}
