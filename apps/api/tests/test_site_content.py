"""Editable page texts and the contact form."""

import io
import json
from datetime import timedelta

import pytest

from app.config import get_settings
from app.models import ContactMessage
from app.models._types import utcnow
from app.services import turnstile
from app.services.maintenance import prune_auth_records
from tests.conftest import make_admin, sign_in

TEXTS = "/api/v1/admin/page-texts"


# ---------------- Page texts ----------------


def texts_by_key(api) -> dict:
    return {t["key"]: t for t in api.get(TEXTS).json()}


def test_defaults_then_edit_and_reset(api, client):
    intro = texts_by_key(api)["home.intro"]
    assert intro["customised"] is False and intro["version"] == 0
    assert "two friends" in intro["value"]

    r = api.patch(
        f"{TEXTS}/home.intro",
        json={"version": 0, "value": "Gins, reviews and cocktails from two husbands."},
    )
    assert r.status_code == 200, r.text
    saved = r.json()
    assert saved["customised"] is True and saved["updated_by"] == "Anna"

    # Visitors see it.
    site = client.get("/api/v1/public/site").json()
    assert site["texts"]["home.intro"] == "Gins, reviews and cocktails from two husbands."
    assert site["texts"]["about.contact_title"] == "Get in touch"  # untouched: the default

    # Saving from an old copy is a conflict, not a silent overwrite.
    stale = api.patch(f"{TEXTS}/home.intro", json={"version": 0, "value": "Other"})
    assert stale.status_code == 409

    # Reset goes back to the default.
    r = api.delete(f"{TEXTS}/home.intro", params={"version": saved["version"]})
    assert r.json()["customised"] is False
    assert "two friends" in client.get("/api/v1/public/site").json()["texts"]["home.intro"]


def test_text_rules(api):
    # Single-line texts can't have line breaks.
    r = api.patch(f"{TEXTS}/home.eyebrow", json={"version": 0, "value": "One\nTwo"})
    assert r.status_code == 422
    # Too long.
    r = api.patch(f"{TEXTS}/home.eyebrow", json={"version": 0, "value": "x" * 81})
    assert r.status_code == 422
    # Formatted texts: only safe links.
    r = api.patch(
        f"{TEXTS}/about.body", json={"version": 0, "value": "[click](javascript:alert(1))"}
    )
    assert r.status_code == 422
    r = api.patch(
        f"{TEXTS}/about.body",
        json={"version": 0, "value": "## Hello\n\nSee [the gins](/collection)."},
    )
    assert r.status_code == 200
    # Unknown keys.
    assert api.patch(f"{TEXTS}/nope", json={"version": 0, "value": "x"}).status_code == 404


def test_home_page_search_texts(api, client):
    """The home page's title and description in Google are editable texts."""
    texts = client.get("/api/v1/public/site").json()["texts"]
    assert texts["home.seo_title"].endswith("The Gin Cabinet")
    assert 0 < len(texts["home.seo_description"]) <= 160
    # Kept to what search results show: 70 and 160 characters.
    r = api.patch(f"{TEXTS}/home.seo_title", json={"version": 0, "value": "x" * 71})
    assert r.status_code == 422
    r = api.patch(f"{TEXTS}/home.seo_description", json={"version": 0, "value": "x" * 161})
    assert r.status_code == 422


def test_editors_may_edit_page_texts(api, db, client):
    editor = make_admin(db, username="eva", email="eva@example.com", role="editor")
    api.post("/api/v1/auth/logout")
    client.headers["X-CSRF-Token"] = sign_in(client, editor)
    r = client.patch(f"{TEXTS}/footer.text", json={"version": 0, "value": "© Us"})
    assert r.status_code == 200


# ---------------- Contact form ----------------

MESSAGE = {"name": "Visitor", "email": "v@example.com", "message": "Love the site!"}


@pytest.fixture
def contact_on(monkeypatch):
    """Switch the form on, and pretend Cloudflare approves every token except "bad"."""
    monkeypatch.setattr(get_settings(), "turnstile_secret_key", "test-secret")
    monkeypatch.setattr(turnstile, "verify", lambda token, ip: token != "bad")


