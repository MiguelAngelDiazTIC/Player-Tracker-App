/** Lo que el servidor usa de un almacén KV de Cloudflare. */
export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  put(
    key: string,
    value: string,
    options?: { expirationTtl?: number },
  ): Promise<void>;
  delete(key: string): Promise<void>;
}

/**
 * Entorno del Worker. La clave y el cliente de RSO son secretos
 * (`wrangler secret put`); mientras falten, el servidor responde 503.
 */
export interface Env {
  RIOT_API_KEY?: string;
  RSO_CLIENT_ID?: string;
  RSO_CLIENT_SECRET?: string;
  /** Solo datos de vida corta: inicios de sesión a medias y nombres del juego. */
  KV: KeyValueStore;
}

export interface Config {
  apiKey: string;
  clientId: string;
  clientSecret: string;
}

/** Los tres secretos, o `null` si falta alguno. */
export function readConfig(env: Env): Config | null {
  const apiKey = env.RIOT_API_KEY?.trim();
  const clientId = env.RSO_CLIENT_ID?.trim();
  const clientSecret = env.RSO_CLIENT_SECRET?.trim();
  if (!apiKey || !clientId || !clientSecret) return null;
  return { apiKey, clientId, clientSecret };
}
