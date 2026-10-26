"""JSON shapes for tonics and tonic reviews (a simple catalogue: no stock)."""

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import BaseModel, Field, field_validator

from app.models import TonicReviewStatus, TonicStyle
from app.schemas.catalogue import ShortText, Slug, _clean_botanicals
from app.schemas.common import Fixed1, MediaSummary
from app.schemas.editorial import Person

Rating = Annotated[Decimal, Field(ge=0, le=10, max_digits=3, decimal_places=1)]

# ---------------- Admin ----------------


class TonicIn(BaseModel):
    brand: ShortText
    name: ShortText
    slug: Slug | None = None
    style: TonicStyle = TonicStyle.INDIAN
    country: str | None = Field(default=None, max_length=80)
    flavour_notes: list[str] = Field(default_factory=list, max_length=20)
    description: str | None = Field(default=None, max_length=10_000)
    image_media_id: uuid.UUID | None = None
    public_visible: bool = False

    # Same cleaning as gin botanicals: trimmed, lower-case, no duplicates.
    _notes = field_validator("flavour_notes")(_clean_botanicals)

    @field_validator("brand", "name")
    @classmethod
    def _strip(cls, value: str) -> str:
        return value.strip()


class TonicPatch(BaseModel):
    version: int
    brand: ShortText | None = None
    name: ShortText | None = None
    slug: Slug | None = None
    style: TonicStyle | None = None
    country: str | None = Field(default=None, max_length=80)
    flavour_notes: list[str] | None = Field(default=None, max_length=20)
    description: str | None = Field(default=None, max_length=10_000)
    image_media_id: uuid.UUID | None = None
    public_visible: bool | None = None

    _notes = field_validator("flavour_notes")(_clean_botanicals)


class TonicReviewIn(BaseModel):
    rating: Rating | None = None
    notes: str | None = Field(default=None, max_length=10_000)
    pairs_with: str | None = Field(default=None, max_length=300)
    # Byline. Defaults to the admin writing it.
    author_id: uuid.UUID | None = None


class TonicReviewPatch(BaseModel):
    version: int
    rating: Rating | None = None
    notes: str | None = Field(default=None, max_length=10_000)
    pairs_with: str | None = Field(default=None, max_length=300)
    author_id: uuid.UUID | None = None
    status: TonicReviewStatus | None = None  # "published" checks rating + notes


class TonicReviewOut(BaseModel):
    id: uuid.UUID
    author: Person
    rating: Fixed1 | None
    notes: str | None
    pairs_with: str | None
    status: str
    published_at: datetime | None
    version: int
    updated_at: datetime


class TonicOut(BaseModel):
    id: uuid.UUID
    slug: str
    brand: str
    name: str
    display_name: str
    style: str
    country: str | None
    flavour_notes: list[str]
    description: str | None
    image_media_id: uuid.UUID | None
    image: MediaSummary | None
    public_visible: bool
    reviews: list[TonicReviewOut]
    version: int
    created_at: datetime
    updated_at: datetime


# ---------------- Public ----------------


class PublicTonicCard(BaseModel):
    slug: str
    brand: str
    display_name: str
    style: str
    country: str | None
    image: MediaSummary | None
    rating: Fixed1 | None  # average of published reviews
    review_count: int


class PublicTonicReview(BaseModel):
    author_name: str
    rating: Fixed1 | None
    notes: str | None
    pairs_with: str | None
    published_at: datetime | None


class PublicTonic(PublicTonicCard):
    flavour_notes: list[str]
    description: str | None
    reviews: list[PublicTonicReview]
    updated_at: datetime


TonicSort = Literal["name", "rating"]