def test_contact_form_is_off_without_turnstile_keys(client):
    assert client.get("/api/v1/public/site").json()["contact_form"] is False
    r = client.post("/api/v1/public/contact", json={**MESSAGE, "turnstile_token": "ok"})
    assert r.status_code == 404


def test_send_read_and_delete_a_message(contact_on, client, api):
    assert client.get("/api/v1/public/site").json()["contact_form"] is True
    r = client.post("/api/v1/public/contact", json={**MESSAGE, "turnstile_token": "ok"})
    assert r.status_code == 202

    assert api.get("/api/v1/admin/messages/unread-count").json() == {"unread": 1}
    message = api.get("/api/v1/admin/messages").json()["items"][0]
    assert message["message"] == "Love the site!" and message["read_at"] is None
    assert "sender_hash" not in message  # never shown, not even to admins

    r = api.patch(f"/api/v1/admin/messages/{message['id']}", json={"read": True})
    assert r.json()["read_at"] is not None
    assert api.get("/api/v1/admin/messages/unread-count").json() == {"unread": 0}

    assert api.delete(f"/api/v1/admin/messages/{message['id']}").status_code == 204
    assert api.get("/api/v1/admin/messages").json()["items"] == []


def test_turnstile_must_pass(contact_on, client, api):
    r = client.post("/api/v1/public/contact", json={**MESSAGE, "turnstile_token": "bad"})
    assert r.json()["error"]["code"] == "turnstile_failed"
    assert api.get("/api/v1/admin/messages").json()["items"] == []


def test_hidden_bot_trap(contact_on, client, api):
    r = client.post(
        "/api/v1/public/contact",
        json={**MESSAGE, "turnstile_token": "ok", "website": "http://spam.example"},
    )
    assert r.status_code == 202  # looks sent to the bot...
    assert api.get("/api/v1/admin/messages").json()["items"] == []  # ...but isn't kept


def test_per_hour_limit(contact_on, client):
    for _ in range(get_settings().contact_per_hour):
        assert (
            client.post(
                "/api/v1/public/contact", json={**MESSAGE, "turnstile_token": "ok"}
            ).status_code
            == 202
        )
    r = client.post("/api/v1/public/contact", json={**MESSAGE, "turnstile_token": "ok"})
    assert r.status_code == 429


def test_old_messages_are_deleted(contact_on, client, db):
    client.post("/api/v1/public/contact", json={**MESSAGE, "turnstile_token": "ok"})
    message = db.query(ContactMessage).one()
    message.created_at = utcnow() - timedelta(days=get_settings().contact_retention_days + 1)
    db.commit()
    prune_auth_records(db)
    assert db.query(ContactMessage).count() == 0


def test_editors_cannot_read_messages(api, db, client):
    editor = make_admin(db, username="eva", email="eva@example.com", role="editor")
    api.post("/api/v1/auth/logout")
    sign_in(client, editor)
    assert client.get("/api/v1/admin/messages").status_code == 403


def test_turnstile_verify_asks_cloudflare(monkeypatch):
    """What we send to Cloudflare, and how we read the answer (no network)."""
    sent = {}

    def fake_urlopen(request, timeout):
        sent["url"] = request.full_url
        sent["body"] = request.data.decode()
        return io.BytesIO(json.dumps({"success": True}).encode())

    monkeypatch.setattr(get_settings(), "turnstile_secret_key", "s3cret")
    monkeypatch.setattr(turnstile.urllib.request, "urlopen", fake_urlopen)
    assert turnstile.verify("tok", "203.0.113.5") is True
    assert sent["url"].startswith("https://challenges.cloudflare.com/")
    assert "secret=s3cret" in sent["body"] and "response=tok" in sent["body"]
    assert "remoteip=203.0.113.5" in sent["body"]

    def unreachable(request, timeout):
        raise OSError("network down")

    monkeypatch.setattr(turnstile.urllib.request, "urlopen", unreachable)
    assert turnstile.verify("tok", None) is False  # fail closed
