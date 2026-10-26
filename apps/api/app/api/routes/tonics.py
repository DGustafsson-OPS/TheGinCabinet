"""Tonics: admin catalogue + reviews, and the public tonic pages.

Deliberately simple compared with gins: no bottles, purchases or stock.

Admin:   /api/v1/admin/tonics[/{id}], /admin/tonics/{id}/reviews, /admin/tonic-reviews/{id}
Public:  /api/v1/public/tonics[/{slug}]: only public tonics, only published reviews.
"""

import uuid
from decimal import ROUND_HALF_UP, Decimal
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import func, or_, select, update
from sqlalchemy.orm import Session

from app.api.deps import CurrentAdmin, CurrentAdminWrite, DbSession
from app.errors import ApiError
from app.models import Review, Tonic, TonicReview, TonicReviewStatus, TonicStyle, User
from app.models._types import utcnow
from app.schemas.common import Page, PageParams
from app.schemas.editorial import Person
from app.schemas.tonics import (
    PublicTonic,
    PublicTonicCard,
    PublicTonicReview,
    TonicIn,
    TonicOut,
    TonicPatch,
    TonicReviewIn,
    TonicReviewOut,
    TonicReviewPatch,
    TonicSort,
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
from app.services.editorial import check_cover, media_summary, visible_reviews
from app.services.editorial import public_card as review_card
from app.services.versioning import check_version

router = APIRouter(prefix="/admin", tags=["admin: tonics"])
public_router = APIRouter(prefix="/public/tonics", tags=["public: tonics"])


# ---------------- Helpers ----------------


def review_out(review: TonicReview) -> TonicReviewOut:
    return TonicReviewOut(
        id=review.id,
        author=Person.model_validate(review.author),
        rating=review.rating,
        notes=review.notes,
        pairs_with=review.pairs_with,
        status=review.status,
        published_at=review.published_at,
        version=review.version,
        updated_at=review.updated_at,
    )


def tonic_out(tonic: Tonic) -> TonicOut:
    return TonicOut(
        id=tonic.id,
        slug=tonic.slug,
        brand=tonic.brand,
        name=tonic.name,
        display_name=tonic.display_name,
        style=tonic.style,
        country=tonic.country,
        flavour_notes=tonic.flavour_notes or [],
        description=tonic.description,
        image_media_id=tonic.image_media_id,
        image=media_summary(tonic.image),
        public_visible=tonic.public_visible,
        reviews=[review_out(r) for r in tonic.reviews],
        version=tonic.version,
        created_at=tonic.created_at,
        updated_at=tonic.updated_at,
    )


def ensure_unique_name(
    db: Session, brand: str, name: str, exclude_id: uuid.UUID | None = None
) -> None:
    """One entry per brand + name (case doesn't matter)."""
    query = select(Tonic).where(
        func.lower(Tonic.brand) == brand.lower(), func.lower(Tonic.name) == name.lower()
    )
    if exclude_id:
        query = query.where(Tonic.id != exclude_id)
    existing = db.scalar(query)
    if existing:
        raise ApiError(
            409,
            "duplicate_tonic",
            f"{existing.display_name} is already in the list.",
            details={"existing_id": str(existing.id)},
        )


def _published(tonic: Tonic) -> list[TonicReview]:
    return [r for r in tonic.reviews if r.status == TonicReviewStatus.PUBLISHED]


def _average(reviews: list[TonicReview]) -> Decimal | None:
    ratings = [r.rating for r in reviews if r.rating is not None]
    if not ratings:
        return None
    return (sum(ratings) / len(ratings)).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP)


# ---------------- Admin: tonics ----------------


@router.get("/tonics", response_model=Page[TonicOut])
def list_tonics(
    admin: CurrentAdmin,
    db: DbSession,
    paging: Annotated[PageParams, Depends()],
    search: str | None = None,
    style: TonicStyle | None = None,
    public: bool | None = None,
):
    query = select(Tonic)
    if search:
        query = query.where(
            or_(
                contains(Tonic.brand, search),
                contains(Tonic.name, search),
                contains(Tonic.country, search),
            )
        )
    if style:
        query = query.where(Tonic.style == style)
    if public is not None:
        query = query.where(Tonic.public_visible.is_(public))
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    rows = db.scalars(
        query.order_by(Tonic.brand, Tonic.name).offset(paging.offset).limit(paging.page_size)
    ).unique()
    return Page[TonicOut](items=[tonic_out(t) for t in rows], meta=paging.meta(total))


