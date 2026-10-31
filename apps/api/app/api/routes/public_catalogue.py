"""Public catalogue (spec §8: GET /api/v1/public/gins[/{slug}], /public/distilleries[/{slug}])."""

from decimal import Decimal
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import distinct, func, or_, select

from app.api.deps import DbSession
from app.errors import ApiError
from app.models import (
    Botanical,
    CocktailGinRecommendation,
    CocktailRecipe,
    CocktailStatus,
    Distillery,
    GinProduct,
    GinTonicPairing,
    Review,
    ReviewStatus,
    Tonic,
    gin_botanicals,
)
from app.schemas.cocktails import PublicTonicLink
from app.schemas.common import Page, PageParams
from app.schemas.public import (
    Facets,
    PublicDistillery,
    PublicDistilleryCard,
    PublicGin,
    PublicGinCard,
    PublicStats,
)
from app.services import cocktails as cocktail_service
from app.services import editorial
from app.services.catalogue import gin_images
from app.services.common import contains
from app.services.public_catalogue import cards, public_gins, related_gins

router = APIRouter(prefix="/public", tags=["public: catalogue"])

GinSort = Literal["name", "newest", "abv", "rating"]


def rating_subquery():
    """Average published rating per gin, to filter and sort by."""
    return (
        select(Review.gin_id.label("gin_id"), func.avg(Review.rating).label("avg_rating"))
        .where(Review.status == ReviewStatus.PUBLISHED)
        .group_by(Review.gin_id)
        .subquery()
    )


@router.get("/gins", response_model=Page[PublicGinCard])
def list_public_gins(
    db: DbSession,
    paging: Annotated[PageParams, Depends()],
    search: str | None = None,
    style: str | None = None,
    country: str | None = None,
    botanical: str | None = None,
    abv_min: Annotated[Decimal | None, Query(ge=0, le=100)] = None,
    abv_max: Annotated[Decimal | None, Query(ge=0, le=100)] = None,
    min_rating: Annotated[Decimal | None, Query(ge=0, le=10)] = None,
    sort: GinSort = "name",
):
    """P02 collection: search name/producer/country and filter (spec §4)."""
    rated = rating_subquery()
    query = public_gins().outerjoin(rated, rated.c.gin_id == GinProduct.id)
    if search:
        query = query.outerjoin(Distillery, Distillery.id == GinProduct.distillery_id).where(
            or_(
                contains(GinProduct.brand, search),
                contains(GinProduct.name, search),
                contains(GinProduct.edition, search),
                contains(GinProduct.country, search),
                contains(Distillery.name, search),
            )
        )
    if style:
        query = query.where(GinProduct.style == style)
    if country:
        query = query.where(func.lower(GinProduct.country) == country.lower())
    if botanical:
        query = query.where(
            GinProduct.id.in_(
                select(gin_botanicals.c.gin_id)
                .join(Botanical, Botanical.id == gin_botanicals.c.botanical_id)
                .where(Botanical.name == botanical.strip().lower())
            )
        )
    if abv_min is not None:
        query = query.where(GinProduct.abv >= abv_min)
    if abv_max is not None:
        query = query.where(GinProduct.abv <= abv_max)
    if min_rating is not None:
        query = query.where(rated.c.avg_rating >= min_rating)

    order = {
        "name": (GinProduct.brand, GinProduct.name),
        "newest": (GinProduct.created_at.desc(),),
        "abv": (GinProduct.abv.desc(), GinProduct.brand),
        "rating": (rated.c.avg_rating.desc().nulls_last(), GinProduct.brand),
    }[sort]
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    gins = db.scalars(query.order_by(*order).offset(paging.offset).limit(paging.page_size)).all()
    return Page[PublicGinCard](items=cards(db, list(gins)), meta=paging.meta(total))


@router.get("/gins/facets", response_model=Facets)
def gin_facets(db: DbSession):
    """Filter options that exist among public gins (so no empty choices)."""
    visible = public_gins().subquery()
    styles = db.scalars(select(distinct(visible.c.style)).order_by(visible.c.style))
    countries = db.scalars(
        select(distinct(visible.c.country))
        .where(visible.c.country.is_not(None))
        .order_by(visible.c.country)
    )
    botanicals = db.scalars(
        select(distinct(Botanical.name))
        .join(gin_botanicals, gin_botanicals.c.botanical_id == Botanical.id)
        .join(visible, visible.c.id == gin_botanicals.c.gin_id)
        .order_by(Botanical.name)
    )
    return Facets(styles=list(styles), countries=list(countries), botanicals=list(botanicals))


