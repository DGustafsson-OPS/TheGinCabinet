"""JSON shapes for the public catalogue (spec §4 P01–P03, P08).

These contain only what visitors may see: never prices, bottle counts,
shelves, purchases or tastings (spec §1, P02 "no prices or bottle count").
"""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel

from app.schemas.cocktails import PublicCocktailCard
from app.schemas.common import Fixed1, Fixed2, MediaSummary
from app.schemas.editorial import PublicReviewCard

# "owned": at least one bottle is in the cabinet now; "previously_owned": we
# had it but the bottles are finished or given away (spec P02 badge).
CollectionStatus = Literal["owned", "previously_owned"] | None


class PublicDistilleryRef(BaseModel):
    slug: str
    name: str
    country: str | None


class PublicGinCard(BaseModel):
    slug: str
    display_name: str
    brand: str
    style: str
    abv: Fixed2
    country: str | None
    distillery: PublicDistilleryRef | None
    image: MediaSummary | None
    collection_status: CollectionStatus
    rating: Fixed1 | None  # average of published review ratings
    review_count: int


class PublicGin(PublicGinCard):
    edition: str
    description: str | None
    botanicals: list[str]
    images: list[MediaSummary]
    reviews: list[PublicReviewCard]
    cocktails: list[PublicCocktailCard]
    related: list[PublicGinCard]
    updated_at: datetime


class Facets(BaseModel):
    """The choices that actually exist, to build the collection filters."""

    styles: list[str]
    countries: list[str]
    botanicals: list[str]


class PublicDistilleryCard(BaseModel):
    slug: str
    name: str
    country: str | None
    region: str | None
    gin_count: int


class PublicDistillery(PublicDistilleryCard):
    description: str | None
    website: str | None
    gins: list[PublicGinCard]


class PublicStats(BaseModel):
    """Home page numbers (spec P01: public items only, never private bottles)."""

    gins: int
    reviews: int
    cocktails: int
    countries: int
