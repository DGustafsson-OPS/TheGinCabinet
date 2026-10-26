"""JSON shapes for bottles, purchases, wishlist and the dashboard (spec §5 A01, A03, A04, A08)."""

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models import BottleStatus
from app.schemas.audit import AuditEventOut
from app.schemas.catalogue import GinSummary
from app.schemas.common import Fixed2

SizeMl = Annotated[int, Field(gt=0, le=10_000)]
Money = Annotated[Decimal, Field(ge=0, max_digits=12, decimal_places=2)]


def _check_currency(value: str | None) -> str | None:
    if value is None:
        return None
    value = value.strip().upper()
    if len(value) != 3 or not value.isalpha():
        raise ValueError("must be a 3-letter currency code such as SEK or EUR")
    return value


# ---------- Bottles ----------


class BottleIn(BaseModel):
    """Add bottles that didn't come from a recorded purchase (gifts, older bottles)."""

    gin_id: uuid.UUID
    size_ml: SizeMl
    quantity: int = Field(default=1, ge=1, le=24)
    # A new bottle is normally sealed; "open" is for recording an existing one.
    status: Literal["sealed", "open"] = "sealed"
    remaining_ml: int | None = Field(default=None, ge=0)
    shelf: str | None = Field(default=None, max_length=80)
    source: str | None = Field(default=None, max_length=80)
    acquired_on: date | None = None
    comments: str | None = Field(default=None, max_length=5_000)

    @model_validator(mode="after")
    def _remaining_fits(self):
        # A model validator sees all fields at once, so it can compare them.
        if self.remaining_ml is not None and self.remaining_ml > self.size_ml:
            raise ValueError("remaining_ml cannot be more than size_ml")
        return self


class BottlePatch(BaseModel):
    version: int
    shelf: str | None = Field(default=None, max_length=80)
    comments: str | None = Field(default=None, max_length=5_000)
    source: str | None = Field(default=None, max_length=80)
    acquired_on: date | None = None
    # Only for open bottles: "about 400 ml left" (spec §6 "Consume bottle").
    remaining_ml: int | None = Field(default=None, ge=0)


class BottleStatusChange(BaseModel):
    version: int
    status: BottleStatus
    remaining_ml: int | None = Field(default=None, ge=0)
    on: date | None = None  # the day it happened; defaults to today
    note: str | None = Field(default=None, max_length=1_000)


class BottleEventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    from_status: str | None
    to_status: str
    remaining_ml: int | None
    note: str | None
    actor_id: uuid.UUID | None
    occurred_at: datetime


class BottleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    gin: GinSummary
    size_ml: int
    status: str
    remaining_ml: int | None
    shelf: str | None
    purchase_line_id: uuid.UUID | None
    source: str | None
    acquired_on: date | None
    opened_at: date | None
    finished_at: date | None
    comments: str | None
    version: int
    created_at: datetime
    updated_at: datetime


class BottleDetailOut(BottleOut):
    events: list[BottleEventOut]


# ---------- Purchases ----------


class PurchaseLineIn(BaseModel):
    gin_id: uuid.UUID
    size_ml: SizeMl
    quantity: int = Field(default=1, ge=1, le=48)
    unit_price: Money | None = None  # leave out for gifts or unknown prices


class PurchaseIn(BaseModel):
    purchased_on: date
    retailer: str = Field(min_length=1, max_length=160)
    currency: str
    reference: str | None = Field(default=None, max_length=120)
    notes: str | None = Field(default=None, max_length=5_000)
    shelf: str | None = Field(default=None, max_length=80)  # where the new bottles go
    lines: list[PurchaseLineIn] = Field(min_length=1, max_length=50)

    _currency = field_validator("currency")(_check_currency)


class PurchasePatch(BaseModel):
    """Lines are fixed once saved, because they already created bottles."""

    version: int
    purchased_on: date | None = None
    retailer: str | None = Field(default=None, min_length=1, max_length=160)
    currency: str | None = None
    reference: str | None = Field(default=None, max_length=120)
    notes: str | None = Field(default=None, max_length=5_000)

    _currency = field_validator("currency")(_check_currency)


class PurchaseLineOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    gin: GinSummary
    size_ml: int
    quantity: int
    unit_price: Fixed2 | None
    line_total: Fixed2 | None = None


class PurchaseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    purchased_on: date
    retailer: str
    currency: str
    reference: str | None
    notes: str | None
    lines: list[PurchaseLineOut]
    # Sum of known prices; bottles without a price are counted separately
    # (spec A04: "totals include currency information").
    total: Fixed2
    bottles_without_price: int
    created_by_id: uuid.UUID | None
    version: int
    created_at: datetime
    updated_at: datetime


# ---------- Wishlist ----------


class WishlistIn(BaseModel):
    gin_id: uuid.UUID | None = None
    text: str | None = Field(default=None, max_length=200)
    priority: int = Field(default=3, ge=1, le=5)
    target_price: Money | None = None
    currency: str | None = None
    notes: str | None = Field(default=None, max_length=5_000)

    _currency = field_validator("currency")(_check_currency)

    @model_validator(mode="after")
    def _needs_gin_or_text(self):
        if self.gin_id is None and not (self.text or "").strip():
            raise ValueError("give either gin_id or text")
        return self


class WishlistPatch(BaseModel):
    version: int
    gin_id: uuid.UUID | None = None
    text: str | None = Field(default=None, min_length=1, max_length=200)
    priority: int | None = Field(default=None, ge=1, le=5)
    target_price: Money | None = None
    currency: str | None = None
    notes: str | None = Field(default=None, max_length=5_000)
    # "purchased" is only reached via the convert endpoint.
    status: Literal["wanted", "dropped"] | None = None

    _currency = field_validator("currency")(_check_currency)


class WishlistConvert(BaseModel):
    version: int
    purchase: PurchaseIn


class WishlistOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    gin: GinSummary | None
    text: str
    priority: int
    target_price: Fixed2 | None
    currency: str | None
    notes: str | None
    status: str
    added_by_id: uuid.UUID | None
    purchase_id: uuid.UUID | None
    version: int
    created_at: datetime
    updated_at: datetime


# ---------- Dashboard (spec A01) ----------


class InventoryValue(BaseModel):
    currency: str
    amount: Fixed2
    bottles: int


class DashboardOut(BaseModel):
    unique_gins: int
    physical_bottles: int  # sealed + open, i.e. actually in the cabinet
    open_bottles: int
    # One entry per currency: amounts in different currencies can't be added up.
    inventory_value: list[InventoryValue]
    # Spec A01: "unknown cost excluded and explicitly shown".
    bottles_without_cost: int
    public_gins: int
    wishlist_wanted: int
    recent_activity: list[AuditEventOut]