@router.get("/gins/{slug}", response_model=PublicGin)
def get_public_gin(slug: str, db: DbSession):
    """P03 gin detail. Private gins are a plain 404 (spec §6, §8)."""
    gin = db.scalar(public_gins().where(GinProduct.slug == slug))
    if gin is None:
        raise ApiError(404, "not_found", "Gin not found.")
    card = cards(db, [gin])[0]
    reviews = db.scalars(
        select(Review)
        .where(Review.gin_id == gin.id, Review.status == ReviewStatus.PUBLISHED)
        .order_by(Review.published_at.desc())
    ).all()
    recipes = db.scalars(
        select(CocktailRecipe)
        .join(CocktailGinRecommendation, CocktailGinRecommendation.recipe_id == CocktailRecipe.id)
        .where(
            CocktailGinRecommendation.gin_id == gin.id,
            CocktailRecipe.status == CocktailStatus.PUBLISHED,
        )
        .order_by(CocktailGinRecommendation.priority, CocktailRecipe.title)
    ).all()
    return PublicGin(
        **card.model_dump(),
        edition=gin.edition,
        description=gin.description,
        botanicals=[b.name for b in gin.botanicals],
        images=gin_images(gin),
        reviews=[editorial.public_card(r) for r in reviews],
        cocktails=[cocktail_service.public_card(r) for r in recipes],
        # Tonics that suit it (set on the tonic), public tonics only.
        tonics=[
            PublicTonicLink(
                slug=t.slug, display_name=t.display_name, style=t.style, pairing_note=note
            )
            for t, note in db.execute(
                select(Tonic, GinTonicPairing.pairing_note)
                .join(GinTonicPairing, GinTonicPairing.tonic_id == Tonic.id)
                .where(GinTonicPairing.gin_id == gin.id, Tonic.public_visible.is_(True))
                .order_by(Tonic.brand, Tonic.name)
            ).unique()
        ],
        related=cards(db, related_gins(db, gin)),
        updated_at=gin.updated_at,
    )


def _distillery_counts(db: DbSession) -> dict:
    rows = db.execute(
        select(GinProduct.distillery_id, func.count())
        .where(GinProduct.public_visible.is_(True), GinProduct.distillery_id.is_not(None))
        .group_by(GinProduct.distillery_id)
    ).all()
    return dict(rows)


@router.get("/distilleries", response_model=list[PublicDistilleryCard])
def list_public_distilleries(db: DbSession):
    """P08: only distilleries linked to public gins (spec §4)."""
    counts = _distillery_counts(db)
    if not counts:
        return []
    rows = db.scalars(select(Distillery).where(Distillery.id.in_(counts)).order_by(Distillery.name))
    return [
        PublicDistilleryCard(
            slug=d.slug, name=d.name, country=d.country, region=d.region, gin_count=counts[d.id]
        )
        for d in rows
    ]


@router.get("/distilleries/{slug}", response_model=PublicDistillery)
def get_public_distillery(slug: str, db: DbSession):
    distillery = db.scalar(select(Distillery).where(Distillery.slug == slug))
    gins = (
        db.scalars(
            public_gins()
            .where(GinProduct.distillery_id == distillery.id)
            .order_by(GinProduct.brand, GinProduct.name)
        ).all()
        if distillery
        else []
    )
    if distillery is None or not gins:
        raise ApiError(404, "not_found", "Distillery not found.")
    return PublicDistillery(
        slug=distillery.slug,
        name=distillery.name,
        country=distillery.country,
        region=distillery.region,
        gin_count=len(gins),
        description=distillery.description,
        website=distillery.website,
        gins=cards(db, list(gins)),
    )


@router.get("/stats", response_model=PublicStats)
def public_stats(db: DbSession):
    """Home page numbers: only public things (spec P01: "never private bottles")."""
    visible = public_gins().subquery()
    review_count = db.scalar(
        select(func.count())
        .select_from(Review)
        .join(GinProduct, GinProduct.id == Review.gin_id)
        .where(Review.status == ReviewStatus.PUBLISHED, GinProduct.public_visible.is_(True))
    )
    return PublicStats(
        gins=db.scalar(select(func.count()).select_from(visible)) or 0,
        reviews=review_count or 0,
        cocktails=db.scalar(
            select(func.count())
            .select_from(CocktailRecipe)
            .where(CocktailRecipe.status == CocktailStatus.PUBLISHED)
        )
        or 0,
        countries=db.scalar(
            select(func.count(distinct(visible.c.country))).where(visible.c.country.is_not(None))
        )
        or 0,
    )
