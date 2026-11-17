"""The Gin Cabinet as an MCP server, so an AI assistant (such as Claude) can use it.

MCP (Model Context Protocol) is a standard way to offer "tools" to an AI. This
one lives inside the API at ``/api/v1/mcp``. The website already forwards
``/api/...`` here, so the address is ``https://<site>/api/v1/mcp``.

**Signing in.** Every request needs an API key (Settings → API keys), either
in the usual header, ``Authorization: Bearer gck_...``, or, for apps that can
only take an address, in the address itself: ``/api/v1/mcp/k/gck_...``. Treat
that address like a password.

**No back door.** The tools don't touch the database directly: they call the
site's own API with the same key. So every rule applies exactly as for the
key used directly: new content stays a draft until a person publishes it;
accounts, passwords and 2FA are refused; and the audit log notes
"via API key: <name>" on every change.
"""

import base64
import contextvars
import ipaddress
import json
import socket
from contextlib import asynccontextmanager
from typing import Any
from urllib.parse import urlsplit

import anyio
import httpx
from mcp.server.mcpserver import MCPServer
from mcp.server.transport_security import TransportSecuritySettings

from app.db import SessionLocal
from app.services.api_keys import resolve_api_key

MCP_PATH = "/api/v1/mcp"

# The key of the request being handled, for the tools to pass on to the API.
# (A "context variable" is like a global, but separate for every request.)
_current_key: contextvars.ContextVar[str] = contextvars.ContextVar("api_key")

MAX_IMAGE_BYTES = 15 * 1024 * 1024
MAX_RESULT_CHARS = 60_000  # long answers are cut, so they don't swamp the AI

GUIDE = """\
The Gin Cabinet (a home gin collection and review site) through its admin API.

Rules:
- You act as the admin who created your API key. Everything you change is in
  the audit log, marked "via API key".
- New gins and tonics stay private, and articles, reviews, recipes and guide
  pages stay drafts. You can't publish or make anything public: a person does
  that in the admin. Say so when you've prepared something for publishing.
- Accounts, passwords, 2FA and API keys are off limits.
- Edits use optimistic locking: send the "version" you last read. A 409 means
  someone changed it meanwhile, so read it again and redo your change.

How to work:
1. list_endpoints("gin") (or "bottle", "cocktail", "blog", "tonic", "media",
   "distiller"...) to find the right call.
2. describe_endpoint(method, path) to see the fields it needs.
3. call_api(method, path, body). Admin paths start with /api/v1/admin/.

Common jobs:
- Add a gin: check the distillery exists (GET /api/v1/admin/distilleries?search=),
  add it if not (POST .../distilleries), then POST /api/v1/admin/gins with
  brand, name, abv, style, country, distillery_id, description, botanicals.
- Photos: upload_image_from_url (or upload_image) gives a media id; put it in
  the gin's image_ids, a recipe's cover_media_id, an article's hero_media_id...
- Bottles: POST /api/v1/admin/bottles (status "sealed" or "open"); update
  many levels at once with POST /api/v1/admin/bottles/levels.
- Journal article: POST /api/v1/admin/blog (a draft); a person publishes.
"""


# ---------- Calling the site's own API ----------


async def _api(method: str, path: str, **kwargs: Any) -> httpx.Response:
    """Call the API in-process (no network), as the current key."""
    from app.main import app  # imported here: app.main imports this module

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://internal") as client:
        headers = {"Authorization": f"Bearer {_current_key.get()}"}
        return await client.request(method, path, headers=headers, timeout=60, **kwargs)


def _result(response: httpx.Response) -> str:
    """The API's answer as text for the AI: the status code, then the JSON."""
    try:
        body: Any = response.json()
        text = json.dumps(body, ensure_ascii=False, indent=1, default=str)
    except ValueError:
        text = response.text
    if len(text) > MAX_RESULT_CHARS:
        text = (
            text[:MAX_RESULT_CHARS] + "\n… (cut short: ask for a smaller page, e.g. ?page_size=20)"
        )
    return f"HTTP {response.status_code}\n{text}"


def _openapi() -> dict:
    from app.main import app

    return app.openapi()


