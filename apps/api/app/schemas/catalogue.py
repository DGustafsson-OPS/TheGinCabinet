"""JSON shapes for distilleries and gins (spec §5 A02).

Pattern used for every editable entity:

* ``XxxIn``: body for POST (create). Required fields have no default.
* ``XxxPatch``: body for PATCH (edit). Every field is optional; only the
  fields the client actually sends are changed (``model_dump(exclude_unset=True)``).
  ``version`` is required: it's the version the client loaded (see services/versioning.py).
* ``XxxOut``: what the API returns.

Money and ABV use ``Decimal`` (exact) and appear in JSON as strings such as "41.40".
"""

import re
import uuid
from datetime import datetime
from decimal import Decimal
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models import GinStyle
from app.schemas.common import Fixed2, MediaSummary

SLUG_PATTERN = r"^[a-z0-9]+(?:-[a-z0-9]+)*$"

# `Annotated[type, Field(...)]` attaches validation rules to a type, so the
# same rule can be reused in several schemas.
Abv = Annotated[Decimal, Field(gt=0, le=100, max_digits=5, decimal_places=2)]
Slug = Annotated[str, Field(min_length=1, max_length=150, pattern=SLUG_PATTERN)]
ShortText = Annotated[str, Field(min_length=1, max_length=160)]


def _clean_website(value: str | None) -> str | None:
    if value in (None, ""):
        return None
    if not re.match(r"^https?://[^\s]+$", value):
        raise ValueError("must start with http:// or https://")
    return value


def _clean_botanicals(values: list[str] | None) -> list[str] | None:
    """Lower-case, trim and de-duplicate, keeping the original order."""
    if values is None:
        return None
    seen: list[str] = []
    for raw in values:
        name = raw.strip().lower()
        if name and len(name) <= 80 and name not in seen:
            seen.append(name)
    return seen


# ---------- Distilleries ----------


class DistilleryIn(BaseModel):
    name: ShortText
    slug: Slug | None = None  # generated from the name when left out
    country: str | None = Field(default=None, max_length=80)
    region: str | None = Field(default=None, max_length=120)
    description: str | None = Field(default=None, max_length=10_000)
    website: str | None = Field(default=None, max_length=300)

    _website = field_validator("website")(_clean_website)


class DistilleryPatch(BaseModel):
    version: int
    name: ShortText | None = None
    slug: Slug | None = None
    country: str | None = Field(default=None, max_length=80)
    region: str | None = Field(default=None, max_length=120)
    description: str | None = Field(default=None, max_length=10_000)
    website: str | None = Field(default=None, max_length=300)

    _website = field_validator("website")(_clean_website)


class DistillerySummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    slug: str
    name: str


class DistilleryOut(DistillerySummary):
    country: str | None
    region: str | None
    description: str | None
    website: str | None
    gin_count: int = 0
    version: int
    created_at: datetime
    updated_at: datetime


# ---------- Gins ----------


class GinIn(BaseModel):
    brand: ShortText
    name: ShortText
    edition: str = Field(default="", max_length=120)
    slug: Slug | None = None
    style: GinStyle = GinStyle.OTHER
    abv: Abv
    country: str | None = Field(default=None, max_length=80)
    distillery_id: uuid.UUID | None = None
    description: str | None = Field(default=None, max_length=20_000)
    public_visible: bool = False
    botanicals: list[str] = Field(default_factory=list, max_length=40)
    # Photos from the media library, in order: the first is the main photo.
    image_ids: list[uuid.UUID] = Field(default_factory=list, max_length=12)

    _botanicals = field_validator("botanicals")(_clean_botanicals)

    @field_validator("brand", "name", "edition")
    @classmethod
    def _strip(cls, value: str) -> str:
        return value.strip()


class GinPatch(BaseModel):
    version: int
    brand: ShortText | None = None
    name: ShortText | None = None
    edition: str | None = Field(default=None, max_length=120)
    slug: Slug | None = None
    style: GinStyle | None = None
    abv: Abv | None = None
    country: str | None = Field(default=None, max_length=80)
    distillery_id: uuid.UUID | None = None
    description: str | None = Field(default=None, max_length=20_000)
    public_visible: bool | None = None
    botanicals: list[str] | None = Field(default=None, max_length=40)
    image_ids: list[uuid.UUID] | None = Field(default=None, max_length=12)

    _botanicals = field_validator("botanicals")(_clean_botanicals)


class GinSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    slug: str
    display_name: str


class GinOut(GinSummary):
    brand: str
    name: str
    edition: str
    style: str
    abv: Fixed2
    country: str | None
    distillery: DistillerySummary | None
    description: str | None
    public_visible: bool
    botanicals: list[str]
    images: list[MediaSummary] = []
    bottles_in_cabinet: int = 0
    bottles_total: int = 0
    version: int
    created_at: datetime
    updated_at: datetime

    @field_validator("images", mode="before")
    @classmethod
    def _no_raw_images(cls, value):
        # The model holds GinImage rows; services/catalogue.py fills this in.
        return [v for v in value if isinstance(v, MediaSummary | dict)]

    @field_validator("botanicals", mode="before")
    @classmethod
    def _names(cls, value):
        # The model holds Botanical objects; the API shows just their names, A-Z.
        return sorted(b if isinstance(b, str) else b.name for b in value)
