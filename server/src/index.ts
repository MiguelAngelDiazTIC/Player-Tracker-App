import type { Env } from "./env";
import { handle } from "./worker";

/** Entrada del Worker de Cloudflare. */
export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return handle(request, env, (input, init) => fetch(input, init));
  },
};
