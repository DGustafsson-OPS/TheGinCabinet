"""JSON shapes for the Gin Journal (spec §10A).

The article body is a list of *blocks*. Each block type is its own small
schema, and ``Block`` combines them into a *discriminated union*: Pydantic
reads the ``"type"`` key first and then checks the block against the
matching schema only. ``extra="forbid"`` rejects unknown keys, so nobody can
sneak an ``"html"`` field into an article.

Links are written inside text as ``[label](address)``. Only ``https://``,
``http://`` and site paths starting with ``/`` are accepted, so
``javascript:`` links are impossible (spec §10A "safe links").
"""

import re
import uuid
from datetime import datetime
from typing import Annotated, Any, Literal

from pydantic import AfterValidator, AwareDatetime, BaseModel, ConfigDict, Field

from app.models import RelationKind
from app.schemas.catalogue import SLUG_PATTERN
from app.schemas.cocktails import PublicCocktailCard
from app.schemas.common import MediaSummary
from app.schemas.editorial import Person, PublicReviewCard
from app.schemas.public import PublicGinCard

# `[label](address)`: the label can't contain "]" or a line break.
LINK_PATTERN = re.compile(r"\[([^\]\n]+)\]\(([^)\s]*)\)")
SAFE_URL = re.compile(r"^(https?://[^\s<>\"]+|/[^\s<>\"]*)$")


def check_links(text: str) -> str:
    for match in LINK_PATTERN.finditer(text):
        url = match.group(2)
        if not SAFE_URL.match(url):
            raise ValueError(
                f"The link address {url!r} isn't allowed: use https://… or a /path on this site."
            )
    return text


InlineText = Annotated[str, Field(min_length=1, max_length=10_000), AfterValidator(check_links)]


class _Block(BaseModel):
    model_config = ConfigDict(extra="forbid")


class HeadingBlock(_Block):
    type: Literal["heading"]
    level: Literal[2, 3] = 2  # H1 is the article title, so sections start at H2
    text: str = Field(min_length=1, max_length=200)


class ParagraphBlock(_Block):
    type: Literal["paragraph"]
    text: InlineText


class ListBlock(_Block):
    type: Literal["list"]
    ordered: bool = False
    items: list[InlineText] = Field(min_length=1, max_length=100)


class QuoteBlock(_Block):
    type: Literal["quote"]
    text: InlineText
    cite: str | None = Field(default=None, max_length=200)


class ImageBlock(_Block):
    type: Literal["image"]
    media_id: uuid.UUID
    caption: str | None = Field(default=None, max_length=300)
    # "full": across the text column. "left"/"right": beside the text that
    # follows, which flows around it (full width on phones).
    align: Literal["full", "left", "right"] = "full"


class CardBlock(_Block):
    """An embedded gin/review/cocktail/article card, by reference (never HTML)."""

    type: Literal["card"]
    kind: RelationKind
    id: uuid.UUID


Block = Annotated[
    HeadingBlock | ParagraphBlock | ListBlock | QuoteBlock | ImageBlock | CardBlock,
    Field(discriminator="type"),
]

TagName = Annotated[str, Field(min_length=1, max_length=60)]


class RelationIn(BaseModel):
    kind: RelationKind
    id: uuid.UUID


# ---------------- Categories ----------------


class CategoryIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    slug: str | None = Field(default=None, max_length=100, pattern=SLUG_PATTERN)
    description: str | None = Field(default=None, max_length=1000)
    display_order: int = Field(default=0, ge=0, le=1000)


class CategoryPatch(BaseModel):
    version: int
    name: str | None = Field(default=None, min_length=1, max_length=80)
    slug: str | None = Field(default=None, max_length=100, pattern=SLUG_PATTERN)
    description: str | None = Field(default=None, max_length=1000)
    display_order: int | None = Field(default=None, ge=0, le=1000)


