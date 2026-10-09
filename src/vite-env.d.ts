/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Edición que se compila: `base` (por defecto) o `saiz`. */
  readonly VITE_EDITION?: string;
}
