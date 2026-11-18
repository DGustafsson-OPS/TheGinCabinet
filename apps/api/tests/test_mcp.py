"""The MCP server for AI assistants (app/mcp_gateway.py), spoken to like Claude would."""

import json

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.mcp_gateway import _public_host
from tests.test_api_keys import KEYS

MCP = "/api/v1/mcp"
HEADERS = {"Accept": "application/json, text/event-stream", "Content-Type": "application/json"}


@pytest.fixture
def key(api) -> str:
    return api.post(KEYS, json={"name": "Claude"}).json()["key"]


def rpc(client, method, params=None, path=MCP, key=None):
    headers = {**HEADERS, **({"Authorization": f"Bearer {key}"} if key else {})}
    body = {"jsonrpc": "2.0", "id": 1, "method": method, "params": params or {}}
    return client.post(path, headers=headers, json=body)


def call(client, key, tool, **arguments) -> str:
    r = rpc(client, "tools/call", {"name": tool, "arguments": arguments}, key=key)
    assert r.status_code == 200, r.text
    return r.json()["result"]["content"][0]["text"]


def test_needs_a_valid_key(client, key):
    assert rpc(client, "tools/list").status_code == 401
    assert rpc(client, "tools/list", key="gck_wrong").status_code == 401
    # The key can also be part of the address, for apps that only take an address.
    assert rpc(client, "tools/list", path=f"{MCP}/k/{key}").status_code == 200
    assert rpc(client, "tools/list", path=f"{MCP}/k/gck_wrong").status_code == 401


def test_tools_and_guide(client, key):
    r = rpc(
        client,
        "initialize",
        {
            "protocolVersion": "2025-06-18",
            "capabilities": {},
            "clientInfo": {"name": "t", "version": "1"},
        },
        key=key,
    )
    assert "drafts" in r.json()["result"]["instructions"]
    names = {t["name"] for t in rpc(client, "tools/list", key=key).json()["result"]["tools"]}
    assert names == {
        "site_guide",
        "list_endpoints",
        "describe_endpoint",
        "call_api",
        "upload_image_from_url",
        "upload_image",
    }
    listed = call(client, key, "list_endpoints", search="bottles/levels")
    assert "POST   /api/v1/admin/bottles/levels" in listed
    assert "/auth/" not in call(client, key, "list_endpoints") and "api-keys" not in call(
        client, key, "list_endpoints"
    )
    described = json.loads(
        call(client, key, "describe_endpoint", method="post", path="/api/v1/admin/gins")
    )
    assert "brand" in described["body"]["properties"]


def test_call_api_follows_every_rule(client, key, api):
    created = call(
        client,
        key,
        "call_api",
        method="POST",
        path="/api/v1/admin/gins",
        body={"brand": "Atla", "name": "London Dry", "abv": "45", "style": "london_dry"},
    )
    assert created.startswith("HTTP 201") and '"public_visible": false' in created
    # Drafts only, and no person-only areas.
    refused = call(
        client,
        key,
        "call_api",
        method="POST",
        path="/api/v1/admin/gins",
        body={"brand": "Atla", "name": "Other", "abv": "45", "public_visible": True},
    )
    assert refused.startswith("HTTP 403") and "publish_needs_person" in refused
    assert "person_only" in call(
        client, key, "call_api", method="GET", path="/api/v1/admin/profile"
    )
    assert "must start with /api/v1/" in call(
        client, key, "call_api", method="GET", path="/etc/passwd"
    )
    assert "must start with /api/v1/" in call(
        client, key, "call_api", method="GET", path=f"{MCP}/x"
    )
    # The audit log says it came through the key.
    events = api.get("/api/v1/admin/audit", params={"action": "gin.create"}).json()["items"]
    assert events[0]["summary"]["via"] == "API key: Claude"


def test_upload_image_as_base64(client, key):
    import base64
    import io

    from PIL import Image

    buffer = io.BytesIO()
    Image.new("RGB", (8, 8), (199, 164, 107)).save(buffer, format="PNG")
    text = call(
        client,
        key,
        "upload_image",
        base64_data=base64.b64encode(buffer.getvalue()).decode(),
        filename="bottle.png",
        alt="A bottle",
    )
    assert text.startswith("HTTP 201") and '"mime": "image/png"' in text
    assert "isn't valid base64" in call(client, key, "upload_image", base64_data="!!!")


@pytest.mark.parametrize(
    "url",
    [
        "http://example.com/a.jpg",
        "https://127.0.0.1/a.jpg",
        "https://localhost/a.jpg",
        "file:///etc/passwd",
    ],
)
def test_url_upload_refuses_private_and_plain_addresses(client, key, url):
    text = call(client, key, "upload_image_from_url", url=url)
    assert text.startswith("Couldn't fetch the image")


def test_private_addresses_are_not_public():
    assert not _public_host("127.0.0.1")
    assert not _public_host("10.0.0.5")
    assert not _public_host("169.254.169.254")  # cloud metadata address
    assert not _public_host("no-such-host.invalid")


def test_gateway_survives_restarts(key):
    # The API can start several times in one process (tests do); each start
    # builds a fresh MCP server.
    for _ in range(2):
        with TestClient(app) as c:
            assert rpc(c, "tools/list", key=key).status_code == 200


def test_keys_are_hidden_in_the_access_log():
    import logging

    from app.main import _HideApiKeys

    record = logging.LogRecord(
        "uvicorn.access",
        logging.INFO,
        "",
        0,
        '%s - "%s %s"',
        ("1.2.3.4", "POST", "/api/v1/mcp/k/gck_abc-DEF_123"),
        None,
    )
    _HideApiKeys().filter(record)
    assert "gck_abc" not in record.getMessage() and "gck_…" in record.getMessage()
