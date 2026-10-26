"""Settings & admins (spec §5 A10)."""

import pyotp

from tests.conftest import PASSWORD, make_admin, sign_in
from tests.test_catalogue import make_gin
from tests.test_editorial import jpeg_with_gps, upload

SETTINGS = "/api/v1/admin/settings"
PROFILE = "/api/v1/admin/profile"
ADMINS = "/api/v1/admin/admins"
NEW_PASSWORD = "a brand new juniper passphrase"


# ---------------- Website settings ----------------


def test_site_settings_and_public_view(api):
    current = api.get(SETTINGS).json()
    assert current["site_name"] == "The Gin Cabinet"
    assert current["default_gin_public"] is False

    logo = upload(api, jpeg_with_gps(), alt="Logo").json()
    r = api.patch(
        SETTINGS,
        json={
            "version": current["version"],
            "tagline": "Two friends, one cabinet",
            "contact_email": "hello@gincabinet.example",
            "logo_media_id": logo["id"],
        },
    )
    assert r.status_code == 200, r.text
    saved = r.json()
    assert saved["logo"]["id"] == logo["id"]

    # A stale version is a conflict, not a silent overwrite.
    r = api.patch(SETTINGS, json={"version": current["version"], "tagline": "Other"})
    assert r.status_code == 409

    public = api.get("/api/v1/public/site").json()
    assert public["tagline"] == "Two friends, one cabinet"
    assert public["contact_email"] == "hello@gincabinet.example"
    assert "default_gin_public" not in public and "version" not in public

    # The logo counts as "in use" in the media library.
    assert api.delete(f"/api/v1/admin/media/{logo['id']}").status_code == 409


def test_invalid_contact_email(api):
    version = api.get(SETTINGS).json()["version"]
    r = api.patch(SETTINGS, json={"version": version, "contact_email": "not-an-email"})
    assert r.status_code == 422


def test_default_gin_visibility(api):
    assert make_gin(api)["public_visible"] is False
    version = api.get(SETTINGS).json()["version"]
    api.patch(SETTINGS, json={"version": version, "default_gin_public": True})
    assert make_gin(api, name="Second")["public_visible"] is True
    # An explicit choice still wins.
    assert make_gin(api, name="Third", public_visible=False)["public_visible"] is False


# ---------------- Profile ----------------


def test_profile_and_email_change_needs_password(api):
    profile = api.get(PROFILE).json()
    assert profile["username"] == "anna"
    assert profile["recovery_codes_left"] == 10
    assert profile["notices"] == []

    r = api.patch(PROFILE, json={"display_name": "Anna B."})
    assert r.json()["display_name"] == "Anna B."
    r = api.patch(PROFILE, json={"email": "new@example.com"})
    assert r.status_code == 403
    r = api.patch(PROFILE, json={"email": "new@example.com", "current_password": PASSWORD})
    assert r.json()["email"] == "new@example.com"


def test_change_password_keeps_this_session_only(api, admin, client, db):
    r = api.post(
        f"{PROFILE}/password", json={"current_password": "wrong", "new_password": NEW_PASSWORD}
    )
    assert r.status_code == 403
    r = api.post(
        f"{PROFILE}/password", json={"current_password": PASSWORD, "new_password": "short"}
    )
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "weak_password"
    r = api.post(
        f"{PROFILE}/password", json={"current_password": PASSWORD, "new_password": NEW_PASSWORD}
    )
    assert r.status_code == 204
    assert api.get(PROFILE).status_code == 200  # still signed in here

    # The old password no longer works; the new one does.
    api.post("/api/v1/auth/logout")
    r = client.post("/api/v1/auth/login", json={"username": "anna", "password": PASSWORD})
    assert r.status_code == 401
    r = client.post("/api/v1/auth/login", json={"username": "anna", "password": NEW_PASSWORD})
    assert r.status_code == 200


def test_new_recovery_codes(api, admin):
    r = api.post(f"{PROFILE}/recovery-codes", json={"current_password": PASSWORD})
    codes = r.json()["codes"]
    assert len(codes) == 10
    assert set(codes).isdisjoint(admin.recovery_codes)  # the old ones are gone


def test_move_mfa_to_a_new_app(api, admin, client):
    r = api.post(f"{PROFILE}/mfa/start", json={"current_password": PASSWORD})
    setup = r.json()
    assert setup["uri"].startswith("otpauth://")
    assert api.get(PROFILE).json()["mfa_setup_pending"] is True

    # A wrong code changes nothing.
    r = api.post(f"{PROFILE}/mfa/confirm", json={"code": "000000"})
    assert r.status_code == 422

    new_code = pyotp.TOTP(setup["secret"]).now()
    r = api.post(f"{PROFILE}/mfa/confirm", json={"code": new_code})
    assert r.status_code == 200
    assert len(r.json()["codes"]) == 10
    assert api.get(PROFILE).json()["mfa_setup_pending"] is False

    # Signing in now needs a code from the new app; the old app's code fails.
    api.post("/api/v1/auth/logout")
    client.post("/api/v1/auth/login", json={"username": "anna", "password": PASSWORD})
    old_code = admin.current_code()
    if old_code != new_code:
        assert client.post("/api/v1/auth/mfa/verify", json={"code": old_code}).status_code == 401
    r = client.post("/api/v1/auth/mfa/verify", json={"code": pyotp.TOTP(setup["secret"]).now()})
    assert r.status_code == 200


# ---------------- The other admin ----------------


def test_reset_other_admins_password_is_deliberate_and_visible(api, db, client):
    other = make_admin(db, username="bertil", email="bertil@example.com")
    accounts = api.get(ADMINS).json()
    assert [(a["username"], a["is_you"]) for a in accounts] == [("anna", True), ("bertil", False)]

    url = f"{ADMINS}/{other.user.id}/reset-password"
    base = {
        "current_password": PASSWORD,
        "confirm_username": "bertil",
        "new_password": NEW_PASSWORD,
    }
    assert api.post(url, json={**base, "current_password": "wrong"}).status_code == 403
    r = api.post(url, json={**base, "confirm_username": "bert"})
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "confirmation_mismatch"
    me = next(a for a in accounts if a["is_you"])
    assert api.post(f"{ADMINS}/{me['id']}/reset-password", json=base).status_code == 422

    assert api.post(url, json=base).status_code == 204
    audit = api.get("/api/v1/admin/audit?action=user.password_reset_by_admin").json()
    assert audit["meta"]["total"] == 1

    # Bertil signs in with the temporary password and sees who reset it.
    api.post("/api/v1/auth/logout")
    other.password = NEW_PASSWORD
    sign_in(client, other)
    notices = client.get(PROFILE).json()["notices"]
    assert [(n["action"], n["by"]) for n in notices] == [("user.password_reset_by_admin", "Anna")]
