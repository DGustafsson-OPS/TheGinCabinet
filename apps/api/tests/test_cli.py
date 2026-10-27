"""The admin bootstrap command (spec §10B step 5)."""

import pytest
from sqlalchemy import select

from app import cli
from app.models import AuditEvent, RecoveryCode, User

GOOD_PASSWORD = "a very long juniper passphrase"


@pytest.fixture
def typed_password(monkeypatch):
    """Pretend the user typed GOOD_PASSWORD at every hidden prompt.

    ``monkeypatch`` temporarily replaces a function for the duration of one test.
    """
    monkeypatch.setattr(cli.getpass, "getpass", lambda prompt="": GOOD_PASSWORD)


def _create(username: str, email: str) -> None:
    cli.main(["create-admin", "--username", username, "--email", email, "--display-name", "X"])


def test_create_admin_sets_up_mfa_and_audits(typed_password, db, capsys):
    _create("Anna", "anna@example.com")

    user = db.scalar(select(User))
    assert user.username == "anna"  # usernames are stored lower-case
    assert user.totp_secret_encrypted
    assert len(db.scalars(select(RecoveryCode)).all()) == 10
    assert db.scalar(select(AuditEvent.action)) == "user.create"
    assert "Recovery codes" in capsys.readouterr().out


def test_only_two_admins_allowed(typed_password):
    _create("anna", "anna@example.com")
    _create("bertil", "bertil@example.com")
    with pytest.raises(SystemExit):
        _create("carl", "carl@example.com")


def test_reset_password_revokes_and_audits(typed_password, db):
    _create("anna", "anna@example.com")
    cli.main(["reset-password", "--username", "anna"])
    actions = db.scalars(select(AuditEvent.action).order_by(AuditEvent.occurred_at)).all()
    assert actions == ["user.create", "user.password_reset"]
