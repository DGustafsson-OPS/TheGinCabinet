"""Quick reviews: rate a gin with 1–5 juniper berries and a line or two.

Admin: /api/v1/admin/quick-reviews[/{id}]. Each person gives a gin one quick
review at most. They are public as soon as they are saved (on public gins);
the public gin page shows them, and they count towards the gin's rating.
"""

import uuid

from fastapi import APIRouter
from sqlalchemy import select

from app.api.deps import CurrentStaff, CurrentStaffWrite, DbSession
from app.errors import ApiError
from app.models import GinProduct, QuickReview, User
from app.schemas.catalogue import GinSummary
from app.schemas.editorial import Person
from app.schemas.quick_reviews import QuickReviewIn, QuickReviewOut, QuickReviewPatch
from app.services import audit
from app.services.common import apply_patch, get_or_404
from app.services.versioning import check_version

router = APIRouter(prefix="/admin/quick-reviews", tags=["admin: quick reviews"])


def quick_review_out(review: QuickReview) -> QuickReviewOut:
    return QuickReviewOut(
        id=review.id,
        gin=GinSummary.model_validate(review.gin),
        gin_public=review.gin.public_visible,
        author=Person.model_validate(review.author),
        rating=review.rating,
        note=review.note,
        version=review.version,
        created_at=review.created_at,
        updated_at=review.updated_at,
    )


def _one_per_author(db, gin_id: uuid.UUID, author_id: uuid.UUID, exclude: uuid.UUID | None = None):
    query = select(QuickReview).where(
        QuickReview.gin_id == gin_id, QuickReview.author_id == author_id
    )
    if exclude:
        query = query.where(QuickReview.id != exclude)
    if db.scalar(query):
        raise ApiError(
            409,
            "duplicate_quick_review",
            "This person has already given this gin a quick review. Edit that one instead.",
        )


@router.get("", response_model=list[QuickReviewOut])
def list_quick_reviews(admin: CurrentStaff, db: DbSession, gin_id: uuid.UUID | None = None):
    """Newest first; ``gin_id`` narrows it to one gin."""
    query = select(QuickReview).order_by(QuickReview.created_at.desc())
    if gin_id:
        query = query.where(QuickReview.gin_id == gin_id)
    return [quick_review_out(r) for r in db.scalars(query.limit(200)).unique()]


@router.post("", response_model=QuickReviewOut, status_code=201)
def create_quick_review(body: QuickReviewIn, admin: CurrentStaffWrite, db: DbSession):
    gin = get_or_404(db, GinProduct, body.gin_id, "Gin")
    if body.author_id:
        get_or_404(db, User, body.author_id, "Author")
    author_id = body.author_id or admin.user.id
    _one_per_author(db, gin.id, author_id)
    review = QuickReview(
        gin_id=gin.id,
        author_id=author_id,
        rating=body.rating,
        note=(body.note or "").strip() or None,
    )
    db.add(review)
    db.flush()
    audit.record(
        db,
        action="quick_review.create",
        entity_type="quick_review",
        entity_id=review.id,
        actor_id=admin.user.id,
        summary={"title": gin.display_name, "rating": str(body.rating)},
    )
    db.commit()
    db.refresh(review)
    return quick_review_out(review)


@router.patch("/{review_id}", response_model=QuickReviewOut)
def update_quick_review(
    review_id: uuid.UUID, body: QuickReviewPatch, admin: CurrentStaffWrite, db: DbSession
):
    review = get_or_404(db, QuickReview, review_id, "Quick review")
    changes = body.model_dump(exclude_unset=True)
    check_version(
        current_version=review.version,
        sent_version=changes.pop("version"),
        force=False,
        changes=changes,
        current=quick_review_out(review),
    )
    if changes.get("author_id"):
        get_or_404(db, User, changes["author_id"], "Author")
        _one_per_author(db, review.gin_id, changes["author_id"], exclude=review.id)
    if "note" in changes:
        changes["note"] = (changes["note"] or "").strip() or None
    apply_patch(review, changes, never_empty={"rating", "author_id"})
    audit.record(
        db,
        action="quick_review.update",
        entity_type="quick_review",
        entity_id=review.id,
        actor_id=admin.user.id,
        summary={"title": review.gin.display_name, "fields": sorted(changes)},
    )
    db.commit()
    db.refresh(review)
    return quick_review_out(review)


@router.delete("/{review_id}", status_code=204)
def delete_quick_review(review_id: uuid.UUID, admin: CurrentStaffWrite, db: DbSession):
    review = get_or_404(db, QuickReview, review_id, "Quick review")
    audit.record(
        db,
        action="quick_review.delete",
        entity_type="quick_review",
        entity_id=review.id,
        actor_id=admin.user.id,
        summary={"title": review.gin.display_name},
    )
    db.delete(review)
    db.commit()
