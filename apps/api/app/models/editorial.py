"""Editorial content: images, private tastings and public reviews (spec §5 A05, A06, A09, §7).

* ``MediaAsset``: an uploaded image (cleaned of hidden location data).
* ``Tasting``: one admin's *private* tasting notes for a gin.
* ``Review``: the *public* write-up of a gin, with a publishing workflow.
* ``ReviewRevision``: a snapshot of a review saved on every change.
"""

import uuid
from datetime import date, datetime
from decimal import Decimal
from enum import StrEnum
from typing import TYPE_CHECKING, Any

from sqlalchemy import (
    CheckConstraint,
    Date,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    false,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models._mixins import Versioned
from app.models._types import JSONType, UTCDateTime, UUIDType, new_uuid, utcnow
from app.models.catalogue import GinProduct
from app.models.user import User

if TYPE_CHECKING:  # only for type hints: models/tonics.py imports this file
    from app.models.tonics import Tonic

# ---------------- Media ----------------


class MediaAsset(Versioned, Base):
    __tablename__ = "media_assets"

    id: Mapped[uuid.UUID] = mapped_column(UUIDType, primary_key=True, default=new_uuid)
    # The stored file name: random, never the uploader's original name (spec §9).
    storage_key: Mapped[str] = mapped_column(String(80), unique=True)
    original_filename: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # A readable name for the library ("Hernö Navy Strength bottle"). Starts as
    # the uploaded file's name, tidied up; can be changed at any time.
    name: Mapped[str | None] = mapped_column(String(160), nullable=True)
    # Where it's filed: "Gins/Hernö" (a "/" makes a subfolder). None = not filed.
    folder: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    mime: Mapped[str] = mapped_column(String(40))
    width: Mapped[int] = mapped_column(Integer)
    height: Mapped[int] = mapped_column(Integer)
    size_bytes: Mapped[int] = mapped_column(Integer)
    # Spec §10A: "Images must have alt text or be explicitly decorative".
    alt: Mapped[str | None] = mapped_column(Text, nullable=True)
    decorative: Mapped[bool] = mapped_column(default=False)
    credit: Mapped[str | None] = mapped_column(String(200), nullable=True)
    rights: Mapped[str | None] = mapped_column(String(200), nullable=True)  # licence / permission
    uploaded_by_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    # Corner marks (services/watermark.py): the site's "©" mark, and an
    # "AI-generated" label. When either is on, ``display_key`` names the marked
    # copy the website shows; the original file stays untouched.
    watermark: Mapped[bool] = mapped_column(default=False, server_default=false())
    ai_generated: Mapped[bool] = mapped_column(default=False, server_default=false())
    display_key: Mapped[str | None] = mapped_column(String(80), unique=True, nullable=True)
    # Soft delete (spec A09): the row stays, so old revisions still make sense.
    deleted_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)


class GinImage(Base):
    """One photo of a gin, in display order: the first is the main photo."""

    __tablename__ = "gin_images"
    __table_args__ = (UniqueConstraint("gin_id", "media_id", name="uq_gin_image"),)

    id: Mapped[uuid.UUID] = mapped_column(UUIDType, primary_key=True, default=new_uuid)
    gin_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("gin_products.id", ondelete="CASCADE"), index=True
    )
    media_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("media_assets.id", ondelete="RESTRICT"), index=True
    )
    position: Mapped[int] = mapped_column(Integer, default=0)

    media: Mapped[MediaAsset] = relationship(lazy="joined")


# ---------------- Tastings ----------------

# The flavour sliders (0–5) shown in the tasting form (spec A05).
FLAVOUR_KEYS = ("juniper", "citrus", "floral", "spice", "herbal", "sweetness")


class Tasting(Versioned, Base):
    __tablename__ = "tastings"
    __table_args__ = (
        CheckConstraint("rating IS NULL OR (rating >= 0 AND rating <= 10)", name="rating_range"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUIDType, primary_key=True, default=new_uuid)
    gin_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("gin_products.id", ondelete="RESTRICT"), index=True
    )
    # Spec A05: "Each tasting belongs to one admin".
    author_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    # Optionally, the exact physical bottle that was tasted.
    bottle_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("bottles.id", ondelete="SET NULL"), nullable=True, index=True
    )
    tasted_on: Mapped[date] = mapped_column(Date)
    context: Mapped[str | None] = mapped_column(Text, nullable=True)  # "neat, tulip glass"
    nose: Mapped[str | None] = mapped_column(Text, nullable=True)
    palate: Mapped[str | None] = mapped_column(Text, nullable=True)
    finish: Mapped[str | None] = mapped_column(Text, nullable=True)
    # {"juniper": 4, "citrus": 2, ...}: a JSON column, as the spec allows.
    flavours: Mapped[dict[str, Any]] = mapped_column(JSONType, default=dict)
    rating: Mapped[Decimal | None] = mapped_column(Numeric(3, 1), nullable=True)  # 0.0–10.0
    tonic: Mapped[str | None] = mapped_column(String(160), nullable=True)
    garnish: Mapped[str | None] = mapped_column(String(160), nullable=True)
    private_notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    gin: Mapped[GinProduct] = relationship(lazy="joined")
    author: Mapped[User] = relationship(lazy="joined")


