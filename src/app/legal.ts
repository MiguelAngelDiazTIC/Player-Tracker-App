import { version } from "../../package.json";
import { APP_NAME } from "./brand";

/**
 * Créditos y avisos legales que enseña la app. La versión larga está en
 * `NOTICE.md`; la licencia obliga a conservar la atribución al autor.
 */
export const APP_VERSION: string = version;
export const APP_AUTHOR = "Miguel Ángel Díaz Gutiérrez (MikaEl)";
export const APP_COPYRIGHT = `Copyright © 2026 ${APP_AUTHOR}`;
export const APP_LICENSE_NAME = "GPL-3.0-or-later";
export const APP_REPOSITORY_URL =
  "https://github.com/MiguelAngelDiazTIC/Player-Tracker-App";
export const APP_CONTACT_EMAIL = "miguelangeldiaztic@gmail.com";

export const PRIVACY_SHORT = "Tus datos no salen de tu ordenador.";

export const LEGAL_NOTICES: { title: string; text: string }[] = [
  {
    title: "Licencia",
    text: "Software libre bajo la GPL-3.0. Puedes usarlo, estudiarlo, modificarlo y compartirlo; si repartes una versión modificada, debe tener la misma licencia y conservar estos créditos. Sin garantía de ningún tipo.",
  },
  {
    title: "Privacidad",
    text: `${APP_NAME} no recoge ni envía ningún dato. Todo lo que apuntas se queda en la carpeta de datos de tu ordenador.`,
  },
  {
    title: "Riot Games",
    text: `${APP_NAME} no está avalado por Riot Games ni refleja sus opiniones. Valorant y Riot Games son marcas de Riot Games, Inc.`,
  },
];

/** Texto completo de la GPL, incluido en la app al compilar. */
export const loadLicenseText = () =>
  import("../../LICENSE?raw").then((module) => module.default);

/** Licencias del software de terceros; se carga solo al pedirlo, porque pesa. */
export const loadThirdPartyNotices = () =>
  import("../../THIRD-PARTY-NOTICES.md?raw").then((module) => module.default);
