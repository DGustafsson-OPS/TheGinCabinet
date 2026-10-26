"""Tables that support signing in (spec §9).

* ``auth_sessions``: one row per logged-in browser. The cookie holds a random
  token; we store only a SHA-256 *hash* of it, so a leaked database cannot be
  used to hijack sessions.
* ``recovery_codes``: one-time MFA backup codes, stored hashed.
* ``login_attempts``: recent sign-in attempts, used to slow down password guessing.
"""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models._types import UTCDateTime, UUIDType, new_uuid, utcnow


class AuthSession(Base):
    __tablename__ = "auth_sessions"

    id: Mapped[uuid.UUID] = mapped_column(UUIDType, primary_key=True, default=new_uuid)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    # `index=True` because we look sessions up by user (spec §7: "foreign keys indexed").
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    # Sent back by the browser in the X-CSRF-Token header on every change request.
    csrf_token: Mapped[str] = mapped_column(String(64))
    # False after the password step, True after the 6-digit MFA code.
    mfa_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    last_seen_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    expires_at: Mapped[datetime] = mapped_column(UTCDateTime)
    revoked_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(64), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(255), nullable=True)


class RecoveryCode(Base):
    __tablename__ = "recovery_codes"

    id: Mapped[uuid.UUID] = mapped_column(UUIDType, primary_key=True, default=new_uuid)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    code_hash: Mapped[str] = mapped_column(String(255))
    used_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)


class LoginAttempt(Base):
    __tablename__ = "login_attempts"
    # A combined index makes "failed attempts for X in the last 15 minutes" fast.
    __table_args__ = (Index("ix_login_attempts_username_time", "username", "attempted_at"),)

    id: Mapped[uuid.UUID] = mapped_column(UUIDType, primary_key=True, default=new_uuid)
    username: Mapped[str] = mapped_column(String(64))
    ip_address: Mapped[str | None] = mapped_column(String(64), nullable=True)
    succeeded: Mapped[bool] = mapped_column(Boolean, default=False)
    attempted_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
