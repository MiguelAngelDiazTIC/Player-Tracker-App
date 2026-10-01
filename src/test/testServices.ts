import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { PickedFile, Platform, Services } from "../app/services";
import { createRepository } from "../data/repository";
import { createMemoryAttachments, createMemoryDriver } from "./memoryDriver";

export function fixtureFile(name: string): PickedFile {
  return {
    name,
    // Las pruebas se lanzan desde la raíz del repositorio.
    bytes: new Uint8Array(
      readFileSync(resolve(process.cwd(), "src/test/fixtures", name)),
    ),
  };
}

export interface TestServices extends Services {
  /** Archivos que devolverá el selector, en orden. Vacío = el usuario cancela. */
  filesToPick: PickedFile[];
  /** Textos "guardados" con el diálogo de exportar. */
  savedFiles: { name: string; text: string }[];
  backups: number;
}

/** Servicios en memoria: SQLite de `node:sqlite` y un sistema sin diálogos. */
export async function createTestServices(): Promise<TestServices> {
  const repository = createRepository(createMemoryDriver());
  await repository.init();

  const test: Pick<TestServices, "filesToPick" | "savedFiles" | "backups"> = {
    filesToPick: [],
    savedFiles: [],
    backups: 0,
  };

  const platform: Platform = {
    dataFolder: "C:/datos-de-prueba",
    attachments: createMemoryAttachments(),
    attachmentUrl: (name) => `asset://attachments/${name}`,
    async pickFile() {
      return test.filesToPick.shift() ?? null;
    },
    async saveTextFile({ defaultName, text }) {
      test.savedFiles.push({ name: defaultName, text });
      return `C:/exportado/${defaultName}`;
    },
    async backupDatabase() {
      test.backups += 1;
      return `C:/datos-de-prueba/backups/tracker-${test.backups}.db`;
    },
    async pickFolder() {
      return null;
    },
    async folderHasData() {
      return false;
    },
    async switchDataFolder() {
      // En las pruebas no hay carpeta real que cambiar.
    },
  };

  return Object.assign(test, { repository, platform });
}
