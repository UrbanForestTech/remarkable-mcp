"""Checks for the container launcher (deploy/cloudflare/serve.py)."""

import importlib.util
from pathlib import Path

from mcp.server.transport_security import TransportSecurityMiddleware

_spec = importlib.util.spec_from_file_location(
    "cloudflare_serve", Path(__file__).with_name("serve.py")
)
serve = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(serve)


def _middleware() -> TransportSecurityMiddleware:
    return TransportSecurityMiddleware(serve.transport_security("container"))


def test_accepts_only_the_gateway_host():
    middleware = _middleware()
    assert middleware._validate_host("container")
    assert middleware._validate_host("container:8000")
    assert not middleware._validate_host("remarkable-mcp.example.workers.dev")
    assert not middleware._validate_host("127.0.0.1:8000")
    assert not middleware._validate_host(None)


def test_rejects_any_browser_origin():
    middleware = _middleware()
    assert middleware._validate_origin(None)
    assert not middleware._validate_origin("https://evil.example")
    assert not middleware._validate_origin("http://container")


def test_rebinding_protection_is_on():
    assert serve.transport_security().enable_dns_rebinding_protection
