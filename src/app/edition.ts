import {
  DEFAULT_FIELDS,
  withManualScrimCount,
  type FieldDefinition,
} from "../domain/fields";
import { APP_NAME } from "./brand";

export const EDITION_IDS = ["base", "saiz"] as const;
export type EditionId = (typeof EDITION_IDS)[number];

/**
 * Variante de la app que se elige al compilar (`VITE_EDITION`). Las dos salen
 * del mismo código y leen los mismos datos; cambia lo que se enseña.
 */
export interface Edition {
  id: EditionId;
  /** Nombre que se muestra: bienvenida, "Acerca de" y carpeta propuesta. */
  name: string;
  /** Línea bajo el nombre de la app en la barra lateral. */
  tagline: string;
  /**
   * Con registro de scrims y 10mans (una entrada por partida) la columna del
   * día se calcula sola; sin él, es un número que se escribe a mano.
   */
  scrimLog: boolean;
  /** Campos con los que se siembra una carpeta de datos nueva. */
  defaultFields: readonly FieldDefinition[];
}

export const EDITIONS: Record<EditionId, Edition> = {
  base: {
    id: "base",
    name: APP_NAME,
    tagline: "Road to Top 1",
    scrimLog: true,
    defaultFields: DEFAULT_FIELDS,
  },
  saiz: {
    id: "saiz",
    name: `${APP_NAME} Saiz Edition`,
    tagline: "Saiz Edition",
    scrimLog: false,
    defaultFields: withManualScrimCount(DEFAULT_FIELDS),
  },
};

/** La edición de `VITE_EDITION`; sin valor, la base. */
export function resolveEdition(id: string | undefined): Edition {
  if (id === undefined || id === "") return EDITIONS.base;
  if ((EDITION_IDS as readonly string[]).includes(id)) {
    return EDITIONS[id as EditionId];
  }
  // Un nombre mal escrito no debe compilar la edición base sin avisar.
  throw new Error(
    `VITE_EDITION="${id}" no es una edición. Usa: ${EDITION_IDS.join(", ")}.`,
  );
}
