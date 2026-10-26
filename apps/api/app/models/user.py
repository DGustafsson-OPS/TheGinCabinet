"""The ``users`` table: the two administrator accounts (spec §1, §7)."""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models._types import UTCDateTime, UUIDType, new_uuid, utcnow


class User(Base):
    __tablename__ = "users"

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
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    last_login_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)

    def __repr__(self) -> str:  # how the object prints when debugging
        return f"<User {self.username}>"
