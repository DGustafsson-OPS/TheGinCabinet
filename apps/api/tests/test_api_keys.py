"""API keys: a program (such as an AI assistant) using the admin API.

A key acts as the admin who created it, except for accounts, passwords, 2FA
and keys (person only), and anything it creates stays a draft until a person
publishes it.
"""

from datetime import timedelta

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models import ApiKey
from app.models._types import utcnow
from tests.test_catalogue import GINS, make_gin

KEYS = "/api/v1/admin/api-keys"


@pytest.fixture
def key(api) -> str:
    r = api.post(KEYS, json={"name": "Claude", "days": 30})
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["key"].startswith("gck_") and body["prefix"] == body["key"][:10]
    assert body["owner"] and body["active"] is True
    return body["key"]


@pytest.fixture
def bot(key):
    """A separate client with no cookies at all: only the key."""
    with TestClient(app, headers={"Authorization": f"Bearer {key}"}) as client:
        yield client


def test_key_is_shown_once_and_stored_as_a_fingerprint(api, key, db):
    listed = api.get(KEYS).json()
    assert len(listed) == 1 and "key" not in listed[0]
    row = db.query(ApiKey).one()
    assert key not in (row.key_hash, row.prefix) and len(row.key_hash) == 64


def test_key_works_without_cookie_or_csrf_and_is_audited(bot, api):
    assert bot.get(GINS).status_code == 200
    r = bot.post(
        GINS, json={"brand": "Atla", "name": "London Dry", "abv": "45", "style": "london_dry"}
    )
    assert r.status_code == 201, r.text
    assert r.json()["public_visible"] is False
    events = api.get("/api/v1/admin/audit", params={"action": "gin.create"}).json()["items"]
    assert events[0]["summary"]["via"] == "API key: Claude"
    # The list shows when the key was last used.
    assert api.get(KEYS).json()[0]["last_used_at"] is not None


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("get", "/api/v1/admin/profile"),
        ("post", "/api/v1/admin/profile/password"),
        ("get", "/api/v1/admin/profile/trusted-browsers"),
        ("post", "/api/v1/admin/profile/mfa/start"),
        ("get", "/api/v1/admin/admins"),
        ("post", "/api/v1/admin/admins"),
        ("get", KEYS),
        ("post", KEYS),
    ],
)
def test_person_only_areas_refuse_keys(bot, method, path):
    r = getattr(bot, method)(path, **({"json": {}} if method == "post" else {}))
    assert r.status_code == 403, r.text
    assert r.json()["error"]["code"] == "person_only"


def test_keys_cannot_publish(bot, api):
    def refused(r):
        assert r.status_code == 403, r.text
        assert r.json()["error"]["code"] == "publish_needs_person"

    base = {"brand": "Draft", "abv": "40", "style": "london_dry"}
    refused(bot.post(GINS, json={**base, "name": "Public", "public_visible": True}))
    gin = bot.post(GINS, json={**base, "name": "Private"}).json()
    refused(
        bot.patch(f"{GINS}/{gin['id']}", json={"version": gin["version"], "public_visible": True})
    )
    refused(bot.post(f"{GINS}/visibility", json={"ids": [gin["id"]], "public_visible": True}))
    refused(
        bot.post(
            "/api/v1/admin/tonics", json={"brand": "T", "name": "Tonic", "public_visible": True}
        )
    )

    # A recipe can be written and saved, but not published.
    recipe = bot.post(
        "/api/v1/admin/cocktails",
        json={
            "title": "Negroni",
            "method": "stir",
            "ingredients": [{"name": "Gin", "quantity": "30", "unit": "ml"}],
            "steps": [{"text": "Stir over ice and strain."}],
        },
    )
    assert recipe.status_code == 201, recipe.text
    refused(
        bot.post(
            f"/api/v1/admin/cocktails/{recipe.json()['id']}/status",
            json={"version": recipe.json()["version"], "status": "published"},
        )
    )
    # A person can publish what the key wrote.
    r = api.patch(f"{GINS}/{gin['id']}", json={"version": gin["version"], "public_visible": True})
    assert r.status_code == 200 and r.json()["public_visible"] is True
    # And the key may still edit it, or take it off the website again.
    r = bot.post(f"{GINS}/visibility", json={"ids": [gin["id"]], "public_visible": False})
    assert r.status_code == 200


def test_quick_reviews_on_public_things_need_a_person(bot, api):
    public = make_gin(api, name="On the site", public_visible=True)
    private = make_gin(api, name="Not yet")
    r = bot.post("/api/v1/admin/quick-reviews", json={"gin_id": public["id"], "rating": "4"})
    assert r.json()["error"]["code"] == "publish_needs_person"
    r = bot.post("/api/v1/admin/quick-reviews", json={"gin_id": private["id"], "rating": "4"})
    assert r.status_code == 201, r.text


def test_wrong_revoked_and_expired_keys_are_refused(api, key, db):
    def status(k):
        with TestClient(app, headers={"Authorization": f"Bearer {k}"}) as c:
            return c.get(GINS).status_code

    assert status(key) == 200
    assert status("gck_not-a-real-key") == 401
    assert status("something-else") == 401

    row = db.query(ApiKey).one()
    row.expires_at = utcnow() - timedelta(minutes=1)
    db.commit()
    assert status(key) == 401
    row.expires_at = utcnow() + timedelta(days=1)
    db.commit()
    assert status(key) == 200

    r = api.delete(f"{KEYS}/{row.id}")
    assert r.status_code == 204
    assert status(key) == 401
    assert api.get(KEYS).json()[0]["active"] is False


def test_keys_stop_working_when_their_owner_is_disabled(api, key, db):
    from app.models import User

    owner = db.query(User).one()
    owner.enabled = False
    db.commit()
    with TestClient(app, headers={"Authorization": f"Bearer {key}"}) as c:
        assert c.get(GINS).status_code == 401
