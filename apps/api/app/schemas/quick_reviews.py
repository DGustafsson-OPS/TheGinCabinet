"""JSON shapes for quick reviews: a gin (juniper berries) or a tonic (tonic
bottles) rated 1–5, and a line or two."""

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Annotated

from pydantic import AfterValidator, BaseModel, Field, model_validator

from app.schemas.catalogue import GinSummary
from app.schemas.cocktails import TonicSummary
from app.schemas.common import Fixed1
from app.schemas.editorial import Person


def _whole_or_half(value: Decimal) -> Decimal:
    if (value * 2) % 1 != 0:
        raise ValueError("use whole or half berries, e.g. 4 or 4.5")
    return value


# 1 to 5 juniper berries, in halves.
Berries = Annotated[Decimal, Field(ge=1, le=5), AfterValidator(_whole_or_half)]
Note = Annotated[str | None, Field(default=None, max_length=280)]


class QuickReviewIn(BaseModel):
    # Exactly one: the gin or the tonic being rated.
    gin_id: uuid.UUID | None = None
    tonic_id: uuid.UUID | None = None
    rating: Berries
    note: Note = None
    author_id: uuid.UUID | None = None  # defaults to the person saving it

    @model_validator(mode="after")
    def _gin_or_tonic(self):
        if (self.gin_id is None) == (self.tonic_id is None):
            raise ValueError("rate either a gin or a tonic")
        return self


class QuickReviewPatch(BaseModel):
    version: int
    rating: Berries | None = None
    note: Note = None
    author_id: uuid.UUID | None = None


class QuickReviewOut(BaseModel):
    id: uuid.UUID
    gin: GinSummary | None  # one of these two
    tonic: TonicSummary | None
    public: bool  # is the gin or tonic shown on the website?
    author: Person
    rating: Fixed1  # berries, 1.0–5.0
    note: str | None
    version: int
    created_at: datetime
    updated_at: datetime


class PublicQuickReview(BaseModel):
    author_name: str
    rating: Fixed1  # berries, 1.0–5.0
    note: str | None
    created_at: datetime