# ---------------- Reviews ----------------


class ReviewStatus(StrEnum):
    DRAFT = "draft"
    READY = "ready"  # finished, waiting to be published
    PUBLISHED = "published"
    ARCHIVED = "archived"


# Spec A06: "Explicit transition draft→ready→published→archived", plus going
# back to draft to make changes, and withdrawing a published review.
REVIEW_TRANSITIONS: dict[ReviewStatus, set[ReviewStatus]] = {
    ReviewStatus.DRAFT: {ReviewStatus.READY, ReviewStatus.ARCHIVED},
    ReviewStatus.READY: {ReviewStatus.DRAFT, ReviewStatus.PUBLISHED, ReviewStatus.ARCHIVED},
    ReviewStatus.PUBLISHED: {ReviewStatus.DRAFT, ReviewStatus.ARCHIVED},
    ReviewStatus.ARCHIVED: {ReviewStatus.DRAFT},
}

# The fields that make up the written review; each revision stores a copy.
REVIEW_CONTENT_FIELDS = (
    "title",
    "slug",
    "rating",
    "intro",
    "nose",
    "palate",
    "finish",
    "tonic",
    "tonic_id",
    "garnish",
    "verdict",
    "cover_media_id",
    "seo_title",
    "seo_description",
    "author_id",
    "gin_id",
)


class Review(Versioned, Base):
    __tablename__ = "reviews"
    __table_args__ = (
        CheckConstraint("rating IS NULL OR (rating >= 0 AND rating <= 10)", name="rating_range"),
        CheckConstraint(
            "status IN ('draft', 'ready', 'published', 'archived')", name="status_valid"
        ),
        # Public listings ask for "published, newest first" (spec §10A indexes).
        Index("ix_reviews_status_published_at", "status", "published_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUIDType, primary_key=True, default=new_uuid)
    gin_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("gin_products.id", ondelete="RESTRICT"), index=True
    )
    # The byline: one admin per review (spec §12 pending choices).
    author_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    # The private tasting this review grew out of, if any.
    tasting_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("tastings.id", ondelete="SET NULL"), nullable=True, index=True
    )
    slug: Mapped[str] = mapped_column(String(160), unique=True)
    status: Mapped[str] = mapped_column(String(16), default=ReviewStatus.DRAFT)
    title: Mapped[str] = mapped_column(String(200))
    rating: Mapped[Decimal | None] = mapped_column(Numeric(3, 1), nullable=True)
    # The editorial text. Stored as plain text with blank lines between
    # paragraphs; the website shows it as text, never as raw HTML, so it is
    # safe from script injection (spec §10A "sanitize rich text").
    intro: Mapped[str | None] = mapped_column(Text, nullable=True)
    nose: Mapped[str | None] = mapped_column(Text, nullable=True)
    palate: Mapped[str | None] = mapped_column(Text, nullable=True)
    finish: Mapped[str | None] = mapped_column(Text, nullable=True)
    tonic: Mapped[str | None] = mapped_column(String(160), nullable=True)
    # The same tonic picked from our tonic list (optional). The public review
    # then links to the tonic's page, and the tonic's page lists this review.
    # Deleting the tonic just clears the link; the text above stays.
    tonic_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("tonics.id", ondelete="SET NULL"), nullable=True, index=True
    )
    garnish: Mapped[str | None] = mapped_column(String(160), nullable=True)
    verdict: Mapped[str | None] = mapped_column(Text, nullable=True)
    cover_media_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("media_assets.id", ondelete="SET NULL"), nullable=True, index=True
    )
    seo_title: Mapped[str | None] = mapped_column(String(70), nullable=True)
    seo_description: Mapped[str | None] = mapped_column(String(170), nullable=True)
    published_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)

    gin: Mapped[GinProduct] = relationship(lazy="joined")
    author: Mapped[User] = relationship(lazy="joined")
    cover: Mapped[MediaAsset | None] = relationship(lazy="joined")
    # Not called "tonic": that name is the free-text column above.
    linked_tonic: Mapped["Tonic | None"] = relationship(lazy="joined")


class ReviewRevision(Base):
    """An unchangeable snapshot of a review (spec A06 "revision history")."""

    __tablename__ = "review_revisions"
    __table_args__ = (UniqueConstraint("review_id", "revision_number", name="uq_review_revision"),)

    id: Mapped[uuid.UUID] = mapped_column(UUIDType, primary_key=True, default=new_uuid)
    review_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("reviews.id", ondelete="CASCADE"), index=True
    )
    revision_number: Mapped[int] = mapped_column(Integer)
    actor_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    status: Mapped[str] = mapped_column(String(16))
    note: Mapped[str | None] = mapped_column(String(200), nullable=True)  # "Published"...
    saved_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    snapshot: Mapped[dict[str, Any]] = mapped_column(JSONType)
