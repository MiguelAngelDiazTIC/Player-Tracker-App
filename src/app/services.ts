import type { BackupFolder } from "../data/autoBackup";
import type { AttachmentStore } from "../data/backup";
import type { HttpClient } from "../data/henrikSource";
import type { Repository } from "../data/repository";
import type { Edition } from "./edition";

export interface PickedFile {
  name: string;
  bytes: Uint8Array;
}

/**
 * Almacén de credenciales del sistema (en Windows, el Administrador de
 * credenciales). Lo que se guarda aquí no está en la base de datos, así que
 * no sale en las exportaciones ni en las copias.
 */
export interface SecretStore {
  get(name: string): Promise<string | null>;
  /** Con `null`, borra el secreto. */
  set(name: string, value: string | null): Promise<void>;
}

/**
 * Todo lo que depende del sistema: diálogos, archivos y carpeta de datos.
 * En la app lo implementa Tauri; en las pruebas, un doble en memoria.
 */
export interface Platform {
  /** Carpeta que contiene `tracker.db` y `attachments/`. */
  dataFolder: string;
  attachments: AttachmentStore;
  /** Peticiones a HenrikDev; solo se usan cuando el usuario sincroniza. */
  http: HttpClient;
  secrets: SecretStore;
  /** URL con la que el editor puede pintar una imagen de `attachments/`. */
  attachmentUrl(name: string): string;
  pickFile(options: {
    title: string;
    extensions: string[];
  }): Promise<PickedFile | null>;
  /** Guarda un texto donde elija el usuario; devuelve la ruta o `null`. */
  saveTextFile(options: {
    title: string;
    defaultName: string;
    text: string;
  }): Promise<string | null>;
  /** Guarda un archivo (Excel, CSV) donde elija el usuario. */
  saveFile(options: {
    title: string;
    defaultName: string;
    bytes: Uint8Array;
  }): Promise<string | null>;
  /** Carpeta `copias/` de la carpeta de datos, con las copias automáticas. */
  backupFolder: BackupFolder;
  /** Copia `tracker.db` a `backups/` y devuelve la ruta de la copia. */
  backupDatabase(): Promise<string>;
  /** `true` si el tutorial ya se vio en este equipo. */
  tutorialSeen: boolean;
  /** Recuerda en este equipo que el tutorial ya se vio. */
  markTutorialSeen(): Promise<void>;
  pickFolder(title: string): Promise<string | null>;
  folderHasData(folder: string): Promise<boolean>;
  /**
   * Cambia la carpeta de datos y reinicia la app. Con `copy`, lleva los datos
   * actuales a la carpeta nueva; con `use`, abre los que ya hay en ella.
   */
  switchDataFolder(folder: string, mode: "copy" | "use"): Promise<void>;
}

export interface Services {
  repository: Repository;
  platform: Platform;
  /** Variante de la app que se ha compilado. */
  edition: Edition;
}
