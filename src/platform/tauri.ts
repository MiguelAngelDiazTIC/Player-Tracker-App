import { convertFileSrc } from "@tauri-apps/api/core";
import { appConfigDir, documentDir, join, sep } from "@tauri-apps/api/path";
import { open, save } from "@tauri-apps/plugin-dialog";
import {
  copyFile,
  exists,
  mkdir,
  readDir,
  readFile,
  readTextFile,
  remove,
  writeFile,
  writeTextFile,
} from "@tauri-apps/plugin-fs";
import { fetch as httpFetch } from "@tauri-apps/plugin-http";
import Database from "@tauri-apps/plugin-sql";
import { APP_NAME } from "../app/brand";
import type { PickedFile, Platform, Services } from "../app/services";
import type { BackupFolder } from "../data/autoBackup";
import type { AttachmentStore } from "../data/backup";
import type { HttpClient } from "../data/henrikSync";
import type { SqlDriver } from "../data/driver";
import { createRepository } from "../data/repository";

const DATABASE_FILE = "tracker.db";
const ATTACHMENTS_DIR = "attachments";
const BACKUPS_DIR = "backups";
/** Copias automáticas en JSON; `backups/` guarda las de `tracker.db`. */
const COPIES_DIR = "copias";
/**
 * La ruta de la carpeta de datos no puede vivir en `tracker.db` (está dentro
 * de esa carpeta), así que se guarda en la configuración de la app.
 */
const CONFIG_FILE = "config.json";

async function configPath(): Promise<string> {
  return join(await appConfigDir(), CONFIG_FILE);
}

/** Lo que la app recuerda de este equipo, fuera de la carpeta de datos. */
interface AppConfig {
  dataFolder?: string;
  tutorialSeen?: boolean;
}

async function readConfig(): Promise<AppConfig> {
  const path = await configPath();
  if (!(await exists(path))) return {};
  try {
    const raw: unknown = JSON.parse(await readTextFile(path));
    if (typeof raw !== "object" || raw === null) return {};
    const config: AppConfig = {};
    if ("dataFolder" in raw && typeof raw.dataFolder === "string") {
      config.dataFolder = raw.dataFolder;
    }
    if ("tutorialSeen" in raw && raw.tutorialSeen === true) {
      config.tutorialSeen = true;
    }
    return config;
  } catch {
    return {};
  }
}

/** Cambia parte de la configuración sin perder el resto. */
async function writeConfig(change: AppConfig): Promise<void> {
  const current = await readConfig();
  const config = { ...current, ...change };
  // Sin cambios no se toca el archivo: una escritura cortada a medias (un
  // apagón, la app cerrada a la fuerza) lo dejaría vacío.
  if (JSON.stringify(config) === JSON.stringify(current)) return;
  await mkdir(await appConfigDir(), { recursive: true });
  await writeTextFile(await configPath(), JSON.stringify(config, null, 2));
}

/** Carpeta de datos elegida en un arranque anterior, si la hay. */
export async function readConfiguredFolder(): Promise<string | null> {
  return (await readConfig()).dataFolder ?? null;
}

const writeConfiguredFolder = (folder: string) =>
  writeConfig({ dataFolder: folder });

export async function suggestDataFolder(): Promise<string> {
  return join(await documentDir(), APP_NAME);
}

export async function pickFolder(title: string): Promise<string | null> {
  const folder = await open({ title, directory: true, multiple: false });
  return typeof folder === "string" ? folder : null;
}

export async function folderHasData(folder: string): Promise<boolean> {
  return exists(await join(folder, DATABASE_FILE));
}

/**
 * Selector de archivos del propio navegador: el archivo llega ya leído, sin
 * pasar por el sistema de archivos de Tauri.
 */
function pickFile({
  extensions,
}: {
  title: string;
  extensions: string[];
}): Promise<PickedFile | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = extensions.map((extension) => `.${extension}`).join(",");
    input.addEventListener("cancel", () => resolve(null));
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      file
        .arrayBuffer()
        .then((buffer) =>
          resolve({ name: file.name, bytes: new Uint8Array(buffer) }),
        )
        .catch(reject);
    });
    input.click();
  });
}

/**
 * Peticiones desde el lado nativo: el navegador las bloquearía por CORS. El
 * permiso de Tauri solo deja salir hacia api.henrikdev.xyz.
 */
const http: HttpClient = {
  async get(url, headers) {
    const response = await httpFetch(url, { method: "GET", headers });
    const wait = Number(
      response.headers.get("retry-after") ??
        response.headers.get("x-ratelimit-reset"),
    );
    return {
      status: response.status,
      body: await response.json().catch(() => null),
      retryAfterSeconds: Number.isFinite(wait) && wait > 0 ? wait : null,
    };
  },
};

