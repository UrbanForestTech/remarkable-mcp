// Gateway Worker: checks the caller, then forwards the MCP request to that
// user's own remarkable-mcp container (one instance per user, by name).

import { Container, getContainer } from "@cloudflare/containers";
import { handleGateway, USER_HEADER, USERS } from "./gateway";

export interface Env {
  REMARKABLE: DurableObjectNamespace<RemarkableContainer>;
  /** Temporary single bearer token (build step 3). */
  GATEWAY_TOKEN?: string;
  /** Per-user reMarkable tokens: REMARKABLE_TOKEN_<USER>, contents of ~/.rmapi. */
  [secret: `REMARKABLE_TOKEN_${string}`]: string | undefined;
}

export class RemarkableContainer extends Container<Env> {
  defaultPort = 8000;
  sleepAfter = "10m";

  override async fetch(request: Request): Promise<Response> {
    // Only the gateway below can reach this object, and it always sets the header.
    const userId = request.headers.get(USER_HEADER) ?? "";
    const user = USERS[userId];
    if (!user) return new Response("Unknown user", { status: 403 });

    const token = (this.env as unknown as Record<string, string | undefined>)[user.tokenSecret];
    if (!token) {
      return new Response(`Secret ${user.tokenSecret} is not set`, { status: 500 });
    }
    // Read when the container starts; a changed secret applies at the next start.
    this.envVars = { REMARKABLE_TOKEN: token };

    const forwarded = new Request(request);
    forwarded.headers.delete(USER_HEADER);
    return super.fetch(forwarded);
  }
}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return handleGateway(request, env, {
      stubFor: (userId) => getContainer(env.REMARKABLE, userId),
    });
  },
} satisfies ExportedHandler<Env>;
