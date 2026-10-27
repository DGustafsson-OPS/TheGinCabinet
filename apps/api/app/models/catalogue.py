"""The gin catalogue: distilleries, botanicals and gin products (spec §5 A02, §7).

A ``GinProduct`` is the *master record*: "Hendrick's Gin, 41.4 %". It is
separate from the physical ``Bottle`` rows (see bottles.py), so one gin can
have many bottles of different sizes, prices and states.
"""

import uuid
from decimal import Decimal
from enum import StrEnum
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    ForeignKey,
    Numeric,
    String,
    Table,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models._mixins import Versioned
from app.models._types import UUIDType, new_uuid

# Only for type checkers: importing it for real would create an import loop,
# because editorial.py imports this file.
if TYPE_CHECKING:
    from app.models.editorial import GinImage


class GinStyle(StrEnum):
    """Allowed gin styles.

    A ``StrEnum`` member *is* a string: ``GinStyle.LONDON_DRY == "london_dry"``.
    """

    LONDON_DRY = "london_dry"
    DISTILLED = "distilled"
    PLYMOUTH = "plymouth"
    OLD_TOM = "old_tom"
    NAVY_STRENGTH = "navy_strength"
    NEW_WESTERN = "new_western"
    GENEVER = "genever"
    SLOE = "sloe"
    FLAVOURED = "flavoured"
    BARREL_AGED = "barrel_aged"
    OTHER = "other"


class Distillery(Versioned, Base):
    __tablename__ = "distilleries"

    id: Mapped[uuid.UUID] = mapped_column(UUIDType, primary_key=True, default=new_uuid)
    slug: Mapped[str] = mapped_column(String(120), unique=True)
    name: Mapped[str] = mapped_column(String(160))
    country: Mapped[str | None] = mapped_column(String(80), nullable=True)
    region: Mapped[str | None] = mapped_column(String(120), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    website: Mapped[str | None] = mapped_column(String(300), nullable=True)


class Botanical(Base):
    __tablename__ = "botanicals"

    id: Mapped[uuid.UUID] = mapped_column(UUIDType, primary_key=True, default=new_uuid)
    # Stored lower-case ("juniper") so "Juniper" and "juniper" can't both exist.
    name: Mapped[str] = mapped_column(String(80), unique=True)


# A plain "junction" table for the many-to-many link: one gin has many
# botanicals, and one botanical appears in many gins.
gin_botanicals = Table(
    "gin_botanicals",
    Base.metadata,
    Column("gin_id", ForeignKey("gin_products.id", ondelete="CASCADE"), primary_key=True),
    Column(
        "botanical_id",
        ForeignKey("botanicals.id", ondelete="CASCADE"),
        primary_key=True,
        index=True,
    ),
)


class GinProduct(Versioned, Base):
    __tablename__ = "gin_products"
    __table_args__ = (
        # Spec A02: "Validate 0 < ABV <= 100" (enforced by the database too).
        CheckConstraint("abv > 0 AND abv <= 100", name="abv_range"),
        # Spec A02: "gin identity uniqueness". The same brand + name + edition
        # can exist only once. Edition is "" (not NULL) when there is none,
        # because SQL treats NULLs as all-different in unique constraints.
        UniqueConstraint("brand", "name", "edition", name="uq_gin_products_identity"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUIDType, primary_key=True, default=new_uuid)
    slug: Mapped[str] = mapped_column(String(160), unique=True)
    brand: Mapped[str] = mapped_column(String(120))
    name: Mapped[str] = mapped_column(String(160))
    edition: Mapped[str] = mapped_column(String(120), default="")
    style: Mapped[str] = mapped_column(String(32), default=GinStyle.OTHER)
    # numeric(5,2): up to 999.99, stored exactly (no floating-point rounding).
    abv: Mapped[Decimal] = mapped_column(Numeric(5, 2))
    country: Mapped[str | None] = mapped_column(String(80), nullable=True)
    distillery_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("distilleries.id", ondelete="SET NULL"), nullable=True, index=True
    )
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Spec §6: this flag alone decides whether the gin appears on the public site.
    public_visible: Mapped[bool] = mapped_column(Boolean, default=False)

    # `relationship` lets you write `gin.distillery.name` and `gin.botanicals`
    # instead of writing the SQL joins yourself.
    distillery: Mapped[Distillery | None] = relationship(lazy="joined")
    botanicals: Mapped[list[Botanical]] = relationship(
        secondary=gin_botanicals, order_by=Botanical.name, lazy="selectin"
    )
    # Bottle photos (spec A02 "images", P03 "hero bottle photo, thumbnails").
    # "GinImage" is written as text and looked up by SQLAlchemy later.
    images: Mapped[list["GinImage"]] = relationship(
        order_by="GinImage.position", cascade="all, delete-orphan", lazy="selectin"
    )

    @property
    def display_name(self) -> str:
        parts = [self.brand, self.name] if self.name.lower() != self.brand.lower() else [self.name]
        if self.edition:
            parts.append(f"({self.edition})")
        return " ".join(parts)