def _resolve(schema: Any, components: dict, depth: int = 0) -> Any:
    """Replace "$ref" pointers with the schemas they point to (a few levels deep)."""
    if depth > 6:
        return schema
    if isinstance(schema, dict):
        if "$ref" in schema:
            name = schema["$ref"].rsplit("/", 1)[-1]
            return _resolve(components.get(name, {}), components, depth + 1)
        return {k: _resolve(v, components, depth + 1) for k, v in schema.items() if k != "title"}
    if isinstance(schema, list):
        return [_resolve(v, components, depth + 1) for v in schema]
    return schema


# ---------- Fetching a photo from the internet, safely ----------


def _public_host(host: str) -> bool:
    """True only if every address the name points to is on the public internet.

    Stops the URL tool being used to reach the server's private network (for
    example the database, or the API itself), a trick called SSRF.
    """
    try:
        infos = socket.getaddrinfo(host, 443, proto=socket.IPPROTO_TCP)
    except socket.gaierror:
        return False
    return all(ipaddress.ip_address(info[4][0]).is_global for info in infos)


async def _download(url: str) -> tuple[bytes, str]:
    for _ in range(4):  # follow at most 3 redirects, checking each address
        parts = urlsplit(url)
        if parts.scheme != "https" or not parts.hostname:
            raise ValueError("Only https:// addresses can be fetched.")
        if not await anyio.to_thread.run_sync(_public_host, parts.hostname):
            raise ValueError("That address isn't on the public internet.")
        async with httpx.AsyncClient(follow_redirects=False, timeout=30) as client:
            async with client.stream("GET", url) as response:
                if response.is_redirect:
                    url = str(response.url.join(response.headers["location"]))
                    continue
                if response.status_code != 200:
                    raise ValueError(f"The image address answered {response.status_code}.")
                data = b""
                async for chunk in response.aiter_bytes():
                    data += chunk
                    if len(data) > MAX_IMAGE_BYTES:
                        raise ValueError("The image is larger than 15 MB.")
                name = parts.path.rsplit("/", 1)[-1] or "image"
                return data, name
    raise ValueError("Too many redirects.")


async def _upload(
    data: bytes, filename: str, alt: str | None, name: str | None, folder: str | None
) -> str:
    form = {k: v for k, v in {"alt": alt, "name": name, "folder": folder}.items() if v}
    files = {"file": (filename, data, "application/octet-stream")}
    return _result(await _api("POST", "/api/v1/admin/media", data=form, files=files))


# ---------- The MCP server and its tools ----------


