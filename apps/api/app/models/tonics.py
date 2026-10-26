"""Tonics and their reviews: a simple catalogue, deliberately lighter than gins.

There are no bottles, purchases, prices or stock counts for tonics: just what a
tonic is, and what we think of it.

* ``Tonic``: one tonic water (brand + name), with an optional photo.
* ``TonicReview``: one admin's verdict on a tonic: a rating, tasting notes and
  what it pairs well with. Each admin can review the same tonic. A review is
  either a draft or published (no "ready" step, no revision history).
"""

import uuid
from datetime import datetime
from decimal import Decimal
from enum import StrEnum
from typing import Any

from sqlalchemy import CheckConstraint, ForeignKey, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models._mixins import Versioned
from app.models._types import JSONType, UTCDateTime, UUIDType, new_uuid
from app.models.editorial import MediaAsset
from app.models.user import User


class TonicStyle(StrEnum):
    INDIAN = "indian"  # classic, quinine-forward
    LIGHT = "light"  # low sugar / low calorie
    MEDITERRANEAN = "mediterranean"  # herbal: rosemary, thyme, citrus
    AROMATIC = "aromatic"  # spiced, bitter or botanical
    FLAVOURED = "flavoured"  # elderflower, cucumber, pink grapefruit…
    OTHER = "other"


class TonicReviewStatus(StrEnum):
    DRAFT = "draft"
    PUBLISHED = "published"


class Tonic(Versioned, Base):
    __tablename__ = "tonics"

    id: Mapped[uuid.UUID] = mapped_column(UUIDType, primary_key=True, default=new_uuid)
    slug: Mapped[str] = mapped_column(String(160), unique=True)
    brand: Mapped[str] = mapped_column(String(120))
    name: Mapped[str] = mapped_column(String(120))
    style: Mapped[str] = mapped_column(String(20), default=TonicStyle.INDIAN)
    country: Mapped[str | None] = mapped_column(String(80), nullable=True)
    # Short tasting words, e.g. ["quinine", "citrus", "dry"].
    flavour_notes: Mapped[list[Any]] = mapped_column(JSONType, default=list)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    image_media_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("media_assets.id", ondelete="SET NULL"), nullable=True, index=True
    )
    public_visible: Mapped[bool] = mapped_column(default=False)

    image: Mapped[MediaAsset | None] = relationship(lazy="joined")
    reviews: Mapped[list["TonicReview"]] = relationship(
        back_populates="tonic",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="TonicReview.created_at",
    )

    @property
    def display_name(self) -> str:
        return f"{self.brand} {self.name}".strip()


class TonicReview(Versioned, Base):
    __tablename__ = "tonic_reviews"
    __table_args__ = (
        CheckConstraint("rating IS NULL OR (rating >= 0 AND rating <= 10)", name="rating_range"),
        CheckConstraint("status IN ('draft', 'published')", name="status_valid"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUIDType, primary_key=True, default=new_uuid)
    tonic_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("tonics.id", ondelete="CASCADE"), index=True
    )
    author_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    rating: Mapped[Decimal | None] = mapped_column(Numeric(3, 1), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)  # the review text
    pairs_with: Mapped[str | None] = mapped_column(String(300), nullable=True)
    status: Mapped[str] = mapped_column(String(16), default=TonicReviewStatus.DRAFT)
    published_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)

    tonic: Mapped[Tonic] = relationship(back_populates="reviews")
    author: Mapped[User] = relationship(lazy="joined")
