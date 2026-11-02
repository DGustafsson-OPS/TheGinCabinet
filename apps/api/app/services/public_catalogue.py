"""Building the public catalogue (spec §4 P01–P03, P08, §6 "Public gin visibility")."""

import uuid
from decimal import Decimal

from sqlalchemy import case, func, select, union_all
from sqlalchemy.orm import Session

from app.models import (
    IN_CABINET,
    Bottle,
    GinProduct,
    QuickReview,
    Review,
    ReviewStatus,
    gin_botanicals,
)
from app.schemas.public import CollectionStatus, PublicDistilleryRef, PublicGinCard
from app.services.catalogue import gin_images

RELATED_LIMIT = 4


def public_gins():
    """The single definition of "a gin the public may see" (spec §6)."""
    return select(GinProduct).where(GinProduct.public_visible.is_(True))


def rating_subquery():
    """Each gin's average score out of 10, from all its ratings together.

    Published full reviews count with their 0–10 score; quick reviews count
    as twice their juniper berries (4.5 berries → 9.0). Gins without any
    rating have no row.
    """
    scores = union_all(
        select(Review.gin_id.label("gin_id"), Review.rating.label("score")).where(
            Review.status == ReviewStatus.PUBLISHED, Review.rating.is_not(None)
        ),
        select(QuickReview.gin_id.label("gin_id"), (QuickReview.rating * 2).label("score")).where(
            QuickReview.gin_id.is_not(None)  # quick reviews of tonics don't count here
        ),
    ).subquery()
    return (
        select(scores.c.gin_id, func.avg(scores.c.score).label("avg_rating"))
        .group_by(scores.c.gin_id)
        .subquery()
    )


def _counts(db: Session, gin_col, extra_where, gin_ids) -> dict[uuid.UUID, int]:
    query = select(gin_col, func.count()).where(gin_col.in_(gin_ids), *extra_where)
    return dict(db.execute(query.group_by(gin_col)).all())


def ratings(
    db: Session, gin_ids: list[uuid.UUID]
) -> dict[uuid.UUID, tuple[Decimal | None, int, int]]:
    """Per gin: the combined average out of 10, the number of published full
    reviews, and the number of quick reviews."""
    if not gin_ids:
        return {}
    rated = rating_subquery()
    averages = dict(
        db.execute(
            select(rated.c.gin_id, rated.c.avg_rating).where(rated.c.gin_id.in_(gin_ids))
        ).all()
    )
    full = _counts(db, Review.gin_id, [Review.status == ReviewStatus.PUBLISHED], gin_ids)
    quick = _counts(db, QuickReview.gin_id, [], gin_ids)
    return {
        gin_id: (
            Decimal(averages[gin_id]).quantize(Decimal("0.1"))
            if averages.get(gin_id) is not None
            else None,
            full.get(gin_id, 0),
            quick.get(gin_id, 0),
        )
        for gin_id in gin_ids
    }


def collection_statuses(db: Session, gin_ids: list[uuid.UUID]) -> dict[uuid.UUID, CollectionStatus]:
    """Owned / previously owned, worked out from bottles but never showing counts."""
    if not gin_ids:
        return {}
    rows = db.execute(
        select(
            Bottle.gin_id,
            func.sum(case((Bottle.status.in_(IN_CABINET), 1), else_=0)),
            func.count(),
        )
        .where(Bottle.gin_id.in_(gin_ids))
        .group_by(Bottle.gin_id)
    ).all()
    return {
        gin_id: "owned" if (in_cabinet or 0) > 0 else "previously_owned"
        for gin_id, in_cabinet, total in rows
        if total > 0
    }


def cards(db: Session, gins: list[GinProduct]) -> list[PublicGinCard]:
    """Turn gins into public cards with only three extra queries in total."""
    ids = [g.id for g in gins]
    rating_map = ratings(db, ids)
    status_map = collection_statuses(db, ids)
    result = []
    for gin in gins:
        avg, count, quick_count = rating_map.get(gin.id, (None, 0, 0))
        images = gin_images(gin)
        distillery = gin.distillery
        result.append(
            PublicGinCard(
                slug=gin.slug,
                display_name=gin.display_name,
                brand=gin.brand,
                style=gin.style,
                abv=gin.abv,
                country=gin.country,
                distillery=PublicDistilleryRef(
                    slug=distillery.slug, name=distillery.name, country=distillery.country
                )
                if distillery
                else None,
                image=images[0] if images else None,
                collection_status=status_map.get(gin.id),
                rating=avg,
                review_count=count,
                quick_review_count=quick_count,
            )
        )
    return result


def related_gins(db: Session, gin: GinProduct) -> list[GinProduct]:
    """Other public gins that share the style or botanicals (spec P03), most overlap first."""
    botanical_ids = [b.id for b in gin.botanicals]
    overlap = (
        select(gin_botanicals.c.gin_id, func.count().label("shared"))
        .where(gin_botanicals.c.botanical_id.in_(botanical_ids))
        .group_by(gin_botanicals.c.gin_id)
        .subquery()
    )
    score = func.coalesce(overlap.c.shared, 0) + case((GinProduct.style == gin.style, 2), else_=0)
    query = (
        public_gins()
        .outerjoin(overlap, overlap.c.gin_id == GinProduct.id)
        .where(GinProduct.id != gin.id)
        .where(score > 0)
        .order_by(score.desc(), GinProduct.brand, GinProduct.name)
        .limit(RELATED_LIMIT)
    )
    return list(db.scalars(query))
