"""Building the public catalogue (spec §4 P01–P03, P08, §6 "Public gin visibility")."""

import uuid
from decimal import Decimal

from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.models import (
    IN_CABINET,
    Bottle,
    GinProduct,
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


def ratings(db: Session, gin_ids: list[uuid.UUID]) -> dict[uuid.UUID, tuple[Decimal, int]]:
    """Average rating and count of *published* reviews, per gin."""
    if not gin_ids:
        return {}
    rows = db.execute(
        select(Review.gin_id, func.avg(Review.rating), func.count())
        .where(Review.gin_id.in_(gin_ids), Review.status == ReviewStatus.PUBLISHED)
        .group_by(Review.gin_id)
    ).all()
    return {
        gin_id: (Decimal(avg).quantize(Decimal("0.1")) if avg is not None else None, count)
        for gin_id, avg, count in rows
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
        avg, count = rating_map.get(gin.id, (None, 0))
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
