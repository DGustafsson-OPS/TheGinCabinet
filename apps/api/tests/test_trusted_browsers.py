"""Trusted browsers ("Trust this browser for 30 days"): the password alone signs
in on a trusted browser; changing the password or authenticator, or "Forget",
ends the trust."""

from datetime import timedelta

from app.models import TrustedDevice
from app.models._types import utcnow
from tests.conftest import make_admin

LOGIN = "/api/v1/auth/login"
VERIFY = "/api/v1/auth/mfa/verify"
TRUSTED = "/api/v1/admin/profile/trusted-browsers"


def login(client, admin, password=None):
    return client.post(
        LOGIN, json={"username": admin.user.username, "password": password or admin.password}
    )


def sign_in_trusting(client, admin) -> str:
    """Password + code with "Trust this browser" ticked; returns the CSRF token."""
    assert login(client, admin).json() == {"mfa_required": True}
    r = client.post(VERIFY, json={"code": admin.current_code(), "remember_device": True})
    assert r.status_code == 200, r.text
    assert client.cookies.get("gc_trusted")
    return r.json()["csrf_token"]


def sign_out(client, csrf: str):
    assert client.post("/api/v1/auth/logout", headers={"X-CSRF-Token": csrf}).status_code == 204


def test_trusted_browser_skips_the_code_but_not_the_password(client, admin):
    csrf = sign_in_trusting(client, admin)
    sign_out(client, csrf)

    # The password is still required...
    assert login(client, admin, password="wrong password!").status_code == 401
    # ...but the code isn't: the session is complete straight away.
    r = login(client, admin)
    assert r.json() == {"mfa_required": False}
    session = client.get("/api/v1/auth/session").json()
    assert session["authenticated"] is True

    # It is listed in Settings, marked as this browser.
    browsers = client.get(TRUSTED).json()
    assert len(browsers) == 1 and browsers[0]["this_browser"] is True


def test_without_the_box_ticked_the_code_is_asked_every_time(client, admin):
    assert login(client, admin).json() == {"mfa_required": True}
    r = client.post(VERIFY, json={"code": admin.current_code()})
    sign_out(client, r.json()["csrf_token"])
    assert client.cookies.get("gc_trusted") is None
    assert login(client, admin).json() == {"mfa_required": True}


def test_trust_belongs_to_one_person_and_expires(client, db, admin):
    sign_out(client, sign_in_trusting(client, admin))
    # Someone else signing in on the same browser still needs their code.
    bertil = make_admin(db, username="bertil", email="bertil@example.com")
    assert login(client, bertil).json() == {"mfa_required": True}
    client.cookies.delete("gc_session")

    # After 30 days the code is needed again.
    row = db.query(TrustedDevice).one()
    row.expires_at = utcnow() - timedelta(minutes=1)
    db.commit()
    assert login(client, admin).json() == {"mfa_required": True}


def test_forget_and_password_change_end_the_trust(client, admin):
    csrf = sign_in_trusting(client, admin)
    # "Forget trusted browsers": you stay signed in, but the code is needed next time.
    r = client.delete(TRUSTED, headers={"X-CSRF-Token": csrf})
    assert r.status_code == 204
    assert client.get(TRUSTED).json() == []
    sign_out(client, csrf)
    assert login(client, admin).json() == {"mfa_required": True}
    client.cookies.delete("gc_session")

    # Changing the password forgets every trusted browser too.
    csrf = sign_in_trusting(client, admin)
    new_password = "a completely new passphrase 42"
    r = client.post(
        "/api/v1/admin/profile/password",
        json={"current_password": admin.password, "new_password": new_password},
        headers={"X-CSRF-Token": csrf},
    )
    assert r.status_code == 204, r.text
    sign_out(client, csrf)
    assert login(client, admin, password=new_password).json() == {"mfa_required": True}
