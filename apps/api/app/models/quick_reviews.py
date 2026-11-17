"""Quick reviews: a gin or a tonic rated 1–5 and a line or two.

For gins and tonics that don't need a full write-up. Each quick review is of
exactly one gin or one tonic; each person gives each one quick review at
most, and it is public as soon as it is saved (when the gin or tonic is).
Gins are rated in juniper berries, tonics in little tonic bottles.

Scores are stored on the 1–5 juniper scale, in halves (4.5 = four and a
half berries). Full reviews keep their 0–10 score; to combine the two, a
quick review counts as twice its berries (4.5 → 9.0), and the website shows
every score as berries out of five.
"""

import uuid
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, ForeignKey, Numeric, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models._mixins import Versioned
from app.models._types import UUIDType, new_uuid
from app.models.catalogue import GinProduct
from app.models.user import User

if TYPE_CHECKING:  # only for type hints: models/tonics.py imports catalogue, not this file
    from app.models.tonics import Tonic


class QuickReview(Versioned, Base):
    __tablename__ = "quick_reviews"
    __table_args__ = (
        # 1 to 5 berries; the API also only accepts whole or half berries.
        CheckConstraint("rating >= 1 AND rating <= 5", name="rating_range"),
        # Exactly one of the two: a gin or a tonic.
        CheckConstraint("(gin_id IS NULL) <> (tonic_id IS NULL)", name="gin_or_tonic"),
        UniqueConstraint("gin_id", "author_id", name="uq_quick_review_per_author"),
        UniqueConstraint("tonic_id", "author_id", name="uq_tonic_quick_review_per_author"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUIDType, primary_key=True, default=new_uuid)
    gin_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("gin_products.id", ondelete="CASCADE"), index=True, nullable=True
    )
    tonic_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("tonics.id", ondelete="CASCADE"), index=True, nullable=True
    )
    author_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    rating: Mapped[Decimal] = mapped_column(Numeric(2, 1))
    note: Mapped[str | None] = mapped_column(String(280), nullable=True)  # a line or two

    gin: Mapped[GinProduct | None] = relationship(lazy="joined")
    tonic: Mapped["Tonic | None"] = relationship(lazy="joined")
    author: Mapped[User] = relationship(lazy="joined")
