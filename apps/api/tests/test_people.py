"""Accounts: inviting people, the editor role, and changing someone else's account."""

import time
import uuid
from datetime import timedelta

import pyotp
import pytest

from app.models import User
from app.models._types import utcnow
from tests.conftest import AdminFixture, make_admin, sign_in

ADMINS = "/api/v1/admin/admins"
STRONG = "a long passphrase for the cabinet"


def invite(api, **overrides) -> dict:
    body = {"username": "eva", "display_name": "Eva", "email": "eva@example.com", **overrides}
    r = api.post(ADMINS, json=body)
    assert r.status_code == 201, r.text
    return r.json()


def accept(client, path: str, password: str = STRONG) -> tuple[str, list[str]]:
    """Go through the invitation page's steps; returns the MFA secret and recovery codes."""
    token = path.rsplit("/", 1)[1]
    setup = client.post(f"/api/v1/auth/invite/{token}/mfa", json={"password": password}).json()
    code = pyotp.TOTP(setup["secret"]).now()
    r = client.post(
        f"/api/v1/auth/invite/{token}/complete", json={"password": password, "code": code}
    )
    assert r.status_code == 200, r.text
    return setup["secret"], r.json()["codes"]


def test_invite_an_editor_who_sets_up_their_own_account(api, client):
    out = invite(api)
    assert out["account"]["role"] == "editor"
    assert out["account"]["invite_pending"] is True
    path = out["invite_path"]
    assert path.startswith("/welcome/")

    # The link shows who it's for. The person can't sign in yet.
    token = path.rsplit("/", 1)[1]
    info = client.get(f"/api/v1/auth/invite/{token}").json()
    assert info["display_name"] == "Eva" and info["role"] == "editor"

    # A weak password is refused before any authenticator key is given...
    weak = client.post(f"/api/v1/auth/invite/{token}/mfa", json={"password": "short"})
    assert weak.json()["error"]["code"] == "weak_password"
    # ...and finishing needs a working code from the new app.
    client.post(f"/api/v1/auth/invite/{token}/mfa", json={"password": STRONG})
    wrong = client.post(
        f"/api/v1/auth/invite/{token}/complete", json={"password": STRONG, "code": "000000"}
    )
    assert wrong.json()["error"]["code"] == "invalid_mfa_code"

    secret, codes = accept(client, path)
    assert len(codes) == 10
    # The link works once only.
    assert client.get(f"/api/v1/auth/invite/{token}").status_code == 404

    accounts = {a["username"]: a for a in api.get(ADMINS).json()}
    assert accounts["eva"]["invite_pending"] is False


def test_invited_person_cannot_sign_in_before_finishing(api, client):
    invite(api)
    client.post("/api/v1/auth/logout")
    r = client.post("/api/v1/auth/login", json={"username": "eva", "password": "anything"})
    assert r.status_code == 401


def test_editor_reaches_content_but_not_inventory_settings_or_accounts(api, db, client):
    editor = make_admin(db, username="eva", email="eva@example.com", role="editor")
    api.post("/api/v1/auth/logout")
    client.headers["X-CSRF-Token"] = sign_in(client, editor)

    session = client.get("/api/v1/auth/session").json()
    assert session["user"]["role"] == "editor"

    # Content: allowed.
    for path in (
        "/api/v1/admin/blog",
        "/api/v1/admin/reviews",
        "/api/v1/admin/tastings",
        "/api/v1/admin/cocktails",
        "/api/v1/admin/tonics",
        "/api/v1/admin/media",
        "/api/v1/admin/page-texts",
        "/api/v1/admin/gins",  # read-only, to pick a gin for a review
        "/api/v1/admin/users",
        "/api/v1/admin/profile",
    ):
        assert client.get(path).status_code == 200, path

    # Everything else: admins only.
    for path in (
        "/api/v1/admin/dashboard",
        "/api/v1/admin/bottles",
        "/api/v1/admin/purchases",
        "/api/v1/admin/wishlist",
        "/api/v1/admin/settings",
        "/api/v1/admin/admins",
        "/api/v1/admin/audit",
        "/api/v1/admin/messages",
        "/api/v1/admin/export",
        "/api/v1/admin/consent/stats",
    ):
        r = client.get(path)
        assert r.status_code == 403, path
        assert r.json()["error"]["code"] == "admins_only"
    r = client.post("/api/v1/admin/gins", json={"brand": "X", "name": "Y", "abv": "40"})
    assert r.status_code == 403  # can read gins, not add or change them

    # Writing an article works.
    r = client.post("/api/v1/admin/blog", json={"title": "By an editor"})
    assert r.status_code == 201, r.text


