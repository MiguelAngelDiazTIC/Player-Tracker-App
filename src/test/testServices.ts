import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { EDITIONS, type EditionId } from "../app/edition";
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
  /** Archivos binarios (Excel, CSV) "guardados" con el diálogo. */
  savedBinaries: { name: string; bytes: Uint8Array }[];
  /** Contenido de la carpeta `copias/`, por nombre de archivo. */
  copies: Map<string, string>;
  backups: number;
}

/** Servicios en memoria: SQLite de `node:sqlite` y un sistema sin diálogos. */
export async function createTestServices({
  tutorialSeen = true,
  edition: editionId = "base",
}: {
  /** Las pruebas arrancan con el tutorial ya visto, salvo las suyas. */
  tutorialSeen?: boolean;
  edition?: EditionId;
} = {}): Promise<TestServices> {
  const edition = EDITIONS[editionId];
  const repository = createRepository(
    createMemoryDriver(),
    edition.defaultFields,
  );
  await repository.init();

  const test: Pick<
    TestServices,
    "filesToPick" | "savedFiles" | "savedBinaries" | "copies" | "backups"
  > = {
    filesToPick: [],
    savedFiles: [],
    savedBinaries: [],
    copies: new Map(),
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
    async saveFile({ defaultName, bytes }) {
      test.savedBinaries.push({ name: defaultName, bytes });
      return `C:/exportado/${defaultName}`;
    },
    backupFolder: {
      async list() {
        return [...test.copies.keys()];
      },
      async write(name, text) {
        test.copies.set(name, text);
      },
      async remove(name) {
        test.copies.delete(name);
      },
    },
    async backupDatabase() {
      test.backups += 1;
      return `C:/datos-de-prueba/backups/tracker-${test.backups}.db`;
    },
    tutorialSeen,
    async markTutorialSeen() {
      platform.tutorialSeen = true;
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

  return Object.assign(test, { repository, platform, edition });
}
