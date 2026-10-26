"""Rules for media, tastings and reviews (spec §5 A05, A06, A09, §6 "Publish review")."""

import uuid
from decimal import Decimal
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.errors import ApiError
from app.models import (
    REVIEW_CONTENT_FIELDS,
    REVIEW_TRANSITIONS,
    CocktailRecipe,
    MediaAsset,
    Review,
    ReviewRevision,
    ReviewStatus,
)
from app.models._types import utcnow
from app.schemas.editorial import (
    MediaOut,
    MediaSummary,
    PublicGinRef,
    PublicReview,
    PublicReviewCard,
    ReviewOut,
)

TEASER_LENGTH = 220

# ---------------- Media ----------------


def media_url(asset: MediaAsset) -> str:
    """Public address of the image file (served by app/api/routes/media.py)."""
    return f"/api/v1/media/{asset.storage_key}"


def media_summary(asset: MediaAsset | None) -> MediaSummary | None:
    if asset is None or asset.deleted_at is not None:
        return None
    return MediaSummary(
        id=asset.id, url=media_url(asset), alt=asset.alt, width=asset.width, height=asset.height
    )


def media_usage(db: Session, asset_id: uuid.UUID) -> list[str]:
    """Human-readable list of what uses an image (spec A09 "usage references").

    Blog posts will be added here when the Journal is built.
    """
    reviews = db.scalars(select(Review.title).where(Review.cover_media_id == asset_id))
    cocktails = db.scalars(
        select(CocktailRecipe.title).where(CocktailRecipe.cover_media_id == asset_id)
    )
    return [f"Review: {t}" for t in reviews] + [f"Cocktail: {t}" for t in cocktails]


def media_out(db: Session, asset: MediaAsset) -> MediaOut:
    out = MediaOut.model_validate(asset)
    return out.model_copy(update={"url": media_url(asset), "used_by": media_usage(db, asset.id)})


def check_cover(db: Session, media_id: uuid.UUID | None) -> None:
    if media_id is None:
        return
    asset = db.get(MediaAsset, media_id)
    if asset is None or asset.deleted_at is not None:
        raise ApiError(422, "unknown_media", "That image doesn't exist in the media library.")


# ---------------- Reviews ----------------


def _jsonable(value: Any) -> Any:
    if isinstance(value, Decimal | uuid.UUID):
        return str(value)
    return value


def snapshot(review: Review) -> dict[str, Any]:
    """The review's content as plain JSON, for a revision."""
    data = {field: _jsonable(getattr(review, field)) for field in REVIEW_CONTENT_FIELDS}
    data["status"] = review.status
    return data


def add_revision(db: Session, review: Review, actor_id: uuid.UUID, note: str) -> None:
    """Save an unchangeable copy of the review as it is now (spec A06 "revision history")."""
    db.flush()  # make sure the review row (and its id) exists first
    last = db.scalar(
        select(func.max(ReviewRevision.revision_number)).where(
            ReviewRevision.review_id == review.id
        )
    )
    db.add(
        ReviewRevision(
            review_id=review.id,
            revision_number=(last or 0) + 1,
            actor_id=actor_id,
            status=review.status,
            note=note,
            snapshot=snapshot(review),
        )
    )


def check_can_publish(review: Review) -> None:
    """Things that must be true before a review goes public (spec §6)."""
    problems = []
    if not review.gin.public_visible:
        # A public review of a private gin would leak the gin (spec §6).
        problems.append("Make the gin public first (gin page → Show on the public website).")
    if not (review.verdict or "").strip():
        problems.append("Write a verdict.")
    if review.rating is None:
        problems.append("Give a rating.")
    cover = review.cover
    if cover is not None and not (cover.alt or "").strip() and not cover.decorative:
        problems.append("Give the cover image alt text, or mark it as decorative.")
    if problems:
        raise ApiError(422, "not_publishable", "This review can't be published yet.", problems)


def change_status(db: Session, review: Review, new: ReviewStatus, actor_id: uuid.UUID) -> None:
    old = ReviewStatus(review.status)
    if new == old:
        return
    if new not in REVIEW_TRANSITIONS[old]:
        raise ApiError(
            422,
            "invalid_transition",
            f"A {old} review can't move straight to {new}.",
            details={"allowed": sorted(REVIEW_TRANSITIONS[old])},
        )
    if new == ReviewStatus.PUBLISHED:
        check_can_publish(review)
        if review.published_at is None:
            review.published_at = utcnow()
    review.status = new
    review.updated_at = utcnow()
    notes = {
        ReviewStatus.READY: "Marked ready",
        ReviewStatus.PUBLISHED: "Published",
        ReviewStatus.ARCHIVED: "Archived",
        ReviewStatus.DRAFT: "Withdrawn to draft"
        if old == ReviewStatus.PUBLISHED
        else "Back to draft",
    }
    add_revision(db, review, actor_id, notes[new])


def review_out(review: Review) -> ReviewOut:
    out = ReviewOut.model_validate(review)
    return out.model_copy(
        update={
            "cover_image": media_summary(review.cover),
            "gin_public": review.gin.public_visible,
        }
    )


# ---------------- Public output ----------------


def teaser(item: Any) -> str:
    """The first ~220 characters of the intro (or a review's verdict), cut at a word.

    Works for reviews and cocktail recipes: anything with an ``intro``.
    """
    raw = item.intro or getattr(item, "verdict", None) or ""
    text = " ".join(raw.split())
    if len(text) <= TEASER_LENGTH:
        return text
    return text[:TEASER_LENGTH].rsplit(" ", 1)[0] + "…"


def public_card(review: Review) -> PublicReviewCard:
    return PublicReviewCard(
        slug=review.slug,
        title=review.title,
        author_name=review.author.display_name,
        published_at=review.published_at,
        rating=review.rating,
        teaser=teaser(review),
        cover=media_summary(review.cover),
        gin=PublicGinRef(
            slug=review.gin.slug,
            display_name=review.gin.display_name,
            country=review.gin.country,
            abv=review.gin.abv,
        ),
    )


def public_review(review: Review) -> PublicReview:
    card = public_card(review)
    return PublicReview(
        **card.model_dump(),
        intro=review.intro,
        nose=review.nose,
        palate=review.palate,
        finish=review.finish,
        tonic=review.tonic,
        garnish=review.garnish,
        verdict=review.verdict,
        seo_title=review.seo_title,
        seo_description=review.seo_description,
        updated_at=review.updated_at,
    )
