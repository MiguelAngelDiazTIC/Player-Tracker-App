# Servidor de sincronización de MikaLog

Un Worker de Cloudflare que guarda la clave de Riot y el cliente de Riot Sign On (RSO) y hace por la app las llamadas a Riot. Existe porque Riot no permite meter la clave en un programa que se reparte. Misma licencia que la app (GPL-3.0-or-later).

No tiene base de datos de usuarios. Lo único que guarda, en un almacén KV y con caducidad:

- El resultado de un inicio de sesión (Riot ID, región y token de refresco), **5 minutos como mucho** y hasta que la app lo recoge.
- Los nombres de agentes y mapas del juego, 1 día. No son datos de nadie.

No escribe registros (`observability` está desactivado) y no guarda partidas.

## Rutas

| Ruta                         | Quién la llama                   | Qué hace                                                                                             |
| ---------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `GET /`                      | Cualquiera                       | `{ name, configured }`: si los secretos están puestos                                                |
| `GET /rso/login?challenge=…` | El navegador, abierto por la app | Redirige a la página de inicio de sesión de Riot                                                     |
| `GET /rso/callback`          | Riot, al volver                  | Cambia el código por los tokens, lee la cuenta y lo deja en KV. Muestra «Ya puedes volver a MikaLog» |
| `POST /rso/result`           | La app, cada pocos segundos      | Entrega el resultado una sola vez y lo borra                                                         |
| `POST /sync`                 | La app, al pulsar Sincronizar    | Devuelve las partidas del jugador en un intervalo                                                    |

Mientras falte algún secreto, todas menos `GET /` responden `503` con `{"error":"not_configured"}`. Así el servidor se puede desplegar antes de que Riot apruebe la clave.

### Inicio de sesión

1. La app crea un secreto aleatorio (`verifier`, de 43 a 128 caracteres `A-Z a-z 0-9 - . _ ~`) y calcula su reto: el SHA-256 en base64url, 43 caracteres.
2. Abre el navegador en `/rso/login?challenge=<reto>`. El reto viaja a Riot como `state`.
3. Riot vuelve a `/rso/callback`. El servidor guarda el resultado bajo el reto.
4. La app pregunta con `POST /rso/result` y el cuerpo `{"verifier":"…"}`.

El reto pasa por el navegador y por Riot, pero para recoger el token hace falta el secreto, que no sale de la app.

Respuestas de `/rso/result`:

```jsonc
{ "status": "pending" }                          // aún no ha vuelto de Riot, o ya caducó
{ "status": "ready",
  "account": { "gameName": "Saiz", "tagLine": "EUW", "shard": "eu" },
  "refreshToken": "…" }
{ "status": "error", "error": "denied" }         // o "no_valorant", o "failed"
```

### Sincronizar

```jsonc
// POST /sync
{
  "refreshToken": "…", // el que guarda la app
  "shard": "eu", // el de la cuenta: ap, br, eu, kr, latam o na
  "from": 1791410400000, // inicio del día local, en milisegundos
  "to": 1791496800000, // fin (no incluido); como mucho 48 horas después
  "queues": ["competitive"], // opcional; también premier, unrated y swiftplay
  "known": ["id-de-partida"], // opcional; partidas que la app ya tiene y no hay que traer
}
```

```jsonc
// 200
{
  "matches": [
    {
      "matchId": "…",
      "queueId": "competitive",
      "startedAtMillis": 1791450000000,
      "map": "Ascent",
      "agent": "Jett",
      "result": "win",
      "kills": 20,
      "deaths": 10,
      "score": 5000,
      "rounds": 20,
    },
  ],
  "truncated": false, // true si había más de 30: se repite con `known`
  "refreshToken": null, // el nuevo, si Riot lo ha cambiado
}
```

El formato de cada partida es `riotMatchSchema`, en `src/domain/riotMatches.ts`. El servidor renueva la sesión, pregunta a Riot de quién es (`accounts/me`) y solo lee las partidas de ese jugador: no hay forma de pedir las de otro.

Errores, siempre como `{ "error", "message", "retryAfterSeconds" }`:

| Código HTTP | `error`          | Qué significa                                                    |
| ----------- | ---------------- | ---------------------------------------------------------------- |
| 400         | `bad_request`    | La petición no es válida                                         |
| 401         | `auth`           | Riot ya no acepta la sesión: hay que volver a conectar la cuenta |
| 429         | `rate_limit`     | Riot pide esperar; `Retry-After` dice cuánto                     |
| 502         | `riot`           | Riot ha fallado                                                  |
| 503         | `not_configured` | Faltan los secretos                                              |

## Desarrollo

No tiene dependencias propias: usa `fetch`, `crypto` y poco más. Las pruebas (`server/src/worker.test.ts`) simulan a Riot y se lanzan con el `npm test` de la raíz.

```powershell
npm run server:dev
```

Abre el Worker en `http://localhost:8787` con un KV local. Para probar con secretos de mentira, crea `server/.dev.vars` (no se sube):

```
RIOT_API_KEY=…
RSO_CLIENT_ID=…
RSO_CLIENT_SECRET=…
```

## Desplegar

La primera vez, desde la raíz del repositorio:

1. Inicia sesión en Cloudflare: `npx wrangler@4 login`.
2. Crea el almacén: `npx wrangler@4 kv namespace create KV --config server/wrangler.toml`. Copia el `id` que devuelve en `server/wrangler.toml`, en lugar de `PON_AQUI_EL_ID_DEL_NAMESPACE`. Ese id no es secreto y se sube al repositorio.
3. Despliega: `npm run server:deploy`. Sustituye al Worker de ejemplo que reservaba la dirección.
4. Comprueba `https://mikalog-sync.miguelangeldiaztic.workers.dev/`: debe responder `{"name":"mikalog-sync","configured":false}`.

Cuando Riot apruebe la clave de producción y dé el cliente de RSO:

1. En el portal de Riot, la URL de vuelta de RSO es `https://mikalog-sync.miguelangeldiaztic.workers.dev/rso/callback`.
2. Guarda los tres secretos (cada comando pide el valor; no se escribe en ningún archivo):

   ```powershell
   npx wrangler@4 secret put RIOT_API_KEY --config server/wrangler.toml
   npx wrangler@4 secret put RSO_CLIENT_ID --config server/wrangler.toml
   npx wrangler@4 secret put RSO_CLIENT_SECRET --config server/wrangler.toml
   ```

3. `GET /` pasa a decir `"configured": true`.

## Sin comprobar contra Riot

Todo esto está escrito con la documentación de Riot y probado contra un Riot simulado, porque sin clave de producción no hay acceso a `VAL-MATCH-V1` ni a RSO. Al tener la clave hay que confirmar con una cuenta real:

- Los nombres de los campos de la partida (`matchInfo`, `players[].stats`, `teams[].won`) y que `mapId` coincide con el `assetPath` de `VAL-CONTENT-V1`.
- Los valores de `queueId` (`competitive`, `premier`, `unrated`, `swiftplay`).
- Que el token de RSO se renueva con `grant_type=refresh_token` y autenticación básica, y si Riot devuelve un token de refresco nuevo cada vez.
