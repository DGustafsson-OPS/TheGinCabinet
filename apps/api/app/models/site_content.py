"""Website content edited in the admin area without touching code.

* ``page_texts``: the fixed texts on the home and About pages (and the
  footer). Each text has a default in ``services/page_texts.py``; a row here
  exists only once someone has changed it, so "reset to default" simply
  deletes the row.
* ``contact_messages``: messages sent with the public contact form, read in
  Admin → Messages. New ones land in the Inbox; admins can move them into
  their own folders (``message_folders``), mark them as spam (deleted 90 days
  later) and keep notes on them (``contact_message_notes``), e.g. a copy of
  the reply they sent.
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


class MessageFolder(Base):
    """A folder for contact messages, such as "Ideas" or "Dennis"."""

    __tablename__ = "message_folders"

    id: Mapped[uuid.UUID] = mapped_column(UUIDType, primary_key=True, default=new_uuid)
    name: Mapped[str] = mapped_column(String(60), unique=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)


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
    # None = the Inbox.
    folder_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("message_folders.id", ondelete="SET NULL"), nullable=True, index=True
    )
    # Set when marked as spam: the message then shows only under Spam and is
    # deleted 90 days after this moment (services/maintenance.py).
    spam_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True, index=True)

    folder: Mapped[MessageFolder | None] = relationship(lazy="joined")
    notes: Mapped[list["ContactMessageNote"]] = relationship(
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="ContactMessageNote.created_at",
    )


class ContactMessageNote(Base):
    """An admin's note on a message, e.g. "Replied 3 May:" and a copy of the reply."""

    __tablename__ = "contact_message_notes"

    id: Mapped[uuid.UUID] = mapped_column(UUIDType, primary_key=True, default=new_uuid)
    message_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("contact_messages.id", ondelete="CASCADE"), index=True
    )
    author_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    text: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)

    author: Mapped[User | None] = relationship(lazy="joined")
