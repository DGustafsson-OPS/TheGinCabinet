"""End-to-end tests of sign-in, MFA, sessions, CSRF and throttling (spec §9, §11)."""

from datetime import timedelta

from sqlalchemy import select

from app.models import AuditEvent, AuthSession
from app.models._types import utcnow
from tests.conftest import make_admin, sign_in

LOGIN = "/api/v1/auth/login"
VERIFY = "/api/v1/auth/mfa/verify"
SESSION = "/api/v1/auth/session"
LOGOUT = "/api/v1/auth/logout"
AUDIT = "/api/v1/admin/audit"


def test_wrong_password_is_rejected_and_audited(client, admin, db):
    r = client.post(LOGIN, json={"username": "anna", "password": "not the password"})
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "invalid_credentials"
    actions = db.scalars(select(AuditEvent.action)).all()
    assert actions == ["auth.login_failed"]


def test_unknown_user_gets_the_same_error(client):
    r = client.post(LOGIN, json={"username": "nobody", "password": "whatever-password"})
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "invalid_credentials"


def test_password_alone_does_not_grant_admin_access(client, admin):
    r = client.post(LOGIN, json={"username": "anna", "password": admin.password})
    assert r.status_code == 200
    assert r.json() == {"mfa_required": True}

    assert client.get(SESSION).json()["mfa_pending"] is True
    r = client.get(AUDIT)
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "not_authenticated"


def test_full_login_with_totp(client, admin):
    csrf = sign_in(client, admin)
    assert csrf

    session = client.get(SESSION).json()
    assert session["authenticated"] is True
    assert session["user"]["username"] == "anna"
    assert "password_hash" not in session["user"]  # private fields never leave the server

    r = client.get(AUDIT)
    assert r.status_code == 200
    page = r.json()
    assert page["meta"]["total"] == 1
    assert page["items"][0]["action"] == "auth.login"
    assert page["items"][0]["actor_name"] == "Anna"


def test_session_token_is_rotated_after_mfa(client, admin):
    client.post(LOGIN, json={"username": "anna", "password": admin.password})
    pending_cookie = client.cookies.get("gc_session")
    client.post(VERIFY, json={"code": admin.current_code()})
    assert client.cookies.get("gc_session") != pending_cookie


def test_wrong_mfa_code_is_rejected(client, admin):
    client.post(LOGIN, json={"username": "anna", "password": admin.password})
    wrong = str((int(admin.current_code()) + 500_000) % 1_000_000).zfill(6)
    r = client.post(VERIFY, json={"code": wrong})
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "invalid_mfa_code"


def test_recovery_code_works_only_once(client, admin):
    code = admin.recovery_codes[0]
    client.post(LOGIN, json={"username": "anna", "password": admin.password})
    assert client.post(VERIFY, json={"code": code}).status_code == 200

    client.post(LOGOUT, headers={"X-CSRF-Token": client.get(SESSION).json()["csrf_token"]})
    client.post(LOGIN, json={"username": "anna", "password": admin.password})
    assert client.post(VERIFY, json={"code": code}).status_code == 401


def test_mfa_verify_without_password_step(client, admin):
    r = client.post(VERIFY, json={"code": admin.current_code()})
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "mfa_not_pending"


def test_logout_requires_csrf_token(client, admin):
    csrf = sign_in(client, admin)

    r = client.post(LOGOUT)
    assert r.status_code == 403
    assert r.json()["error"]["code"] == "csrf_failed"

    r = client.post(LOGOUT, headers={"X-CSRF-Token": csrf})
    assert r.status_code == 204
    assert client.get(SESSION).json()["authenticated"] is False
    assert client.get(AUDIT).status_code == 401


def test_foreign_origin_is_blocked(client, admin):
    csrf = sign_in(client, admin)
    r = client.post(LOGOUT, headers={"X-CSRF-Token": csrf, "Origin": "https://evil.example"})
    assert r.status_code == 403
    assert r.json()["error"]["code"] == "origin_not_allowed"


def test_idle_session_expires(client, admin, db):
    sign_in(client, admin)
    row = db.scalar(select(AuthSession).where(AuthSession.mfa_verified.is_(True)))
    row.last_seen_at = utcnow() - timedelta(hours=1)  # pretend an hour of inactivity
    db.commit()
    assert client.get(AUDIT).status_code == 401


def test_absolute_session_lifetime(client, admin, db):
    sign_in(client, admin)
    row = db.scalar(select(AuthSession).where(AuthSession.mfa_verified.is_(True)))
    row.expires_at = utcnow() - timedelta(seconds=1)
    db.commit()
    assert client.get(AUDIT).status_code == 401


def test_disabled_admin_is_locked_out(client, admin, db):
    sign_in(client, admin)
    admin.user.enabled = False
    db.merge(admin.user)
    db.commit()
    assert client.get(AUDIT).status_code == 401


def test_repeated_failures_are_throttled(client, admin):
    for _ in range(5):
        r = client.post(LOGIN, json={"username": "anna", "password": "wrong password!!"})
        assert r.status_code == 401
    # Even the right password is refused while locked out.
    r = client.post(LOGIN, json={"username": "anna", "password": admin.password})
    assert r.status_code == 429
    assert r.json()["error"]["code"] == "too_many_attempts"


def test_two_admins_have_distinct_attribution(client, admin, db):
    """Spec §11: both admins can sign in, with distinct activity attribution."""
    bertil = make_admin(db, username="bertil", email="bertil@example.com")
    sign_in(client, admin)
    client.post(LOGOUT, headers={"X-CSRF-Token": client.get(SESSION).json()["csrf_token"]})
    sign_in(client, bertil)

    logins = client.get(AUDIT, params={"action": "auth.login"}).json()["items"]
    assert sorted(e["actor_name"] for e in logins) == ["Anna", "Bertil"]


def test_admin_names_list_hides_private_fields(client, admin, db):
    make_admin(db, username="bertil", email="bertil@example.com")
    sign_in(client, admin)
    r = client.get("/api/v1/admin/users")
    assert r.status_code == 200
    assert [u["display_name"] for u in r.json()] == ["Anna", "Bertil"]
    assert set(r.json()[0]) == {"id", "display_name"}  # no email or hashes
