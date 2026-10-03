import logoUrl from "../../src-tauri/icons/logo.svg";

/**
 * Nombre y logo de la app. El identificador de Tauri y el `format` del JSON
 * no llevan el nombre: cambiarlos rompería instalaciones y copias antiguas.
 */
export const APP_NAME = "MikaLog";

/** El archivo maestro del logo; de él salen también los iconos de Tauri. */
export const APP_LOGO_URL: string = logoUrl;

/** Prefijo de los archivos que la app propone al exportar. */
export const APP_FILE_PREFIX = "mikalog";
