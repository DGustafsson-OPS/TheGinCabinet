"""Website content edited in the admin area without touching code.

* ``page_texts``: the fixed texts on the home and About pages (and the
  footer). Each text has a default in ``services/page_texts.py``; a row here
  exists only once someone has changed it, so "reset to default" simply
  deletes the row.
* ``contact_messages``: messages sent with the public contact form, read in
  Admin → Messages.
"""

import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models._mixins import Versioned
from app.models._types import UTCDateTime, UUIDType, new_uuid, utcnow
from app.models.user import User


class PageText(Versioned, Base):
    __tablename__ = "page_texts"

    # e.g. "home.intro"; the list of keys lives in services/page_texts.py.
    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[str] = mapped_column(Text)
    updated_by_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    updated_by: Mapped[User | None] = relationship(lazy="joined")


class ContactMessage(Base):
    __tablename__ = "contact_messages"
    __table_args__ = (Index("ix_contact_messages_created_at", "created_at"),)

    id: Mapped[uuid.UUID] = mapped_column(UUIDType, primary_key=True, default=new_uuid)
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(254))
    message: Mapped[str] = mapped_column(Text)
    # A keyed hash of the sender's IP address, only to limit how many messages
    # one address can send per hour. The address itself is never stored.
    sender_hash: Mapped[str] = mapped_column(String(64), index=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    read_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
