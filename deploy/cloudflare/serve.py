"""Start remarkable-mcp inside a Cloudflare Container.

Why this file exists: upstream's CLI refuses wildcard bind addresses
(``--host 0.0.0.0``) and only accepts requests whose ``Host`` matches the bind
address. Inside a container the server has to listen on every interface, and
the only client is the gateway Worker, which sends ``Host: container`` and no
``Origin``. So this launcher starts the same server object on ``0.0.0.0`` with a
Host allowlist of exactly that name. Nothing outside Cloudflare can reach the
container's port; the Worker in front of it does the authentication.

Settings come from the environment (see deploy/cloudflare/README.md).
"""

import os

from mcp.server.transport_security import TransportSecuritySettings

GATEWAY_HOST = os.environ.get("REMARKABLE_GATEWAY_HOST", "container")
PORT = int(os.environ.get("REMARKABLE_MCP_PORT", "8000"))


def transport_security(gateway_host: str = GATEWAY_HOST) -> TransportSecuritySettings:
    """Accept only the Host the gateway sends; reject any browser Origin."""
    return TransportSecuritySettings(
        enable_dns_rebinding_protection=True,
        allowed_hosts=[gateway_host, f"{gateway_host}:*"],
        allowed_origins=[],
    )


def main() -> None:
    from remarkable_mcp.server import mcp

    mcp.run(
        transport="streamable-http",
        host="0.0.0.0",
        port=PORT,
        transport_security=transport_security(),
    )


if __name__ == "__main__":
    main()