class CategoryRef(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    slug: str


class CategoryOut(CategoryRef):
    description: str | None
    display_order: int
    post_count: int = 0
    version: int


# ---------------- Posts (admin) ----------------


class PostIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    slug: str | None = Field(default=None, max_length=150, pattern=SLUG_PATTERN)
    excerpt: str | None = Field(default=None, max_length=600)
    body_blocks: list[Block] = Field(default_factory=list, max_length=300)
    category_id: uuid.UUID | None = None
    tags: list[TagName] = Field(default_factory=list, max_length=20)
    # Byline. Defaults to the admin creating the post.
    author_id: uuid.UUID | None = None
    hero_media_id: uuid.UUID | None = None
    hero_credit: str | None = Field(default=None, max_length=200)
    social_media_id: uuid.UUID | None = None
    featured: bool = False
    seo_title: str | None = Field(default=None, max_length=70)
    seo_description: str | None = Field(default=None, max_length=170)
    relations: list[RelationIn] = Field(default_factory=list, max_length=30)


class PostPatch(BaseModel):
    version: int
    title: str | None = Field(default=None, min_length=1, max_length=200)
    slug: str | None = Field(default=None, max_length=150, pattern=SLUG_PATTERN)
    excerpt: str | None = Field(default=None, max_length=600)
    body_blocks: list[Block] | None = Field(default=None, max_length=300)
    category_id: uuid.UUID | None = None
    tags: list[TagName] | None = Field(default=None, max_length=20)
    author_id: uuid.UUID | None = None
    hero_media_id: uuid.UUID | None = None
    hero_credit: str | None = Field(default=None, max_length=200)
    social_media_id: uuid.UUID | None = None
    featured: bool | None = None
    seo_title: str | None = Field(default=None, max_length=70)
    seo_description: str | None = Field(default=None, max_length=170)
    relations: list[RelationIn] | None = Field(default=None, max_length=30)
    # The editor's autosave sets this: it is refused unless the post is a
    # draft, so an autosave can never change what is live (spec A12).
    autosave: bool = False


class VersionOnly(BaseModel):
    version: int


class ScheduleIn(BaseModel):
    version: int
    # "Aware" = it must include a time zone, e.g. 2026-11-01T09:00:00+01:00.
    scheduled_at: AwareDatetime


class BulkItem(BaseModel):
    id: uuid.UUID
    version: int


class BulkArchiveIn(BaseModel):
    items: list[BulkItem] = Field(min_length=1, max_length=100)


class BulkResult(BaseModel):
    archived: int
    skipped: list[str]  # titles that changed meanwhile or can't be archived


class RelationOut(BaseModel):
    kind: RelationKind
    id: uuid.UUID
    label: str  # e.g. "Hernö Swedish Excellence"; "(missing)" if it was deleted
    public: bool  # is the target visible on the public website?


class PostOut(BaseModel):
    id: uuid.UUID
    slug: str
    title: str
    excerpt: str | None
    body_blocks: list[dict[str, Any]]
    status: str
    # True only when visitors can read it right now. The status alone could
    # mislead: "scheduled" isn't live yet (spec A11).
    is_live: bool
    author: Person
    edited_by: Person | None
    category: CategoryRef | None
    tags: list[str]
    hero_media_id: uuid.UUID | None
    hero_image: MediaSummary | None
    hero_credit: str | None
    social_media_id: uuid.UUID | None
    featured: bool
    seo_title: str | None
    seo_description: str | None
    relations: list[RelationOut]
    reading_minutes: int
    published_at: datetime | None
    scheduled_at: datetime | None
    version: int
    created_at: datetime
    updated_at: datetime


# ---------------- Public ----------------


class PublicTagRef(BaseModel):
    name: str
    slug: str


class PublicCategoryRef(BaseModel):
    name: str
    slug: str


class PublicPostCard(BaseModel):
    """An article in a listing (spec B01: image, category, headline, excerpt, byline, time)."""

    slug: str
    title: str
    excerpt: str | None
    category: PublicCategoryRef | None
    tags: list[PublicTagRef]
    author_name: str
    published_at: datetime | None  # None only in an admin preview of a draft
    reading_minutes: int
    image: MediaSummary | None
    featured: bool


class PublicPost(PublicPostCard):
    """The full article (spec B02)."""

    # Blocks ready to display: image blocks carry the image, card blocks the
    # card. Embedded items that aren't public are left out.
    body: list[dict[str, Any]]
    hero_credit: str | None
    seo_title: str | None
    seo_description: str | None
    social_image: MediaSummary | None
    updated_at: datetime
    gins: list[PublicGinCard]
    reviews: list[PublicReviewCard]
    cocktails: list[PublicCocktailCard]
    related: list[PublicPostCard]


class PublicCategory(PublicCategoryRef):
    description: str | None
    post_count: int


class PublicTag(PublicTagRef):
    post_count: int
