export type SqlValue = string | number | null;

/**
 * Lo mínimo que la app necesita de SQLite. En la app lo implementa
 * `tauri-plugin-sql`; en las pruebas, `node:sqlite` en memoria.
 */
export interface SqlDriver {
  execute(sql: string, params?: readonly SqlValue[]): Promise<void>;
  select<T>(sql: string, params?: readonly SqlValue[]): Promise<T[]>;
  close(): Promise<void>;
}