def build_server() -> MCPServer:
    server = MCPServer(
        name="The Gin Cabinet",
        instructions=GUIDE,
        version="1.0",
    )

    @server.tool()
    def site_guide() -> str:
        """How this site works, its rules (drafts only, no accounts) and common jobs. Read first."""
        return GUIDE

    @server.tool()
    def list_endpoints(search: str = "") -> str:
        """List the API's calls (method, path, what it does).

        `search` filters them, e.g. "gin", "bottle" or "blog".
        """
        lines = []
        for path, methods in _openapi()["paths"].items():
            if path.startswith(MCP_PATH) or "/auth/" in path or "/api-keys" in path:
                continue
            for method, op in methods.items():
                summary = op.get("summary", "")
                text = f"{method.upper():6} {path}  {summary}"
                if search.lower() in text.lower():
                    lines.append(text)
        return "\n".join(lines) or f"No calls match {search!r}."

    @server.tool()
    def describe_endpoint(method: str, path: str) -> str:
        """The fields a call takes (query parameters and JSON body) and what it returns."""
        spec = _openapi()
        op = spec["paths"].get(path, {}).get(method.lower())
        if op is None:
            return f"No {method.upper()} {path}. Use list_endpoints to find the right path."
        components = spec.get("components", {}).get("schemas", {})
        out = {
            "summary": op.get("summary"),
            "description": op.get("description"),
            "parameters": [
                {
                    "name": p["name"],
                    "in": p["in"],
                    "required": p.get("required", False),
                    "schema": _resolve(p.get("schema"), components),
                }
                for p in op.get("parameters", [])
            ],
            "body": _resolve(
                op.get("requestBody", {})
                .get("content", {})
                .get("application/json", {})
                .get("schema"),
                components,
            ),
            "returns": _resolve(
                op.get("responses", {})
                .get("200", op.get("responses", {}).get("201", {}))
                .get("content", {})
                .get("application/json", {})
                .get("schema"),
                components,
            ),
        }
        return json.dumps(out, ensure_ascii=False, indent=1)

    @server.tool()
    async def call_api(
        method: str, path: str, body: dict | list | None = None, query: dict | None = None
    ) -> str:
        """Call the site's API and return the HTTP status and the JSON answer.

        method: GET, POST, PATCH, PUT or DELETE. path: starts with /api/v1/
        (for example /api/v1/admin/gins). body: the JSON to send, if any.
        query: query parameters, e.g. {"search": "Hernö", "page_size": 20}.
        """
        method = method.upper()
        if method not in {"GET", "POST", "PATCH", "PUT", "DELETE"}:
            return "Use GET, POST, PATCH, PUT or DELETE."
        if not path.startswith("/api/v1/") or path.startswith(MCP_PATH) or ".." in path:
            return "The path must start with /api/v1/ (for example /api/v1/admin/gins)."
        return _result(await _api(method, path, json=body, params=query))

    @server.tool()
    async def upload_image_from_url(
        url: str, alt: str = "", name: str = "", folder: str = ""
    ) -> str:
        """Fetch a photo from an https:// address and add it to the media library.

        JPEG, PNG, WebP or AVIF, up to 15 MB. Returns the new image with its id.
        """
        try:
            data, filename = await _download(url)
        except (ValueError, httpx.HTTPError) as exc:
            return f"Couldn't fetch the image: {exc}"
        return await _upload(data, filename, alt, name, folder)

    @server.tool()
    async def upload_image(
        base64_data: str,
        filename: str = "image.jpg",
        alt: str = "",
        name: str = "",
        folder: str = "",
    ) -> str:
        """Add a photo given as base64 text to the media library.

        Returns the new image, including its id.
        """
        try:
            data = base64.b64decode(base64_data, validate=True)
        except ValueError:
            return "That isn't valid base64."
        if len(data) > MAX_IMAGE_BYTES:
            return "The image is larger than 15 MB."
        return await _upload(data, filename, alt, name, folder)

    return server


# ---------- The door: check the key, then hand over to the MCP server ----------


class McpGateway:
    """An ASGI app (the kind of web app FastAPI is built on) in front of the MCP server.

    The MCP server is built afresh each time the API starts (see ``running``),
    because its request handler can only be started once.
    """

    def __init__(self) -> None:
        self._app = None

    @asynccontextmanager
    async def running(self):
        server = build_server()
        self._app = server.streamable_http_app(
            streamable_http_path="/",
            # One plain JSON answer per request, no open connections: passes
            # cleanly through the website's /api forwarding.
            stateless_http=True,
            json_response=True,
            # We check API keys ourselves, so the localhost-only guard is off.
            transport_security=TransportSecuritySettings(enable_dns_rebinding_protection=False),
        )
        async with server.session_manager.run():
            yield
        self._app = None

    async def __call__(self, scope, receive, send) -> None:
        key = scope.get("path_params", {}).get("key") or _bearer(scope)
        if not key or self._app is None or not await anyio.to_thread.run_sync(_valid, key):
            await _json(
                send,
                401,
                {"error": {"code": "invalid_api_key", "message": "A valid API key is needed."}},
            )
            return
        token = _current_key.set(key)
        try:
            # The MCP app answers at "/": hand it the request as if it came there.
            await self._app(
                {**scope, "path": "/", "raw_path": b"/", "root_path": ""}, receive, send
            )
        finally:
            _current_key.reset(token)


def _bearer(scope) -> str | None:
    for name, value in scope.get("headers", []):
        if name == b"authorization":
            scheme, _, key = value.decode("latin-1").partition(" ")
            if scheme.lower() == "bearer" and key.strip():
                return key.strip()
    return None


def _valid(key: str) -> bool:
    with SessionLocal() as db:
        row = resolve_api_key(db, key)
        return row is not None and row.user.enabled and row.user.role == "admin"


async def _json(send, status: int, body: dict) -> None:
    payload = json.dumps(body).encode()
    await send(
        {
            "type": "http.response.start",
            "status": status,
            "headers": [
                (b"content-type", b"application/json"),
                (b"content-length", str(len(payload)).encode()),
            ],
        }
    )
    await send({"type": "http.response.body", "body": payload})


gateway = McpGateway()
