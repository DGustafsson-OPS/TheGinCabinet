"""JSON shapes for page texts and contact messages."""

import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.settings import Email


class PageTextOut(BaseModel):
    key: str
    page: str
    label: str
    hint: str
    formatted: bool
    max_length: int
    default: str
    value: str  # what the site shows now
    customised: bool  # False = the default is showing
    version: int  # 0 while the default is showing
    updated_at: datetime | None
    updated_by: str | None


class PageTextPatch(BaseModel):
    version: int  # 0 if you edited the default
    value: str = Field(min_length=1, max_length=10_000)


# ---------------- Contact form ----------------


class ContactIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: Email
    message: str = Field(min_length=5, max_length=5000)
    # The Cloudflare Turnstile answer from the widget on the page.
    turnstile_token: str = Field(default="", max_length=4096)
    # A field real visitors never see or fill in; bots often do.
    website: str = Field(default="", max_length=200)


class MessageFolderRef(BaseModel):
    id: uuid.UUID
    name: str


class MessageNoteOut(BaseModel):
    id: uuid.UUID
    text: str
    author_name: str | None  # None if the account was removed
    created_at: datetime


class ContactMessageOut(BaseModel):
    id: uuid.UUID
    name: str
    email: str
    message: str
    created_at: datetime
    read_at: datetime | None
    folder: MessageFolderRef | None  # None = the Inbox
    spam_at: datetime | None  # set = in Spam, deleted 90 days after this
    notes: list[MessageNoteOut]


class MessagePatch(BaseModel):
    """Only the fields sent change. ``folder_id: null`` moves back to the Inbox."""

    read: bool | None = None
    folder_id: uuid.UUID | None = None
    spam: bool | None = None


class MessageNoteIn(BaseModel):
    text: str = Field(min_length=1, max_length=10_000)


class MessageFolderIn(BaseModel):
    name: str = Field(min_length=1, max_length=60)


class MessageFolderOut(MessageFolderRef):
    count: int
    unread: int


class MessageBoxes(BaseModel):
    """What the Messages menu shows: the Inbox, each folder, and Spam."""

    inbox_count: int
    inbox_unread: int
    folders: list[MessageFolderOut]
    spam_count: int
