// The gateway's request handling, kept free of Cloudflare-only imports so it
// can be tested in plain Node. index.ts wires it to the real container binding.
//
// Build step 3 (this file): one temporary bearer token, one user.
// Build step 4 replaces checkBearer with the Workers OAuth Provider.

/** Header the gateway uses to tell the container class whose instance this is. */
export const USER_HEADER = "x-remarkable-gateway-user";

/** The Host the Python server accepts (deploy/cloudflare/serve.py). */
export const CONTAINER_HOST = "container";

/** Path the MCP server serves Streamable HTTP on. */
export const MCP_PATH = "/mcp";

/** Users allowed in phase 1, and the secret holding each one's reMarkable token. */
export const USERS: Record<string, { tokenSecret: string }> = {
  david: { tokenSecret: "REMARKABLE_TOKEN_DAVID" },
};

/** The user the temporary single bearer token stands for. */
export const TEMPORARY_TOKEN_USER = "david";

export interface GatewayEnv {
  GATEWAY_TOKEN?: string;
}

/** Something that can forward a request to one user's container. */
export interface ContainerStub {
  fetch(request: Request): Promise<Response>;
}

export interface GatewayDeps {
  stubFor(userId: string): ContainerStub;
  now?: () => number;
  log?: (line: string) => void;
}

/** Compare two strings in time that depends only on their lengths. */
export function constantTimeEqual(a: string, b: string): boolean {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  let diff = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i++) {
    diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  }
  return diff === 0;
}

/** Return the user id for a valid bearer token, or null. */
export function checkBearer(request: Request, env: GatewayEnv): string | null {
  const expected = env.GATEWAY_TOKEN;
  if (!expected) return null;
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) return null;
  return constantTimeEqual(match[1].trim(), expected) ? TEMPORARY_TOKEN_USER : null;
}

/**
 * Build the request the container sees: same path, query, method and body;
 * Host "container"; no Origin; no credentials meant for the gateway.
 */
export function toContainerRequest(request: Request, userId: string): Request {
  const url = new URL(request.url);
  url.protocol = "http:";
  url.host = CONTAINER_HOST;
  const forwarded = new Request(url.toString(), request);
  forwarded.headers.delete("authorization");
  forwarded.headers.delete("cookie");
  forwarded.headers.delete("origin");
  forwarded.headers.delete("host");
  forwarded.headers.set(USER_HEADER, userId);
  return forwarded;
}

function unauthorized(): Response {
  return new Response("Unauthorized", {
    status: 401,
    headers: { "www-authenticate": 'Bearer realm="remarkable-mcp"' },
  });
}

export async function handleGateway(
  request: Request,
  env: GatewayEnv,
  deps: GatewayDeps,
): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname !== MCP_PATH && !url.pathname.startsWith(`${MCP_PATH}/`)) {
    return new Response("Not found", { status: 404 });
  }

  const userId = checkBearer(request, env);
  if (!userId || !(userId in USERS)) return unauthorized();

  const now = deps.now ?? Date.now;
  const log = deps.log ?? ((line: string) => console.log(line));
  const started = now();
  let status = 502;
  try {
    const response = await deps.stubFor(userId).fetch(toContainerRequest(request, userId));
    status = response.status;
    return response;
  } catch (error) {
    log(`gateway error user=${userId}: ${error instanceof Error ? error.message : "unknown"}`);
    return new Response("The reMarkable server did not respond", { status: 502 });
  } finally {
    // Timing for the cold-start test. Never log headers or bodies: they carry tokens.
    log(`mcp ${request.method} user=${userId} status=${status} ms=${now() - started}`);
  }
}