@router.post("/tonics", response_model=TonicOut, status_code=201)
def create_tonic(body: TonicIn, admin: CurrentAdminWrite, db: DbSession):
    ensure_unique_name(db, body.brand, body.name)
    check_cover(db, body.image_media_id)
    data = body.model_dump()
    if data["slug"]:
        ensure_slug_free(db, Tonic, data["slug"])
    else:
        data["slug"] = unique_slug(db, Tonic, slugify(f"{body.brand} {body.name}"))
    tonic = Tonic(**data)
    db.add(tonic)
    db.flush()
    audit.record(
        db,
        action="tonic.create",
        entity_type="tonic",
        entity_id=tonic.id,
        actor_id=admin.user.id,
        summary={"title": tonic.display_name},
    )
    db.commit()
    db.refresh(tonic)
    return tonic_out(tonic)


@router.get("/tonics/{tonic_id}", response_model=TonicOut)
def get_tonic(tonic_id: uuid.UUID, admin: CurrentAdmin, db: DbSession):
    return tonic_out(get_or_404(db, Tonic, tonic_id, "Tonic"))


@router.patch("/tonics/{tonic_id}", response_model=TonicOut)
def update_tonic(tonic_id: uuid.UUID, body: TonicPatch, admin: CurrentAdminWrite, db: DbSession):
    tonic = get_or_404(db, Tonic, tonic_id, "Tonic")
    changes = body.model_dump(exclude_unset=True)
    check_version(
        current_version=tonic.version,
        sent_version=changes.pop("version"),
        force=False,
        changes=changes,
        current=tonic_out(tonic),
    )
    if "brand" in changes or "name" in changes:
        ensure_unique_name(
            db,
            changes.get("brand") or tonic.brand,
            changes.get("name") or tonic.name,
            exclude_id=tonic.id,
        )
    if "image_media_id" in changes:
        check_cover(db, changes["image_media_id"])
    if changes.get("slug"):
        ensure_slug_free(db, Tonic, changes["slug"], exclude_id=tonic.id)
    apply_patch(tonic, changes, never_empty={"brand", "name", "slug", "style", "public_visible"})
    audit.record(
        db,
        action="tonic.update",
        entity_type="tonic",
        entity_id=tonic.id,
        actor_id=admin.user.id,
        summary={"title": tonic.display_name, "fields": sorted(changes)},
    )
    db.commit()
    db.refresh(tonic)
    return tonic_out(tonic)


@router.delete("/tonics/{tonic_id}", status_code=204)
def delete_tonic(tonic_id: uuid.UUID, admin: CurrentAdminWrite, db: DbSession):
    """Remove a tonic and its reviews (the UI asks for confirmation first)."""
    tonic = get_or_404(db, Tonic, tonic_id, "Tonic")
    audit.record(
        db,
        action="tonic.delete",
        entity_type="tonic",
        entity_id=tonic.id,
        actor_id=admin.user.id,
        summary={"title": tonic.display_name, "reviews": len(tonic.reviews)},
    )
    # Gin reviews that linked to this tonic keep their tonic text; only the
    # link goes. (PostgreSQL would do this by itself via ON DELETE SET NULL;
    # doing it here makes every database behave the same.)
    db.execute(update(Review).where(Review.tonic_id == tonic.id).values(tonic_id=None))
    db.delete(tonic)
    db.commit()


# ---------------- Admin: reviews ----------------


def _check_publishable(review: TonicReview) -> None:
    problems = []
    if review.rating is None:
        problems.append("Give a rating.")
    if not (review.notes or "").strip():
        problems.append("Write your tasting notes.")
    if problems:
        raise ApiError(422, "not_publishable", "This review can't be published yet.", problems)


@router.post("/tonics/{tonic_id}/reviews", response_model=TonicReviewOut, status_code=201)
def add_review(tonic_id: uuid.UUID, body: TonicReviewIn, admin: CurrentAdminWrite, db: DbSession):
    """Start a review as a draft."""
    tonic = get_or_404(db, Tonic, tonic_id, "Tonic")
    if body.author_id:
        get_or_404(db, User, body.author_id, "Author")
    review = TonicReview(
        tonic_id=tonic.id,
        author_id=body.author_id or admin.user.id,
        rating=body.rating,
        notes=body.notes,
        pairs_with=body.pairs_with,
        status=TonicReviewStatus.DRAFT,
    )
    db.add(review)
    db.flush()
    audit.record(
        db,
        action="tonic_review.create",
        entity_type="tonic_review",
        entity_id=review.id,
        actor_id=admin.user.id,
        summary={"title": tonic.display_name},
    )
    db.commit()
    db.refresh(review)
    return review_out(review)


