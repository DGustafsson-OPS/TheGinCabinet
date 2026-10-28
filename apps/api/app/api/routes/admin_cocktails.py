"""Cocktail editor (spec §8: /api/v1/admin/cocktails, §5 A07)."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select

from app.api.deps import CurrentStaff, CurrentStaffWrite, DbSession
from app.errors import ApiError
from app.models import CocktailRecipe, CocktailStatus, Ingredient
from app.models._types import utcnow
from app.schemas.cocktails import (
    CocktailIn,
    CocktailOut,
    CocktailPatch,
    CocktailStatusChange,
    IngredientOut,
)
from app.schemas.common import Page, PageParams
from app.services import audit
from app.services.cocktails import check_can_publish, cocktail_out, replace_lists
from app.services.common import (
    apply_patch,
    contains,
    ensure_slug_free,
    get_or_404,
    slugify,
    unique_slug,
)
from app.services.editorial import check_cover
from app.services.versioning import check_version

router = APIRouter(prefix="/admin", tags=["admin: cocktails"])

Force = Annotated[bool, Query(description="Overwrite even if the record changed meanwhile")]
LIST_FIELDS = ("ingredients", "steps", "gins")

# draft ⇄ published, and anything can be archived and restored to draft.
TRANSITIONS = {
    CocktailStatus.DRAFT: {CocktailStatus.PUBLISHED, CocktailStatus.ARCHIVED},
    CocktailStatus.PUBLISHED: {CocktailStatus.DRAFT, CocktailStatus.ARCHIVED},
    CocktailStatus.ARCHIVED: {CocktailStatus.DRAFT},
}


@router.get("/ingredients", response_model=list[IngredientOut])
def list_ingredients(admin: CurrentStaff, db: DbSession, search: str | None = None):
    """The reusable ingredient list, for autocomplete in the recipe form."""
    query = select(Ingredient).order_by(Ingredient.name)
    if search:
        query = query.where(contains(Ingredient.name, search))
    return [IngredientOut(id=i.id, name=i.name, category=i.category) for i in db.scalars(query)]


@router.get("/cocktails", response_model=Page[CocktailOut])
def list_cocktails(
    admin: CurrentStaff,
    db: DbSession,
    paging: Annotated[PageParams, Depends()],
    status: CocktailStatus | None = None,
    search: str | None = None,
):
    query = select(CocktailRecipe)
    if status:
        query = query.where(CocktailRecipe.status == status)
    if search:
        query = query.where(contains(CocktailRecipe.title, search))
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    rows = db.scalars(
        query.order_by(CocktailRecipe.updated_at.desc())
        .offset(paging.offset)
        .limit(paging.page_size)
    ).all()
    return Page[CocktailOut](items=[cocktail_out(r) for r in rows], meta=paging.meta(total))


@router.post("/cocktails", response_model=CocktailOut, status_code=201)
def create_cocktail(body: CocktailIn, admin: CurrentStaffWrite, db: DbSession):
    check_cover(db, body.cover_media_id)
    data = body.model_dump()
    lists = {key: data.pop(key) for key in LIST_FIELDS}
    if data["slug"]:
        ensure_slug_free(db, CocktailRecipe, data["slug"])
    else:
        data["slug"] = unique_slug(db, CocktailRecipe, slugify(data["title"]))
    recipe = CocktailRecipe(**data, author_id=admin.user.id, status=CocktailStatus.DRAFT)
    db.add(recipe)
    replace_lists(db, recipe, lists)
    db.flush()
    audit.record(
        db,
        action="cocktail.create",
        entity_type="cocktail",
        entity_id=recipe.id,
        actor_id=admin.user.id,
        summary={"title": recipe.title},
    )
    db.commit()
    db.refresh(recipe)
    return cocktail_out(recipe)


@router.get("/cocktails/{recipe_id}", response_model=CocktailOut)
def get_cocktail(recipe_id: uuid.UUID, admin: CurrentStaff, db: DbSession):
    return cocktail_out(get_or_404(db, CocktailRecipe, recipe_id, "Cocktail"))


@router.patch("/cocktails/{recipe_id}", response_model=CocktailOut)
def update_cocktail(
    recipe_id: uuid.UUID,
    body: CocktailPatch,
    admin: CurrentStaffWrite,
    db: DbSession,
    force: Force = False,
):
    recipe = get_or_404(db, CocktailRecipe, recipe_id, "Cocktail")
    changes = body.model_dump(exclude_unset=True)
    sent_version = changes.pop("version")
    check_version(
        current_version=recipe.version,
        sent_version=sent_version,
        force=force,
        changes={k: v for k, v in changes.items() if k not in LIST_FIELDS},
        current=cocktail_out(recipe),
    )
    if "cover_media_id" in changes:
        check_cover(db, changes["cover_media_id"])
    if changes.get("slug"):
        ensure_slug_free(db, CocktailRecipe, changes["slug"], exclude_id=recipe.id)
    lists = {key: changes.pop(key) for key in LIST_FIELDS if key in changes}
    replace_lists(db, recipe, lists)
    apply_patch(
        recipe,
        changes,
        never_empty={"title", "slug", "method", "difficulty", "servings_base", "tags", "equipment"},
    )
    audit.record(
        db,
        action="cocktail.update",
        entity_type="cocktail",
        entity_id=recipe.id,
        actor_id=admin.user.id,
        summary={"fields": sorted([*changes, *lists]), "forced": force},
    )
    db.commit()
    db.refresh(recipe)
    return cocktail_out(recipe)


@router.post("/cocktails/{recipe_id}/status", response_model=CocktailOut)
def set_cocktail_status(
    recipe_id: uuid.UUID, body: CocktailStatusChange, admin: CurrentStaffWrite, db: DbSession
):
    recipe = get_or_404(db, CocktailRecipe, recipe_id, "Cocktail")
    check_version(
        current_version=recipe.version,
        sent_version=body.version,
        force=False,
        changes={},
        current=cocktail_out(recipe),
    )
    old = CocktailStatus(recipe.status)
    if body.status != old:
        if body.status not in TRANSITIONS[old]:
            raise ApiError(
                422,
                "invalid_transition",
                f"A {old} recipe can't move straight to {body.status}.",
                details={"allowed": sorted(TRANSITIONS[old])},
            )
        if body.status == CocktailStatus.PUBLISHED:
            check_can_publish(recipe)
            recipe.published_at = recipe.published_at or utcnow()
        recipe.status = body.status
        recipe.updated_at = utcnow()
        audit.record(
            db,
            action=f"cocktail.{body.status}",
            entity_type="cocktail",
            entity_id=recipe.id,
            actor_id=admin.user.id,
            summary={"from": old, "to": body.status, "title": recipe.title},
        )
        db.commit()
        db.refresh(recipe)
    return cocktail_out(recipe)


@router.post("/cocktails/{recipe_id}/publish", response_model=CocktailOut)
def publish_cocktail(
    recipe_id: uuid.UUID, body: CocktailStatusChange, admin: CurrentStaffWrite, db: DbSession
):
    """Spec §8 shortcut: the same as /status with status "published"."""
    body = CocktailStatusChange(version=body.version, status=CocktailStatus.PUBLISHED)
    return set_cocktail_status(recipe_id, body, admin, db)
