"""Review editor and publishing workflow (spec §8: /api/v1/admin/reviews, §5 A06)."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_, select

from app.api.deps import CurrentAdmin, CurrentAdminWrite, DbSession
from app.models import GinProduct, Review, ReviewRevision, ReviewStatus, Tasting, User
from app.schemas.common import Page, PageParams
from app.schemas.editorial import (
    ReviewIn,
    ReviewOut,
    ReviewPatch,
    ReviewStatusChange,
    RevisionOut,
)
from app.services import audit
from app.services.common import (
    apply_patch,
    contains,
    ensure_slug_free,
    get_or_404,
    slugify,
    unique_slug,
)
from app.services.editorial import (
    add_revision,
    change_status,
    check_cover,
    check_tonic,
    review_out,
)
from app.services.versioning import check_version

router = APIRouter(prefix="/admin/reviews", tags=["admin: reviews"])

Force = Annotated[bool, Query(description="Overwrite even if the record changed meanwhile")]


@router.get("", response_model=Page[ReviewOut])
def list_reviews(
    admin: CurrentAdmin,
    db: DbSession,
    paging: Annotated[PageParams, Depends()],
    status: ReviewStatus | None = None,
    search: str | None = None,
    gin_id: uuid.UUID | None = None,
):
    query = select(Review).join(Review.gin)
    if status:
        query = query.where(Review.status == status)
    if gin_id:
        query = query.where(Review.gin_id == gin_id)
    if search:
        query = query.where(
            or_(
                contains(Review.title, search),
                contains(GinProduct.brand, search),
                contains(GinProduct.name, search),
            )
        )
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    rows = db.scalars(
        query.order_by(Review.updated_at.desc()).offset(paging.offset).limit(paging.page_size)
    ).all()
    return Page[ReviewOut](items=[review_out(r) for r in rows], meta=paging.meta(total))


@router.post("", response_model=ReviewOut, status_code=201)
def create_review(body: ReviewIn, admin: CurrentAdminWrite, db: DbSession):
    """Start a review as a draft (spec §6 "start editorial draft for gin")."""
    gin = get_or_404(db, GinProduct, body.gin_id, "Gin")
    if body.author_id:
        get_or_404(db, User, body.author_id, "Author")
    if body.tasting_id:
        get_or_404(db, Tasting, body.tasting_id, "Tasting")
    check_cover(db, body.cover_media_id)
    check_tonic(db, body.tonic_id)
    data = body.model_dump()
    data["author_id"] = body.author_id or admin.user.id
    if data["slug"]:
        ensure_slug_free(db, Review, data["slug"])
    else:
        data["slug"] = unique_slug(db, Review, slugify(f"{gin.display_name} review"))
    review = Review(**data, status=ReviewStatus.DRAFT)
    db.add(review)
    add_revision(db, review, admin.user.id, "Created")
    audit.record(
        db,
        action="review.create",
        entity_type="review",
        entity_id=review.id,
        actor_id=admin.user.id,
        summary={"title": review.title},
    )
    db.commit()
    db.refresh(review)
    return review_out(review)


@router.get("/{review_id}", response_model=ReviewOut)
def get_review(review_id: uuid.UUID, admin: CurrentAdmin, db: DbSession):
    """Also used for the editor's preview of the public page."""
    return review_out(get_or_404(db, Review, review_id, "Review"))


@router.patch("/{review_id}", response_model=ReviewOut)
def update_review(
    review_id: uuid.UUID,
    body: ReviewPatch,
    admin: CurrentAdminWrite,
    db: DbSession,
    force: Force = False,
):
    review = get_or_404(db, Review, review_id, "Review")
    changes = body.model_dump(exclude_unset=True)
    sent_version = changes.pop("version")
    check_version(
        current_version=review.version,
        sent_version=sent_version,
        force=force,
        changes=changes,
        current=review_out(review),
    )
    if changes.get("gin_id"):
        get_or_404(db, GinProduct, changes["gin_id"], "Gin")
    if changes.get("author_id"):
        get_or_404(db, User, changes["author_id"], "Author")
    if "cover_media_id" in changes:
        check_cover(db, changes["cover_media_id"])
    if "tonic_id" in changes:
        check_tonic(db, changes["tonic_id"])
    if changes.get("slug"):
        ensure_slug_free(db, Review, changes["slug"], exclude_id=review.id)
    apply_patch(review, changes, never_empty={"title", "slug", "gin_id", "author_id"})
    db.flush()
    db.refresh(review)  # reload relationships (e.g. a new cover) before snapshotting
    add_revision(
        db, review, admin.user.id, "Edited" + (" (overwrote a newer save)" if force else "")
    )
    audit.record(
        db,
        action="review.update",
        entity_type="review",
        entity_id=review.id,
        actor_id=admin.user.id,
        summary={"fields": sorted(changes), "forced": force},
    )
    db.commit()
    db.refresh(review)
    return review_out(review)


@router.post("/{review_id}/status", response_model=ReviewOut)
def set_review_status(
    review_id: uuid.UUID, body: ReviewStatusChange, admin: CurrentAdminWrite, db: DbSession
):
    """Move a review through draft → ready → published → archived."""
    review = get_or_404(db, Review, review_id, "Review")
    check_version(
        current_version=review.version,
        sent_version=body.version,
        force=False,
        changes={},
        current=review_out(review),
    )
    old = review.status
    change_status(db, review, body.status, admin.user.id)
    audit.record(
        db,
        action=f"review.{body.status}",
        entity_type="review",
        entity_id=review.id,
        actor_id=admin.user.id,
        summary={"from": old, "to": body.status, "title": review.title},
    )
    db.commit()
    db.refresh(review)
    return review_out(review)


@router.post("/{review_id}/publish", response_model=ReviewOut)
def publish_review(
    review_id: uuid.UUID, body: ReviewStatusChange, admin: CurrentAdminWrite, db: DbSession
):
    """Spec §8 shortcut: the same as /status with status "published"."""
    body = ReviewStatusChange(version=body.version, status=ReviewStatus.PUBLISHED)
    return set_review_status(review_id, body, admin, db)


@router.get("/{review_id}/revisions", response_model=list[RevisionOut])
def list_revisions(review_id: uuid.UUID, admin: CurrentAdmin, db: DbSession):
    get_or_404(db, Review, review_id, "Review")
    return db.scalars(
        select(ReviewRevision)
        .where(ReviewRevision.review_id == review_id)
        .order_by(ReviewRevision.revision_number.desc())
    ).all()