async function openDriver(databasePath: string): Promise<SqlDriver> {
  const database = await Database.load(`sqlite:${databasePath}`);
  return {
    async execute(sql, params = []) {
      await database.execute(sql, [...params]);
    },
    select<T>(sql: string, params: readonly (string | number | null)[] = []) {
      return database.select<T[]>(sql, [...params]);
    },
    async close() {
      await database.close();
    },
  };
}

const FILE_KINDS: Record<string, string> = {
  json: "JSON",
  xlsx: "Excel",
  csv: "CSV",
};

/** Diálogo de guardar, con el filtro que corresponde a la extensión. */
async function askSavePath(
  title: string,
  defaultName: string,
): Promise<string | null> {
  const extension = defaultName.split(".").pop() ?? "";
  return save({
    title,
    defaultPath: defaultName,
    filters: [
      { name: FILE_KINDS[extension] ?? extension, extensions: [extension] },
    ],
  });
}

function timestamp(now: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return (
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  );
}

async function listFiles(folder: string): Promise<string[]> {
  if (!(await exists(folder))) return [];
  return (await readDir(folder))
    .filter((entry) => entry.isFile)
    .map((entry) => entry.name);
}

/** Abre (o crea) la carpeta de datos y la deja como la carpeta de la app. */
export async function openDataFolder(folder: string): Promise<Services> {
  const attachmentsFolder = await join(folder, ATTACHMENTS_DIR);
  const databasePath = await join(folder, DATABASE_FILE);
  await mkdir(attachmentsFolder, { recursive: true });

  const driver = await openDriver(databasePath);
  const repository = createRepository(driver);
  await repository.init();
  await writeConfiguredFolder(folder);
  const { tutorialSeen = false } = await readConfig();

  /**
   * Copia coherente de la base de datos en otro archivo. SQLite trabaja con
   * un diario aparte (`tracker.db-wal`), así que copiar solo `tracker.db`
   * podría dejarse fuera los últimos cambios.
   */
  const copyDatabase = (target: string) =>
    driver.execute("VACUUM INTO ?", [target]);

  const attachments: AttachmentStore = {
    list: () => listFiles(attachmentsFolder),
    async read(name) {
      return readFile(await join(attachmentsFolder, name));
    },
    async write(name, bytes) {
      await writeFile(await join(attachmentsFolder, name), bytes);
    },
  };

  const copiesFolder = await join(folder, COPIES_DIR);
  const backupFolder: BackupFolder = {
    list: () => listFiles(copiesFolder),
    async write(name, text) {
      await mkdir(copiesFolder, { recursive: true });
      await writeTextFile(await join(copiesFolder, name), text);
    },
    async remove(name) {
      await remove(await join(copiesFolder, name));
    },
  };

  const platform: Platform = {
    dataFolder: folder,
    attachments,
    http,
    attachmentUrl: (name) =>
      convertFileSrc(`${attachmentsFolder}${sep()}${name}`),

    pickFile,

    async saveTextFile({ title, defaultName, text }) {
      const path = await askSavePath(title, defaultName);
      if (path === null) return null;
      await writeTextFile(path, text);
      return path;
    },

    async saveFile({ title, defaultName, bytes }) {
      const path = await askSavePath(title, defaultName);
      if (path === null) return null;
      await writeFile(path, bytes);
      return path;
    },

    backupFolder,

    async backupDatabase() {
      const backups = await join(folder, BACKUPS_DIR);
      await mkdir(backups, { recursive: true });
      const target = await join(backups, `tracker-${timestamp(new Date())}.db`);
      await copyDatabase(target);
      return target;
    },

    tutorialSeen,
    async markTutorialSeen() {
      await writeConfig({ tutorialSeen: true });
      platform.tutorialSeen = true;
    },

    pickFolder,
    folderHasData,

    async switchDataFolder(target, mode) {
      if (mode === "copy") {
        const targetAttachments = await join(target, ATTACHMENTS_DIR);
        await mkdir(targetAttachments, { recursive: true });
        await copyDatabase(await join(target, DATABASE_FILE));
        for (const name of await listFiles(attachmentsFolder)) {
          await copyFile(
            await join(attachmentsFolder, name),
            await join(targetAttachments, name),
          );
        }
      }
      await driver.close();
      await writeConfiguredFolder(target);
      window.location.reload();
    },
  };

  return { repository, platform };
}
