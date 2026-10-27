"""JSON shapes for cocktail recipes (spec §5 A07, §4 P06–P07)."""

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Annotated

from pydantic import BaseModel, Field, PlainSerializer, field_validator, model_validator

from app.models import CocktailStatus, Difficulty, Method, Unit
from app.schemas.catalogue import SLUG_PATTERN, GinSummary
from app.schemas.common import Fixed2
from app.schemas.editorial import MediaSummary, Person

# An amount shown without trailing zeros: 50.00 → "50", 1.50 → "1.5".
Quantity = Annotated[
    Decimal, PlainSerializer(lambda d: format(d.normalize(), "f"), return_type=str)
]
QuantityIn = Annotated[Decimal, Field(gt=0, max_digits=8, decimal_places=2)]

# ---------------- Admin: input ----------------


class IngredientLineIn(BaseModel):
    # Name of the ingredient; it's created in the ingredient list if new.
    name: str = Field(min_length=1, max_length=120)
    quantity: QuantityIn | None = None
    unit: Unit
    note: str | None = Field(default=None, max_length=160)
    optional: bool = False

    @model_validator(mode="after")
    def _top_up_has_no_amount(self):
        if self.unit == Unit.TOP_UP and self.quantity is not None:
            raise ValueError('"top up" has no amount; leave the quantity empty')
        return self


class StepIn(BaseModel):
    text: str = Field(min_length=1, max_length=2_000)


class PairingIn(BaseModel):
    gin_id: uuid.UUID
    priority: int = Field(default=1, ge=1, le=10)
    pairing_note: str | None = Field(default=None, max_length=300)


def _clean_tags(values: list[str] | None) -> list[str] | None:
    if values is None:
        return None
    seen: list[str] = []
    for raw in values:
        tag = raw.strip().lower()
        if tag and len(tag) <= 40 and tag not in seen:
            seen.append(tag)
    return seen


class CocktailIn(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    slug: str | None = Field(default=None, max_length=150, pattern=SLUG_PATTERN)
    intro: str | None = Field(default=None, max_length=10_000)
    method: Method = Method.BUILD
    glassware: str | None = Field(default=None, max_length=80)
    prep_minutes: int | None = Field(default=None, ge=0, le=600)
    difficulty: Difficulty = Difficulty.EASY
    servings_base: int = Field(default=1, ge=1, le=12)
    garnish: str | None = Field(default=None, max_length=160)
    garnish_quantity: QuantityIn | None = None
    tags: list[str] = Field(default_factory=list, max_length=12)
    cover_media_id: uuid.UUID | None = None
    seo_title: str | None = Field(default=None, max_length=70)
    seo_description: str | None = Field(default=None, max_length=170)
    ingredients: list[IngredientLineIn] = Field(default_factory=list, max_length=30)
    steps: list[StepIn] = Field(default_factory=list, max_length=30)
    gins: list[PairingIn] = Field(default_factory=list, max_length=10)

    _tags = field_validator("tags")(_clean_tags)


class CocktailPatch(BaseModel):
    """Lists (ingredients, steps, gins), when sent, replace the old lists completely."""

    version: int
    title: str | None = Field(default=None, min_length=1, max_length=160)
    slug: str | None = Field(default=None, max_length=150, pattern=SLUG_PATTERN)
    intro: str | None = Field(default=None, max_length=10_000)
    method: Method | None = None
    glassware: str | None = Field(default=None, max_length=80)
    prep_minutes: int | None = Field(default=None, ge=0, le=600)
    difficulty: Difficulty | None = None
    servings_base: int | None = Field(default=None, ge=1, le=12)
    garnish: str | None = Field(default=None, max_length=160)
    garnish_quantity: QuantityIn | None = None
    tags: list[str] | None = Field(default=None, max_length=12)
    cover_media_id: uuid.UUID | None = None
    seo_title: str | None = Field(default=None, max_length=70)
    seo_description: str | None = Field(default=None, max_length=170)
    ingredients: list[IngredientLineIn] | None = Field(default=None, max_length=30)
    steps: list[StepIn] | None = Field(default=None, max_length=30)
    gins: list[PairingIn] | None = Field(default=None, max_length=10)

    _tags = field_validator("tags")(_clean_tags)


class CocktailStatusChange(BaseModel):
    version: int
    status: CocktailStatus


# ---------------- Admin: output ----------------


class IngredientOut(BaseModel):
    id: uuid.UUID
    name: str
    category: str | None


class IngredientLineOut(BaseModel):
    name: str
    quantity: Quantity | None
    unit: str
    note: str | None
    optional: bool


class PairingOut(BaseModel):
    gin: GinSummary
    gin_public: bool
    priority: int
    pairing_note: str | None


class CocktailOut(BaseModel):
    id: uuid.UUID
    slug: str
    title: str
    intro: str | None
    method: str
    glassware: str | None
    prep_minutes: int | None
    difficulty: str
    servings_base: int
    garnish: str | None
    garnish_quantity: Quantity | None
    tags: list[str]
    status: str
    author: Person
    cover_media_id: uuid.UUID | None
    cover_image: MediaSummary | None
    seo_title: str | None
    seo_description: str | None
    ingredients: list[IngredientLineOut]
    steps: list[str]
    gins: list[PairingOut]
    published_at: datetime | None
    version: int
    created_at: datetime
    updated_at: datetime


# ---------------- Public ----------------


class PublicCocktailCard(BaseModel):
    """A recipe in the public library (spec P06: image, duration, filters)."""

    slug: str
    title: str
    teaser: str
    method: str
    difficulty: str
    prep_minutes: int | None
    glassware: str | None
    tags: list[str]
    cover: MediaSummary | None


class PublicGinPairing(BaseModel):
    slug: str
    display_name: str
    country: str | None
    abv: Fixed2
    pairing_note: str | None


class PublicCocktail(PublicCocktailCard):
    """The full recipe, scaled to ``servings`` (spec P07)."""

    intro: str | None
    servings: int
    servings_base: int
    ingredients: list[IngredientLineOut]
    garnish: str | None
    garnish_quantity: Quantity | None
    steps: list[str]
    recommended_gins: list[PublicGinPairing]
    seo_title: str | None
    seo_description: str | None
    published_at: datetime
    updated_at: datetime
