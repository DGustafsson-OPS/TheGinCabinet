"""The private wishlist (spec §5 A08, §7)."""

import uuid
from decimal import Decimal
from enum import StrEnum

from sqlalchemy import CheckConstraint, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models._mixins import Versioned
from app.models._types import UUIDType, new_uuid
from app.models.catalogue import GinProduct


class WishlistStatus(StrEnum):
    WANTED = "wanted"
    PURCHASED = "purchased"
    DROPPED = "dropped"


class WishlistItem(Versioned, Base):
    __tablename__ = "wishlist_items"
    __table_args__ = (CheckConstraint("priority BETWEEN 1 AND 5", name="priority_range"),)

    id: Mapped[uuid.UUID] = mapped_column(UUIDType, primary_key=True, default=new_uuid)
    # Optional link to a catalogue gin; `text` describes it when there isn't one yet.
    gin_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("gin_products.id", ondelete="SET NULL"), nullable=True, index=True
    )
    text: Mapped[str] = mapped_column(String(200))
    priority: Mapped[int] = mapped_column(Integer, default=3)  # 1 = most wanted
    target_price: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    currency: Mapped[str | None] = mapped_column(String(3), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(16), default=WishlistStatus.WANTED)
    added_by_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    # Set when converted to a purchase (spec A08: "without deleting source notes").
    purchase_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("purchases.id", ondelete="SET NULL"), nullable=True, index=True
    )

    gin: Mapped[GinProduct | None] = relationship(lazy="joined")
