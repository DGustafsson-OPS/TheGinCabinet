"""JSON shapes for media, tastings and reviews (spec §5 A05, A06, A09).

Public reviews have their *own* small schemas at the bottom: they contain only
what visitors may see (spec §8 "Never return private inventory fields from
public endpoints").
"""

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models import FLAVOUR_KEYS, ReviewStatus
from app.schemas.catalogue import SLUG_PATTERN, GinSummary
from app.schemas.common import Fixed1, Fixed2

Rating = Annotated[Decimal, Field(ge=0, le=10, max_digits=3, decimal_places=1)]
LongText = Annotated[str, Field(max_length=20_000)]


class Person(BaseModel):
    """An admin as shown next to content: name only."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    display_name: str


# ---------------- Media ----------------


class MediaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    url: str = ""
    original_filename: str | None
    mime: str
    width: int
    height: int
    size_bytes: int
    alt: str | None
    decorative: bool
    credit: str | None
    rights: str | None
    uploaded_by_id: uuid.UUID | None
    version: int
    created_at: datetime
    # Where the image is used (spec A09 "usage references").
    used_by: list[str] = []


class MediaPatch(BaseModel):
    version: int
    alt: str | None = Field(default=None, max_length=500)
    decorative: bool | None = None
    credit: str | None = Field(default=None, max_length=200)
    rights: str | None = Field(default=None, max_length=200)


class MediaSummary(BaseModel):
    id: uuid.UUID
    url: str
    alt: str | None
    width: int
    height: int


# ---------------- Tastings ----------------


def _check_flavours(value: dict[str, int] | None) -> dict[str, int] | None:
    if value is None:
        return None
    unknown = set(value) - set(FLAVOUR_KEYS)
    if unknown:
        raise ValueError(f"unknown flavours: {', '.join(sorted(unknown))}")
    if any(not 0 <= score <= 5 for score in value.values()):
        raise ValueError("each flavour score must be between 0 and 5")
    return value


class TastingIn(BaseModel):
    gin_id: uuid.UUID
    bottle_id: uuid.UUID | None = None
    tasted_on: date
    context: LongText | None = None
    nose: LongText | None = None
    palate: LongText | None = None
    finish: LongText | None = None
    flavours: dict[str, int] = Field(default_factory=dict)
    rating: Rating | None = None
    tonic: str | None = Field(default=None, max_length=160)
    garnish: str | None = Field(default=None, max_length=160)
    private_notes: LongText | None = None

    _flavours = field_validator("flavours")(_check_flavours)


class TastingPatch(BaseModel):
    version: int
    bottle_id: uuid.UUID | None = None
    tasted_on: date | None = None
    context: LongText | None = None
    nose: LongText | None = None
    palate: LongText | None = None
    finish: LongText | None = None
    flavours: dict[str, int] | None = None
    rating: Rating | None = None
    tonic: str | None = Field(default=None, max_length=160)
    garnish: str | None = Field(default=None, max_length=160)
    private_notes: LongText | None = None

    _flavours = field_validator("flavours")(_check_flavours)


class TastingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    gin: GinSummary
    author: Person
    bottle_id: uuid.UUID | None
    tasted_on: date
    context: str | None
    nose: str | None
    palate: str | None
    finish: str | None
    flavours: dict[str, int]
    rating: Fixed1 | None
    tonic: str | None
    garnish: str | None
    private_notes: str | None
    version: int
    created_at: datetime
    updated_at: datetime


# ---------------- Reviews (admin) ----------------


class ReviewIn(BaseModel):
    gin_id: uuid.UUID
    title: str = Field(min_length=1, max_length=200)
    slug: str | None = Field(default=None, max_length=150, pattern=SLUG_PATTERN)
    # Byline. Defaults to the admin creating the review.
    author_id: uuid.UUID | None = None
    tasting_id: uuid.UUID | None = None
    rating: Rating | None = None
    intro: LongText | None = None
    nose: LongText | None = None
    palate: LongText | None = None
    finish: LongText | None = None
    tonic: str | None = Field(default=None, max_length=160)
    garnish: str | None = Field(default=None, max_length=160)
    verdict: LongText | None = None
    cover_media_id: uuid.UUID | None = None
    seo_title: str | None = Field(default=None, max_length=70)
    seo_description: str | None = Field(default=None, max_length=170)


class ReviewPatch(BaseModel):
    version: int
    gin_id: uuid.UUID | None = None
    title: str | None = Field(default=None, min_length=1, max_length=200)
    slug: str | None = Field(default=None, max_length=150, pattern=SLUG_PATTERN)
    author_id: uuid.UUID | None = None
    rating: Rating | None = None
    intro: LongText | None = None
    nose: LongText | None = None
    palate: LongText | None = None
    finish: LongText | None = None
    tonic: str | None = Field(default=None, max_length=160)
    garnish: str | None = Field(default=None, max_length=160)
    verdict: LongText | None = None
    cover_media_id: uuid.UUID | None = None
    seo_title: str | None = Field(default=None, max_length=70)
    seo_description: str | None = Field(default=None, max_length=170)


class ReviewStatusChange(BaseModel):
    version: int
    status: ReviewStatus


class ReviewOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    gin: GinSummary
    gin_public: bool = False
    author: Person
    tasting_id: uuid.UUID | None
    slug: str
    status: str
    title: str
    rating: Fixed1 | None
    intro: str | None
    nose: str | None
    palate: str | None
    finish: str | None
    tonic: str | None
    garnish: str | None
    verdict: str | None
    cover_media_id: uuid.UUID | None
    # Not called "cover": that name is the raw database relationship on Review.
    cover_image: MediaSummary | None = None
    seo_title: str | None
    seo_description: str | None
    published_at: datetime | None
    version: int
    created_at: datetime
    updated_at: datetime


class RevisionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    revision_number: int
    actor_id: uuid.UUID | None
    status: str
    note: str | None
    saved_at: datetime
    snapshot: dict


# ---------------- Reviews (public) ----------------


class PublicGinRef(BaseModel):
    slug: str
    display_name: str
    country: str | None
    abv: Fixed2


class PublicReviewCard(BaseModel):
    """A review in a public list (spec P04: author, date, score, teaser, photo, gin link)."""

    slug: str
    title: str
    author_name: str
    published_at: datetime
    rating: Fixed1 | None
    teaser: str
    cover: MediaSummary | None
    gin: PublicGinRef


class PublicReview(PublicReviewCard):
    """The full public review page (spec P05)."""

    intro: str | None
    nose: str | None
    palate: str | None
    finish: str | None
    tonic: str | None
    garnish: str | None
    verdict: str | None
    seo_title: str | None
    seo_description: str | None
    updated_at: datetime


SortOrder = Literal["recent", "rating"]
