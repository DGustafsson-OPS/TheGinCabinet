"""Public cocktail library (spec §8: GET /api/v1/public/cocktails[/{slug}], §4 P06–P07).

Only published recipes are visible. Recommended gins appear only when the gin
itself is public, and the gin→cocktails list reads the very same pairing
table, so both directions always agree (spec §11).
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_, select

from app.api.deps import DbSession
from app.errors import ApiError
from app.models import CocktailGinRecommendation, CocktailRecipe, CocktailStatus, GinProduct
from app.models.cocktails import Difficulty, Method
from app.schemas.cocktails import PublicCocktail, PublicCocktailCard
from app.schemas.common import Page, PageParams
from app.services.cocktails import public_card, public_cocktail
from app.services.common import contains

router = APIRouter(prefix="/public", tags=["public: cocktails"])


def visible_cocktails():
    """The single definition of "a recipe the public may see"."""
    return select(CocktailRecipe).where(CocktailRecipe.status == CocktailStatus.PUBLISHED)


@router.get("/cocktails", response_model=Page[PublicCocktailCard])
def list_public_cocktails(
    db: DbSession,
    paging: Annotated[PageParams, Depends()],
    search: str | None = None,
    method: Method | None = None,
    difficulty: Difficulty | None = None,
    tag: str | None = None,
):
    query = visible_cocktails()
    if search:
        query = query.where(
            or_(contains(CocktailRecipe.title, search), contains(CocktailRecipe.intro, search))
        )
    if method:
        query = query.where(CocktailRecipe.method == method)
    if difficulty:
        query = query.where(CocktailRecipe.difficulty == difficulty)
    rows = db.scalars(query.order_by(CocktailRecipe.published_at.desc())).all()
    if tag:
        # Tags live in a JSON list; filtering here works the same on every database.
        rows = [r for r in rows if tag.strip().lower() in (r.tags or [])]
    total = len(rows)
    page = rows[paging.offset : paging.offset + paging.page_size]
    return Page[PublicCocktailCard](items=[public_card(r) for r in page], meta=paging.meta(total))


@router.get("/cocktails/{slug}", response_model=PublicCocktail)
def get_public_cocktail(
    slug: str,
    db: DbSession,
    servings: Annotated[
        int | None, Query(ge=1, le=12, description="Scale to this many drinks")
    ] = None,
):
    recipe = db.scalar(visible_cocktails().where(CocktailRecipe.slug == slug))
    if recipe is None:
        raise ApiError(404, "not_found", "Cocktail not found.")
    return public_cocktail(recipe, servings)


@router.get("/gins/{slug}/cocktails", response_model=list[PublicCocktailCard])
def cocktails_for_gin(slug: str, db: DbSession):
    """Published cocktails that recommend this (public) gin, best match first."""
    gin = db.scalar(
        select(GinProduct).where(GinProduct.slug == slug, GinProduct.public_visible.is_(True))
    )
    if gin is None:
        raise ApiError(404, "not_found", "Gin not found.")
    rows = db.scalars(
        visible_cocktails()
        .join(CocktailGinRecommendation, CocktailGinRecommendation.recipe_id == CocktailRecipe.id)
        .where(CocktailGinRecommendation.gin_id == gin.id)
        .order_by(CocktailGinRecommendation.priority, CocktailRecipe.title)
    ).all()
    return [public_card(r) for r in rows]
