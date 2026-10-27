"""The Gin guide: editing, ordering, publishing and the public pages."""

import importlib.util
from pathlib import Path

from pydantic import TypeAdapter

from app.schemas.blog import Block
from tests.conftest import make_admin, sign_in
from tests.test_catalogue import make_gin
from tests.test_editorial import jpeg_with_gps, upload

ADMIN = "/api/v1/admin/guide"
PUBLIC = "/api/v1/public/guide"

BODY = [
    {"type": "heading", "level": 2, "text": "Copa"},
    {
        "type": "paragraph",
        "text": "A **big** bowl for *aromatic* gins. See [our gins](/collection).",
    },
    {"type": "list", "ordered": False, "items": ["Lots of ice", "A garnish"]},
]


def create(api, title: str = "Glassware", **extra) -> dict:
    r = api.post(
        ADMIN, json={"title": title, "summary": "Which glass?", "body_blocks": BODY, **extra}
    )
    assert r.status_code == 201, r.text
    return r.json()


def patch(api, page: dict, **changes) -> dict:
    r = api.patch(f"{ADMIN}/{page['id']}", json={"version": page["version"], **changes})
    assert r.status_code == 200, r.text
    return r.json()


def test_create_edit_and_publish(api, client):
    page = create(api)
    assert page["slug"] == "glassware"
    assert page["published"] is False
    # Not public yet, and the menu has no "Gin guide" link.
    assert client.get(f"{PUBLIC}/glassware").status_code == 404
    assert client.get("/api/v1/public/site").json()["has_guide"] is False
    assert client.get(PUBLIC).json() == []

    page = patch(api, page, title="Gin glasses", slug="gin-glasses", hero_credit="Photo: Anna")
    page = patch(api, page, published=True)
    assert page["published_at"] is not None

    public = client.get(f"{PUBLIC}/gin-glasses").json()
    assert public["title"] == "Gin glasses"
    assert public["body"][1]["text"].startswith("A **big** bowl")
    assert [c["slug"] for c in client.get(PUBLIC).json()] == ["gin-glasses"]
    assert client.get("/api/v1/public/site").json()["has_guide"] is True

    # Taking it off the website again.
    patch(api, page, published=False)
    assert client.get(f"{PUBLIC}/gin-glasses").status_code == 404


def test_an_empty_page_cannot_be_published(api):
    page = create(api, body_blocks=[])
    r = api.patch(f"{ADMIN}/{page['id']}", json={"version": page["version"], "published": True})
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "empty_page"


def test_unsafe_links_are_rejected(api):
    r = api.post(
        ADMIN,
        json={
            "title": "Bad",
            "body_blocks": [{"type": "paragraph", "text": "[click](javascript:alert(1))"}],
        },
    )
    assert r.status_code == 422


def test_edit_conflict(api):
    page = create(api)
    patch(api, page, title="First save")
    r = api.patch(f"{ADMIN}/{page['id']}", json={"version": page["version"], "title": "Stale"})
    assert r.status_code == 409


def test_order_and_previous_next(api, client):
    a, b, c = (create(api, title=t) for t in ("Alpha", "Bravo", "Charlie"))
    for page in (a, b, c):
        patch(api, page, published=True)
    r = api.post(f"{ADMIN}/order", json={"ids": [c["id"], a["id"], b["id"]]})
    assert r.status_code == 200, r.text
    assert [p["title"] for p in r.json()] == ["Charlie", "Alpha", "Bravo"]
    assert [p["slug"] for p in client.get(PUBLIC).json()] == ["charlie", "alpha", "bravo"]

    middle = client.get(f"{PUBLIC}/alpha").json()
    assert middle["previous"]["slug"] == "charlie"
    assert middle["next"]["slug"] == "bravo"
    first = client.get(f"{PUBLIC}/charlie").json()
    assert first["previous"] is None

    # An order that leaves a page out (someone added one meanwhile) is refused.
    r = api.post(f"{ADMIN}/order", json={"ids": [a["id"], b["id"]]})
    assert r.status_code == 409


def test_images_and_cards_in_the_body(api, client):
    image = upload(api, jpeg_with_gps(), alt="A copa glass").json()
    private_gin = make_gin(api)
    page = create(
        api,
        hero_media_id=image["id"],
        body_blocks=[
            *BODY,
            {"type": "image", "media_id": image["id"], "caption": "Copa"},
            {"type": "card", "kind": "gin", "id": private_gin["id"]},
        ],
    )
    patch(api, page, published=True)
    public = client.get(f"{PUBLIC}/glassware").json()
    assert public["image"]["alt"] == "A copa glass"
    types = [b["type"] for b in public["body"]]
    assert "image" in types
    assert "card" not in types  # the gin is private, so its card is left out

    # The image counts as used, so it can't be deleted from the library.
    media = api.get(f"/api/v1/admin/media/{image['id']}").json()
    assert "Gin guide: Glassware" in media["used_by"]


def test_editors_can_write_guide_pages(api, db, client):
    editor = make_admin(db, username="eva", email="eva@example.com", role="editor")
    client.headers["X-CSRF-Token"] = sign_in(client, editor)
    page = create(client, title="Garnishes")
    patch(client, page, published=True)
    r = client.delete(f"{ADMIN}/{page['id']}")
    assert r.status_code == 204


def test_starter_pages_in_the_migration_are_valid():
    """The drafts the migration adds must pass the same checks as edited pages."""
    path = next(Path(__file__).parents[1].glob("migrations/versions/*_0014_guide_pages.py"))
    spec = importlib.util.spec_from_file_location("guide_migration", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    blocks = TypeAdapter(list[Block])
    slugs = set()
    for page in module.STARTER_PAGES:
        blocks.validate_python(page["body_blocks"])
        assert len(page["title"]) <= 200 and len(page["summary"]) <= 600
        slugs.add(page["slug"])
    assert len(slugs) == len(module.STARTER_PAGES) == 6
