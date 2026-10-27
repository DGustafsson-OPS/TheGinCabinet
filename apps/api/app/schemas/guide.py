"""JSON shapes for the Gin guide (lasting reference pages).

The body uses the Journal's blocks (``app.schemas.blog.Block``), so the same
checks apply: no HTML, and only safe link addresses.
"""

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from app.schemas.blog import Block
from app.schemas.catalogue import SLUG_PATTERN
from app.schemas.common import MediaSummary
from app.schemas.editorial import Person


class GuidePageIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    slug: str | None = Field(default=None, max_length=150, pattern=SLUG_PATTERN)
    summary: str | None = Field(default=None, max_length=600)
    body_blocks: list[Block] = Field(default_factory=list, max_length=300)
    hero_media_id: uuid.UUID | None = None
    hero_credit: str | None = Field(default=None, max_length=200)
    seo_title: str | None = Field(default=None, max_length=70)
    seo_description: str | None = Field(default=None, max_length=170)


class GuidePagePatch(BaseModel):
    version: int
    title: str | None = Field(default=None, min_length=1, max_length=200)
    slug: str | None = Field(default=None, max_length=150, pattern=SLUG_PATTERN)
    summary: str | None = Field(default=None, max_length=600)
    body_blocks: list[Block] | None = Field(default=None, max_length=300)
    hero_media_id: uuid.UUID | None = None
    hero_credit: str | None = Field(default=None, max_length=200)
    seo_title: str | None = Field(default=None, max_length=70)
    seo_description: str | None = Field(default=None, max_length=170)
    # True shows the page on the website, False takes it off again.
    published: bool | None = None


class GuideOrder(BaseModel):
    """Every page's id, in the order they should appear."""

    ids: list[uuid.UUID] = Field(min_length=1, max_length=200)


class GuidePageOut(BaseModel):
    id: uuid.UUID
    slug: str
    title: str
    summary: str | None
    body_blocks: list[dict[str, Any]]
    hero_media_id: uuid.UUID | None
    hero_image: MediaSummary | None
    hero_credit: str | None
    seo_title: str | None
    seo_description: str | None
    position: int
    published: bool
    published_at: datetime | None
    edited_by: Person | None
    version: int
    created_at: datetime
    updated_at: datetime


# ---------------- Public ----------------


class PublicGuideCard(BaseModel):
    slug: str
    title: str
    summary: str | None
    image: MediaSummary | None


class PublicGuidePage(PublicGuideCard):
    # Blocks ready to display, as for Journal articles: image blocks carry the
    # image, card blocks the card; items visitors can't see are left out.
    body: list[dict[str, Any]]
    hero_credit: str | None
    seo_title: str | None
    seo_description: str | None
    updated_at: datetime
    # The pages before and after this one, for "previous / next" links.
    previous: PublicGuideCard | None
    next: PublicGuideCard | None
