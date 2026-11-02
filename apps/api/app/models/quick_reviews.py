"""Quick reviews: a gin rated with 1–5 juniper berries and a line or two.

For gins that don't need a full write-up. Each person gives a gin one quick
review at most, and it is public as soon as it is saved (when the gin is).

Scores are stored on the 1–5 juniper scale, in halves (4.5 = four and a
half berries). Full reviews keep their 0–10 score; to combine the two, a
quick review counts as twice its berries (4.5 → 9.0), and the website shows
every score as berries out of five.
"""

import uuid
from decimal import Decimal

from sqlalchemy import CheckConstraint, ForeignKey, Numeric, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models._mixins import Versioned
from app.models._types import UUIDType, new_uuid
from app.models.catalogue import GinProduct
from app.models.user import User


class QuickReview(Versioned, Base):
    __tablename__ = "quick_reviews"
    __table_args__ = (
        # 1 to 5 berries; the API also only accepts whole or half berries.
        CheckConstraint("rating >= 1 AND rating <= 5", name="rating_range"),
        UniqueConstraint("gin_id", "author_id", name="uq_quick_review_per_author"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUIDType, primary_key=True, default=new_uuid)
    gin_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("gin_products.id", ondelete="CASCADE"), index=True
    )
    author_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    rating: Mapped[Decimal] = mapped_column(Numeric(2, 1))
    note: Mapped[str | None] = mapped_column(String(280), nullable=True)  # a line or two

    gin: Mapped[GinProduct] = relationship(lazy="joined")
    author: Mapped[User] = relationship(lazy="joined")
