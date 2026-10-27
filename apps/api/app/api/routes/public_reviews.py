"""Public reviews (spec §8: GET /api/v1/public/reviews[/{slug}], §4 P04–P05).

No sign-in needed. Only reviews that are **published** *and* about a gin that
is **public** are visible; anything else is a plain 404, so visitors can't
even tell that a draft exists (spec §8, §11).
"""

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import func, or_, select

from app.api.deps import DbSession
from app.errors import ApiError
from app.models import GinProduct, Review
from app.schemas.common import Page, PageParams
from app.schemas.editorial import PublicReview, PublicReviewCard, SortOrder
from app.services.common import contains
from app.services.editorial import public_card, public_review, visible_reviews

router = APIRouter(prefix="/public/reviews", tags=["public: reviews"])


@router.get("", response_model=Page[PublicReviewCard])
def list_public_reviews(
    db: DbSession,
    paging: Annotated[PageParams, Depends()],
    search: str | None = None,
    sort: SortOrder = "recent",
):
    query = visible_reviews()
    if search:
        query = query.where(
            or_(
                contains(Review.title, search),
                contains(GinProduct.brand, search),
                contains(GinProduct.name, search),
            )
        )
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    order = (
        (Review.rating.desc().nulls_last(), Review.published_at.desc())
        if sort == "rating"
        else (Review.published_at.desc(),)
    )
    rows = db.scalars(query.order_by(*order).offset(paging.offset).limit(paging.page_size)).all()
    return Page[PublicReviewCard](items=[public_card(r) for r in rows], meta=paging.meta(total))


@router.get("/{slug}", response_model=PublicReview)
def get_public_review(slug: str, db: DbSession):
    review = db.scalar(visible_reviews().where(Review.slug == slug))
    if review is None:
        raise ApiError(404, "not_found", "Review not found.")
    return public_review(review)
