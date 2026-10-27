"""Purchases and their lines (spec §5 A04, §7).

One ``Purchase`` is one receipt ("Alko, 3 March"). It has one or
more ``PurchaseLine`` rows ("2 x Tanqueray 700 ml at 29.90 EUR"). Saving a
line with quantity 2 creates 2 separate ``Bottle`` rows.
"""

import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import CheckConstraint, Date, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models._mixins import Versioned
from app.models._types import UUIDType, new_uuid
from app.models.catalogue import GinProduct


class Purchase(Versioned, Base):
    __tablename__ = "purchases"

    id: Mapped[uuid.UUID] = mapped_column(UUIDType, primary_key=True, default=new_uuid)
    purchased_on: Mapped[date] = mapped_column(Date)  # ISO date (spec §7)
    retailer: Mapped[str] = mapped_column(String(160))
    # ISO 4217 code, e.g. "EUR", "SEK", "GBP".
    currency: Mapped[str] = mapped_column(String(3))
    reference: Mapped[str | None] = mapped_column(String(120), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )

    lines: Mapped[list["PurchaseLine"]] = relationship(
        back_populates="purchase",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="PurchaseLine.position",
    )


class PurchaseLine(Base):
    __tablename__ = "purchase_lines"
    __table_args__ = (
        CheckConstraint("quantity >= 1", name="quantity_positive"),
        CheckConstraint("size_ml > 0", name="size_positive"),
        CheckConstraint("unit_price IS NULL OR unit_price >= 0", name="price_not_negative"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUIDType, primary_key=True, default=new_uuid)
    purchase_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("purchases.id", ondelete="CASCADE"), index=True
    )
    gin_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("gin_products.id", ondelete="RESTRICT"), index=True
    )
    position: Mapped[int] = mapped_column(Integer, default=0)
    size_ml: Mapped[int] = mapped_column(Integer)
    quantity: Mapped[int] = mapped_column(Integer, default=1)
    # Price per bottle. NULL = unknown or gifted (spec A04: "no mandatory price
    # for gifted bottles"). NUMERIC keeps money exact (spec §7).
    unit_price: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)

    purchase: Mapped[Purchase] = relationship(back_populates="lines")
    gin: Mapped[GinProduct] = relationship(lazy="joined")
