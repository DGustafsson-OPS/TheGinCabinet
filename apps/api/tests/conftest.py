"""Shared test setup ("fixtures") for pytest.

A *fixture* is a function pytest runs to prepare something a test needs. A
test asks for it by naming it as a parameter, e.g. ``def test_x(client):``.
"""

import os
import tempfile
from dataclasses import dataclass

# Point the app at a throwaway database BEFORE importing it, because the
# database engine is created when app.db is first imported. By default that is
# a temporary SQLite file; set GC_TEST_DATABASE_URL to test against PostgreSQL.
_db_dir = tempfile.mkdtemp(prefix="gin-cabinet-tests-")
os.environ["GC_DATABASE_URL"] = os.environ.get(
    "GC_TEST_DATABASE_URL", f"sqlite:///{_db_dir}/test.db"
)
os.environ["GC_ALLOWED_ORIGINS"] = "http://localhost:3000"
os.environ["GC_MEDIA_DIR"] = f"{_db_dir}/media"
os.environ["GC_SCHEDULER_ENABLED"] = "false"  # tests call the jobs directly

import pyotp  # noqa: E402  (imports below must come after the env setup above)
import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.db import Base, SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models import RecoveryCode, User  # noqa: E402
from app.security import crypto, mfa  # noqa: E402
from app.security.passwords import hash_password  # noqa: E402

PASSWORD = "juniper berries and tonic"


@pytest.fixture(autouse=True)
def fresh_database():
    """Give every test empty tables (``autouse`` = applies to all tests)."""
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    yield


@pytest.fixture
def db():
    with SessionLocal() as session:
        yield session


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client


@dataclass
class AdminFixture:
    user: User
    password: str
    totp_secret: str
    recovery_codes: list[str]

    def current_code(self) -> str:
        return pyotp.TOTP(self.totp_secret).now()


def make_admin(db, username: str = "anna", email: str = "anna@example.com") -> AdminFixture:
    secret = mfa.new_totp_secret()
    user = User(
        username=username,
        email=email,
        display_name=username.title(),
        password_hash=hash_password(PASSWORD),
        totp_secret_encrypted=crypto.encrypt(secret),
    )
    db.add(user)
    db.flush()
    codes = mfa.new_recovery_codes()
    for code in codes:
        db.add(RecoveryCode(user_id=user.id, code_hash=mfa.hash_recovery_code(code)))
    db.commit()
    return AdminFixture(user=user, password=PASSWORD, totp_secret=secret, recovery_codes=codes)


@pytest.fixture
def admin(db) -> AdminFixture:
    return make_admin(db)


def sign_in(client: TestClient, admin: AdminFixture) -> str:
    """Do the full password + MFA login and return the CSRF token."""
    r = client.post(
        "/api/v1/auth/login", json={"username": admin.user.username, "password": admin.password}
    )
    assert r.status_code == 200, r.text
    r = client.post("/api/v1/auth/mfa/verify", json={"code": admin.current_code()})
    assert r.status_code == 200, r.text
    return r.json()["csrf_token"]


@pytest.fixture
def api(client, admin) -> TestClient:
    """A client that is fully signed in and sends the CSRF header on every request."""
    csrf = sign_in(client, admin)
    client.headers.update({"X-CSRF-Token": csrf})
    return client
