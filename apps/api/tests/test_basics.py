"""Health check, error format and the password/MFA helper functions."""

import pyotp

from app.security import crypto, mfa
from app.security.passwords import hash_password, password_problems, verify_password


def test_health_reports_ok(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok", "database": "ok"}


def test_unknown_route_uses_standard_error_format(client):
    r = client.get("/api/v1/does-not-exist")
    assert r.status_code == 404
    assert r.json()["error"]["code"] == "not_found"


def test_validation_errors_have_stable_codes(client):
    r = client.post("/api/v1/auth/login", json={"username": ""})
    assert r.status_code == 422
    body = r.json()["error"]
    assert body["code"] == "validation_error"
    assert {d["field"] for d in body["details"]} == {"username", "password"}


def test_password_hash_roundtrip():
    stored = hash_password("a long gin passphrase")
    assert stored.startswith("$argon2id$")  # spec §9: Argon2id
    assert verify_password(stored, "a long gin passphrase")
    assert not verify_password(stored, "wrong")
    assert not verify_password(None, "anything")


def test_password_policy():
    assert password_problems("short") != []
    assert password_problems("anna-likes-gin-a-lot", username="anna") != []
    assert password_problems("juniper berries and tonic") == []


def test_totp_secret_is_encrypted_and_codes_verify():
    secret = mfa.new_totp_secret()
    stored = crypto.encrypt(secret)
    assert secret not in stored
    assert crypto.decrypt(stored) == secret
    assert mfa.verify_totp(secret, pyotp.TOTP(secret).now())
    assert not mfa.verify_totp(mfa.new_totp_secret(), pyotp.TOTP(secret).now())


def test_recovery_codes_are_hashed_and_normalised():
    code = mfa.new_recovery_codes()[0]
    stored = mfa.hash_recovery_code(code)
    assert code not in stored
    assert mfa.verify_recovery_code(stored, f"  {code.upper()} ")