def test_limits(api, db):
    make_admin(db, username="bertil", email="bertil@example.com")
    r = api.post(
        ADMINS,
        json={"username": "c", "display_name": "C", "email": "c@example.com", "role": "admin"},
    )
    assert r.status_code == 422  # pattern: at least 3 characters
    r = api.post(
        ADMINS,
        json={"username": "carl", "display_name": "C", "email": "c@example.com", "role": "admin"},
    )
    assert r.json()["error"]["code"] == "too_many_admins"
    for n in range(8):
        invite(api, username=f"editor{n}", email=f"e{n}@example.com")
    r = api.post(
        ADMINS, json={"username": "one-more", "display_name": "X", "email": "x@example.com"}
    )
    assert r.json()["error"]["code"] == "too_many_accounts"


def test_duplicate_username_or_email(api):
    invite(api)
    r = api.post(ADMINS, json={"username": "eva", "display_name": "E", "email": "o@example.com"})
    assert r.json()["error"]["code"] == "username_taken"
    r = api.post(ADMINS, json={"username": "eve", "display_name": "E", "email": "ANNA@example.com"})
    assert r.json()["error"]["code"] == "email_taken"


def test_change_someone_elses_name_email_role_and_access(api, admin, db, client):
    bertil = make_admin(db, username="bertil", email="bertil@example.com", role="editor")
    url = f"{ADMINS}/{bertil.user.id}"

    # The display name needs no password.
    r = api.patch(url, json={"display_name": "Bertil B."})
    assert r.status_code == 200 and r.json()["display_name"] == "Bertil B."

    # Email, role and access need your password.
    r = api.patch(url, json={"email": "b@example.com"})
    assert r.json()["error"]["code"] == "wrong_password"
    r = api.patch(
        url, json={"email": "b@example.com", "role": "admin", "current_password": admin.password}
    )
    assert r.status_code == 200, r.text
    assert r.json()["email"] == "b@example.com" and r.json()["role"] == "admin"

    # You can't change yourself here (no locking yourself out).
    r = api.patch(
        f"{ADMINS}/{admin.user.id}", json={"role": "editor", "current_password": admin.password}
    )
    assert r.json()["error"]["code"] == "use_profile"

    # Switching access off stops sign-in.
    r = api.patch(url, json={"enabled": False, "current_password": admin.password})
    assert r.json()["enabled"] is False
    api.post("/api/v1/auth/logout")
    r = client.post("/api/v1/auth/login", json={"username": "bertil", "password": bertil.password})
    assert r.status_code == 401

    # Switched back on, they see who changed their account.
    client.headers["X-CSRF-Token"] = sign_in(client, admin)
    client.patch(url, json={"enabled": True, "current_password": admin.password})
    client.post("/api/v1/auth/logout")
    client.headers["X-CSRF-Token"] = sign_in(client, bertil)
    notices = client.get("/api/v1/admin/profile").json()["notices"]
    assert notices[0]["action"] == "user.updated_by_admin"
    assert notices[0]["by"] == "Anna"


def test_renew_and_cancel_an_invitation(api, client):
    first = invite(api)
    account_id = first["account"]["id"]
    second = api.post(f"{ADMINS}/{account_id}/invite").json()
    old_token = first["invite_path"].rsplit("/", 1)[1]
    assert client.get(f"/api/v1/auth/invite/{old_token}").status_code == 404  # replaced
    new_token = second["invite_path"].rsplit("/", 1)[1]
    assert client.get(f"/api/v1/auth/invite/{new_token}").status_code == 200

    assert api.delete(f"{ADMINS}/{account_id}").status_code == 204
    assert client.get(f"/api/v1/auth/invite/{new_token}").status_code == 404
    assert "eva" not in {a["username"] for a in api.get(ADMINS).json()}


def test_active_accounts_cannot_be_deleted(api, db):
    bertil = make_admin(db, username="bertil", email="bertil@example.com")
    r = api.delete(f"{ADMINS}/{bertil.user.id}")
    assert r.json()["error"]["code"] == "already_active"


def test_expired_invitation(api, client, db):
    out = invite(api)
    user = db.get(User, uuid.UUID(out["account"]["id"]))
    user.invite_expires_at = utcnow() - timedelta(minutes=1)
    db.commit()
    token = out["invite_path"].rsplit("/", 1)[1]
    assert client.get(f"/api/v1/auth/invite/{token}").status_code == 404


@pytest.mark.parametrize("path", ["/api/v1/auth/invite/nonsense", "/api/v1/auth/invite/"])
def test_unknown_invitation(client, path):
    assert client.get(path).status_code == 404


def test_invited_editor_can_then_sign_in(api, client):
    out = invite(api)
    secret, codes = accept(client, out["invite_path"])
    api.post("/api/v1/auth/logout")
    person = AdminFixture(user=None, password=STRONG, totp_secret=secret, recovery_codes=codes)  # type: ignore[arg-type]
    r = client.post("/api/v1/auth/login", json={"username": "eva", "password": STRONG})
    assert r.status_code == 200
    # The setup code is used up; the next window's code signs in.
    person.last_step = int(time.time() // 30)
    r = client.post("/api/v1/auth/mfa/verify", json={"code": person.current_code()})
    assert r.status_code == 200, r.text
    assert r.json()["user"]["role"] == "editor"
