import { describe, expect, it } from "vitest";
import {
  checkBearer,
  constantTimeEqual,
  CONTAINER_HOST,
  handleGateway,
  toContainerRequest,
  USER_HEADER,
} from "../src/gateway";

const TOKEN = "test-gateway-token";
const env = { GATEWAY_TOKEN: TOKEN };

function mcpRequest(headers: Record<string, string> = {}, path = "/mcp"): Request {
  return new Request(`https://remarkable-mcp.example.workers.dev${path}?x=1`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }),
  });
}

function recordingDeps() {
  const seen: { userId: string; request: Request }[] = [];
  const lines: string[] = [];
  let clock = 1000;
  return {
    seen,
    lines,
    deps: {
      stubFor: (userId: string) => ({
        fetch: async (request: Request) => {
          seen.push({ userId, request });
          clock += 42;
          return new Response("ok", { status: 200 });
        },
      }),
      now: () => clock,
      log: (line: string) => lines.push(line),
    },
  };
}

describe("constantTimeEqual", () => {
  it("matches equal strings and rejects different ones", () => {
    expect(constantTimeEqual("abc", "abc")).toBe(true);
    expect(constantTimeEqual("abc", "abd")).toBe(false);
    expect(constantTimeEqual("abc", "abcd")).toBe(false);
    expect(constantTimeEqual("", "")).toBe(true);
  });
});

describe("checkBearer", () => {
  it("accepts the configured token", () => {
    expect(checkBearer(mcpRequest({ authorization: `Bearer ${TOKEN}` }), env)).toBe("david");
  });

  it("rejects a wrong, missing or non-bearer credential", () => {
    expect(checkBearer(mcpRequest({ authorization: "Bearer nope" }), env)).toBeNull();
    expect(checkBearer(mcpRequest(), env)).toBeNull();
    expect(checkBearer(mcpRequest({ authorization: `Basic ${TOKEN}` }), env)).toBeNull();
  });

  it("rejects everything when the secret is not set", () => {
    expect(checkBearer(mcpRequest({ authorization: "Bearer " }), {})).toBeNull();
    expect(checkBearer(mcpRequest({ authorization: `Bearer ${TOKEN}` }), {})).toBeNull();
  });
});

describe("toContainerRequest", () => {
  it("keeps path, query, method and body, and rewrites host and credentials", async () => {
    const original = mcpRequest({
      authorization: `Bearer ${TOKEN}`,
      origin: "https://evil.example",
      cookie: "a=b",
      [USER_HEADER]: "someone-else",
    });
    const forwarded = toContainerRequest(original, "david");
    const url = new URL(forwarded.url);
    expect(url.protocol).toBe("http:");
    expect(url.host).toBe(CONTAINER_HOST);
    expect(url.pathname).toBe("/mcp");
    expect(url.search).toBe("?x=1");
    expect(forwarded.method).toBe("POST");
    expect(forwarded.headers.get("authorization")).toBeNull();
    expect(forwarded.headers.get("origin")).toBeNull();
    expect(forwarded.headers.get("cookie")).toBeNull();
    expect(forwarded.headers.get(USER_HEADER)).toBe("david");
    expect(forwarded.headers.get("content-type")).toBe("application/json");
    expect(await forwarded.json()).toEqual({ jsonrpc: "2.0", id: 1, method: "ping" });
  });
});

describe("handleGateway", () => {
  it("returns 404 off the MCP path without calling the container", async () => {
    const { deps, seen } = recordingDeps();
    const response = await handleGateway(
      mcpRequest({ authorization: `Bearer ${TOKEN}` }, "/"),
      env,
      deps,
    );
    expect(response.status).toBe(404);
    expect(seen).toHaveLength(0);
  });

  it("returns 401 for a bad token without calling the container", async () => {
    const { deps, seen } = recordingDeps();
    const response = await handleGateway(mcpRequest({ authorization: "Bearer no" }), env, deps);
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain("Bearer");
    expect(seen).toHaveLength(0);
  });

  it("forwards a valid request to that user's container and logs timing only", async () => {
    const { deps, seen, lines } = recordingDeps();
    const response = await handleGateway(
      mcpRequest({ authorization: `Bearer ${TOKEN}` }),
      env,
      deps,
    );
    expect(response.status).toBe(200);
    expect(seen).toHaveLength(1);
    expect(seen[0].userId).toBe("david");
    expect(lines).toEqual(["mcp POST user=david status=200 ms=42"]);
    expect(lines.join("\n")).not.toContain(TOKEN);
  });

  it("returns 502 when the container cannot be reached", async () => {
    const lines: string[] = [];
    const response = await handleGateway(mcpRequest({ authorization: `Bearer ${TOKEN}` }), env, {
      stubFor: () => ({
        fetch: async () => {
          throw new Error("container did not start");
        },
      }),
      log: (line) => lines.push(line),
    });
    expect(response.status).toBe(502);
    expect(lines.some((line) => line.includes("status=502"))).toBe(true);
  });
});