@router.patch("/tonic-reviews/{review_id}", response_model=TonicReviewOut)
def update_review(
    review_id: uuid.UUID, body: TonicReviewPatch, admin: CurrentAdminWrite, db: DbSession
):
    """Edit a review; ``status`` publishes (needs rating + notes) or unpublishes it."""
    review = get_or_404(db, TonicReview, review_id, "Review")
    changes = body.model_dump(exclude_unset=True)
    check_version(
        current_version=review.version,
        sent_version=changes.pop("version"),
        force=False,
        changes=changes,
        current=review_out(review),
    )
    if changes.get("author_id"):
        get_or_404(db, User, changes["author_id"], "Author")
    new_status = changes.pop("status", None)
    apply_patch(review, changes, never_empty={"author_id"})
    action = "tonic_review.update"
    if new_status == TonicReviewStatus.PUBLISHED and review.status != TonicReviewStatus.PUBLISHED:
        _check_publishable(review)
        review.status = TonicReviewStatus.PUBLISHED
        review.published_at = review.published_at or utcnow()
        action = "tonic_review.published"
    elif new_status == TonicReviewStatus.DRAFT and review.status != TonicReviewStatus.DRAFT:
        review.status = TonicReviewStatus.DRAFT
        action = "tonic_review.unpublished"
    elif review.status == TonicReviewStatus.PUBLISHED:
        _check_publishable(review)  # a live review must stay complete
    audit.record(
        db,
        action=action,
        entity_type="tonic_review",
        entity_id=review.id,
        actor_id=admin.user.id,
        summary={"title": review.tonic.display_name},
    )
    db.commit()
    db.refresh(review)
    return review_out(review)


@router.delete("/tonic-reviews/{review_id}", status_code=204)
def delete_review(review_id: uuid.UUID, admin: CurrentAdminWrite, db: DbSession):
    review = get_or_404(db, TonicReview, review_id, "Review")
    audit.record(
        db,
        action="tonic_review.delete",
        entity_type="tonic_review",
        entity_id=review.id,
        actor_id=admin.user.id,
        summary={"title": review.tonic.display_name},
    )
    db.delete(review)
    db.commit()


# ---------------- Public ----------------


def public_card(tonic: Tonic) -> PublicTonicCard:
    published = _published(tonic)
    return PublicTonicCard(
        slug=tonic.slug,
        brand=tonic.brand,
        display_name=tonic.display_name,
        style=tonic.style,
        country=tonic.country,
        image=media_summary(tonic.image),
        rating=_average(published),
        review_count=len(published),
    )


@public_router.get("", response_model=Page[PublicTonicCard])
def list_public_tonics(
    db: DbSession,
    paging: Annotated[PageParams, Depends()],
    search: str | None = None,
    style: TonicStyle | None = None,
    sort: TonicSort = "name",
):
    query = select(Tonic).where(Tonic.public_visible.is_(True))
    if search:
        query = query.where(
            or_(
                contains(Tonic.brand, search),
                contains(Tonic.name, search),
                contains(Tonic.country, search),
            )
        )
    if style:
        query = query.where(Tonic.style == style)
    tonics = db.scalars(query.order_by(Tonic.brand, Tonic.name)).unique().all()
    cards = [public_card(t) for t in tonics]
    if sort == "rating":
        # Best rated first; unrated ones last (Python's sort is stable, so ties keep A–Z).
        cards.sort(key=lambda c: (c.rating is None, -(c.rating or 0)))
    page = cards[paging.offset : paging.offset + paging.page_size]
    return Page[PublicTonicCard](items=page, meta=paging.meta(len(cards)))


@public_router.get("/{slug}", response_model=PublicTonic)
def get_public_tonic(slug: str, db: DbSession):
    tonic = db.scalar(select(Tonic).where(Tonic.slug == slug, Tonic.public_visible.is_(True)))
    if tonic is None:
        raise ApiError(404, "not_found", "Tonic not found.")
    published = sorted(
        _published(tonic), key=lambda r: r.published_at or r.created_at, reverse=True
    )
    return PublicTonic(
        **public_card(tonic).model_dump(),
        flavour_notes=tonic.flavour_notes or [],
        description=tonic.description,
        reviews=[
            PublicTonicReview(
                author_name=r.author.display_name,
                rating=r.rating,
                notes=r.notes,
                pairs_with=r.pairs_with,
                published_at=r.published_at,
            )
            for r in published
        ],
        gin_reviews=[
            review_card(r)
            for r in db.scalars(
                visible_reviews()
                .where(Review.tonic_id == tonic.id)
                .order_by(Review.published_at.desc())
                .limit(12)
            ).unique()
        ],
        updated_at=tonic.updated_at,
    )
