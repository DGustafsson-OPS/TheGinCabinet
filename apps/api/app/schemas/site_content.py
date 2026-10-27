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


class ContactMessageOut(BaseModel):
    id: uuid.UUID
    name: str
    email: str
    message: str
    created_at: datetime
    read_at: datetime | None


class ContactRead(BaseModel):
    read: bool
