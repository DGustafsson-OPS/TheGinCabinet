"""The ``users`` table: the people who can sign in (spec §1, §7).

Two roles:

* **admin**: everything, including inventory, settings and other accounts.
  At most two (spec §1: "two distinct users with equal privileges").
* **editor**: writes and publishes content (Journal, reviews, tastings,
  cocktails, tonics, photos, page texts). No inventory, prices, settings,
  audit log or accounts.

New accounts are created by an admin as an *invitation*: the person opens a
one-time link, chooses their own password and sets up their own
authenticator app, so no password or MFA secret is ever handed over.
"""

import uuid
from datetime import datetime
from enum import StrEnum

from sqlalchemy import BigInteger, Boolean, CheckConstraint, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models._types import UTCDateTime, UUIDType, new_uuid, utcnow


class UserRole(StrEnum):
    ADMIN = "admin"
    EDITOR = "editor"


MAX_ADMINS = 2  # spec §1
MAX_ACCOUNTS = 10  # admins + editors, invitations included


class User(Base):
    __tablename__ = "users"
    __table_args__ = (CheckConstraint("role IN ('admin', 'editor')", name="role_valid"),)

    # `Mapped[...]` tells Python (and your editor) the type of each attribute;
    # `mapped_column(...)` tells SQLAlchemy how to store it in the database.
    id: Mapped[uuid.UUID] = mapped_column(UUIDType, primary_key=True, default=new_uuid)
    username: Mapped[str] = mapped_column(String(64), unique=True)
    email: Mapped[str] = mapped_column(String(254), unique=True)
    # Public byline name (e.g. on reviews). Emails are never shown publicly (spec §4 P09).
    display_name: Mapped[str] = mapped_column(String(120))
    # Argon2id hash, never the password itself.
    password_hash: Mapped[str] = mapped_column(Text)
    # The TOTP secret, encrypted with the app's secret key (see security/crypto.py).
    totp_secret_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    # A new secret being set up from the Settings page. It replaces the real
    # one only after the admin proves it works by typing a code from it.
    totp_pending_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    # The 30-second window of the last code accepted. A code from that window
    # (or an earlier one) is refused, so a code can't be used twice.
    totp_last_step: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    role: Mapped[str] = mapped_column(String(16), default=UserRole.ADMIN, server_default="admin")
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    # An open invitation: the SHA-256 of the one-time link's secret (never the
    # secret itself) and when it stops working. Both are cleared once the
    # person has chosen a password and set up their authenticator.
    invite_token_hash: Mapped[str | None] = mapped_column(String(64), nullable=True, unique=True)
    invite_expires_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    last_login_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)

    @property
    def invite_pending(self) -> bool:
        """Invited, but hasn't finished setting up the account yet."""
        return self.totp_secret_encrypted is None and self.invite_token_hash is not None

    def __repr__(self) -> str:  # how the object prints when debugging
        return f"<User {self.username}>"
