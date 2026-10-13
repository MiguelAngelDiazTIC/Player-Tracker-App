/**
 * Cómo sacar la clave de HenrikDev. Un solo texto para la tarjeta de Ajustes
 * y el tutorial; la versión larga está en `docs/GUIA-HENRIKDEV.md`.
 */

/** La app no abre enlaces: se enseña como texto que se puede copiar. */
export const HENRIK_DISCORD_URL = "https://discord.com/invite/X3GaVkX2YN";

/** Con lo que empieza una clave, para reconocerla al pegarla. */
export const HENRIK_KEY_PREFIX = "HDEV-";

export const HENRIK_INTRO =
  "Opcional. HenrikDev es un servicio gratuito y no oficial que lee tu historial de VALORANT. Con tu clave, «Sincronizar» trae tus partidas y rellena solo las rankeds, el K/D, el ACS, los agentes y los mapas del día.";

export interface GuideStep {
  /** Versión corta, para el tutorial. */
  short: string;
  text: string;
  /** Texto para copiar que acompaña al paso. */
  copy?: string;
}

export const HENRIK_GUIDE: readonly GuideStep[] = [
  {
    short: "Entra en el Discord de HenrikDev.",
    text: "Entra en el Discord de HenrikDev. Copia esta dirección y ábrela en tu navegador:",
    copy: HENRIK_DISCORD_URL,
  },
  {
    short: "Completa la verificación del servidor.",
    text: "Completa la verificación que te pide el servidor.",
  },
  {
    short: "En #get-a-key, elige VALORANT y la clave Basic.",
    text: "Ve al canal #get-a-key, elige VALORANT en el desplegable y después la clave Basic. Es gratis.",
  },
  {
    short: `Copia la clave (empieza por ${HENRIK_KEY_PREFIX}) y pégala en Ajustes.`,
    text: `Copia la clave (empieza por ${HENRIK_KEY_PREFIX}) y pégala aquí abajo, con tu Riot ID y tu región. Pulsa «Probar conexión».`,
  },
];

export const HENRIK_PRIVACY =
  "Tu Riot ID y tu clave solo salen de tu ordenador cuando pulsas Sincronizar o Probar conexión, y solo hacia api.henrikdev.xyz. La clave se guarda en el almacén de credenciales de Windows y nunca va en tus copias ni exportaciones.";
