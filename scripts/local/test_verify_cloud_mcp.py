"""Checks for the verifier's endpoint and token handling (no server needed)."""

import importlib.util
from pathlib import Path

import pytest

_spec = importlib.util.spec_from_file_location(
    "verify_cloud_mcp", Path(__file__).with_name("verify_cloud_mcp.py")
)
verify = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(verify)

GATEWAY = "https://remarkable-mcp.example.workers.dev/mcp"


def test_loopback_needs_no_token():
    assert verify.auth_headers("http://127.0.0.1:8000/mcp", {}) == {}
    assert verify.auth_headers("http://localhost:8000/mcp", {}) == {}
    assert verify.auth_headers("http://[::1]:8000/mcp", {}) == {}


def test_remote_sends_the_token_from_the_environment():
    headers = verify.auth_headers(GATEWAY, {verify.TOKEN_ENV: " secret-value "})
    assert headers == {"Authorization": "Bearer secret-value"}


def test_remote_without_a_token_is_refused():
    with pytest.raises(verify.CheckFailed, match=verify.TOKEN_ENV):
        verify.auth_headers(GATEWAY, {})


def test_failure_names_a_check_inside_an_exception_group():
    class Group(Exception):
        def __init__(self, *inner):
            super().__init__("group")
            self.exceptions = inner

    nested = Group(RuntimeError("noise"), Group(verify.CheckFailed("the real reason")))
    assert verify.describe_failure(nested) == "the real reason"
    assert verify.describe_failure(RuntimeError("x")) == "RuntimeError"


def test_remote_plain_http_is_refused_even_with_a_token():
    with pytest.raises(verify.CheckFailed, match="https"):
        verify.auth_headers("http://example.com/mcp", {verify.TOKEN_ENV: "secret-value"})
