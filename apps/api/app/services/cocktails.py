"""Rules for cocktail recipes: ingredient lists, scaling and publishing (spec §5 A07, P07)."""

import uuid
from decimal import ROUND_HALF_UP, Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.errors import ApiError
from app.models import (
    CocktailGinRecommendation,
    CocktailRecipe,
    CocktailTonicRecommendation,
    GinProduct,
    Ingredient,
    RecipeIngredient,
    RecipeStep,
    Tonic,
)
from app.schemas.catalogue import GinSummary
from app.schemas.cocktails import (
    CocktailOut,
    IngredientLineOut,
    PairingOut,
    PublicCocktail,
    PublicCocktailCard,
    PublicGinPairing,
    PublicTonicLink,
    TonicLinkOut,
    TonicSummary,
)
from app.schemas.editorial import Person
from app.services.editorial import media_summary, teaser

MIN_SERVINGS, MAX_SERVINGS = 1, 12  # spec P07: "serving count (1–12)"
CENT = Decimal("0.01")

# ---------------- Saving the lists ----------------


def ingredient_by_name(db: Session, name: str) -> Ingredient:
    """Find an ingredient by name, ignoring case, or create it.

    This builds the "reusable ingredient master" (spec §1) as recipes are written.
    """
    clean = " ".join(name.split())
    key = clean.lower()
    found = db.scalar(select(Ingredient).where(Ingredient.name_key == key))
    if found is None:
        found = Ingredient(name=clean, name_key=key)
        db.add(found)
        db.flush()
    return found


def replace_lists(db: Session, recipe: CocktailRecipe, data: dict[str, Any]) -> None:
    """Swap in new ingredient, step and gin lists, each only if it was sent."""
    if data.get("ingredients") is not None:
        recipe.ingredients = [
            RecipeIngredient(
                ingredient=ingredient_by_name(db, line["name"]),
                position=position,
                quantity=line.get("quantity"),
                unit=line["unit"],
                note=line.get("note"),
                optional=line.get("optional", False),
            )
            for position, line in enumerate(data["ingredients"])
        ]
    if data.get("steps") is not None:
        recipe.steps = [
            RecipeStep(position=position, text=step["text"].strip())
            for position, step in enumerate(data["steps"])
        ]
    if data.get("gins") is not None:
        gin_ids = [pairing["gin_id"] for pairing in data["gins"]]
        if len(set(gin_ids)) != len(gin_ids):
            raise ApiError(422, "duplicate_pairing", "Each gin can be recommended only once.")
        for gin_id in gin_ids:
            if db.get(GinProduct, gin_id) is None:
                raise ApiError(404, "not_found", "A recommended gin doesn't exist.")
        # Reuse the row for a gin that stays: a new row for the same gin would
        # clash with the unique (recipe, gin) rule, because the database
        # inserts new rows before it deletes the old ones.
        existing = {rec.gin_id: rec for rec in recipe.gin_recommendations}
        rows = []
        for pairing in data["gins"]:
            row = existing.get(pairing["gin_id"]) or CocktailGinRecommendation(
                gin_id=pairing["gin_id"]
            )
            row.priority = pairing.get("priority", 1)
            row.pairing_note = pairing.get("pairing_note")
            rows.append(row)
        recipe.gin_recommendations = rows
    if data.get("tonics") is not None:
        recipe.tonic_recommendations = tonic_rows(db, recipe, data["tonics"])


def tonic_rows(
    db: Session, recipe: CocktailRecipe, links: list[dict[str, Any]]
) -> list[CocktailTonicRecommendation]:
    """The recipe's tonics, in the order given (each tonic once)."""
    tonic_ids = [link["tonic_id"] for link in links]
    if len(set(tonic_ids)) != len(tonic_ids):
        raise ApiError(422, "duplicate_pairing", "Each tonic can be added only once.")
    for tonic_id in tonic_ids:
        if db.get(Tonic, tonic_id) is None:
            raise ApiError(404, "not_found", "A chosen tonic doesn't exist.")
    # Reuse the row of a tonic that stays (see the gins above for why).
    existing = {rec.tonic_id: rec for rec in recipe.tonic_recommendations}
    rows = []
    for position, link in enumerate(links):
        row = existing.get(link["tonic_id"]) or CocktailTonicRecommendation(
            tonic_id=link["tonic_id"]
        )
        row.position = position
        row.pairing_note = (link.get("pairing_note") or "").strip() or None
        rows.append(row)
    return rows


def check_can_publish(recipe: CocktailRecipe) -> None:
    problems = []
    if not recipe.ingredients:
        problems.append("Add at least one ingredient.")
    if not recipe.steps:
        problems.append("Add at least one preparation step.")
    cover = recipe.cover
    if cover is not None and not (cover.alt or "").strip() and not cover.decorative:
        problems.append("Give the cover image alt text, or mark it as decorative.")
    if problems:
        raise ApiError(422, "not_publishable", "This recipe can't be published yet.", problems)


# ---------------- Scaling (spec P07) ----------------


def scale(amount: Decimal | None, base: int, servings: int) -> Decimal | None:
    """Multiply a numeric amount for more (or fewer) drinks.

    ``None`` stays ``None``: "top up with tonic" has no number to multiply.
    The result is exact to the cent: Decimal avoids floating-point surprises
    like 0.1 + 0.2 = 0.30000000000000004.
    """
    if amount is None:
        return None
    return (amount * servings / base).quantize(CENT, rounding=ROUND_HALF_UP)


def clamp_servings(servings: int | None, base: int) -> int:
    if servings is None:
        return base
    return max(MIN_SERVINGS, min(MAX_SERVINGS, servings))


def lines(recipe: CocktailRecipe, servings: int | None = None) -> list[IngredientLineOut]:
    target = servings or recipe.servings_base
    return [
        IngredientLineOut(
            name=line.ingredient.name,
            quantity=scale(line.quantity, recipe.servings_base, target),
            unit=line.unit,
            note=line.note,
            optional=line.optional,
        )
        for line in recipe.ingredients
    ]


# ---------------- Output ----------------


def cocktail_out(recipe: CocktailRecipe) -> CocktailOut:
    return CocktailOut(
        id=recipe.id,
        slug=recipe.slug,
        title=recipe.title,
        intro=recipe.intro,
        method=recipe.method,
        glassware=recipe.glassware,
        prep_minutes=recipe.prep_minutes,
        difficulty=recipe.difficulty,
        servings_base=recipe.servings_base,
        garnish=recipe.garnish,
        garnish_quantity=recipe.garnish_quantity,
        tags=recipe.tags or [],
        equipment=recipe.equipment or [],
        status=recipe.status,
        author=Person.model_validate(recipe.author),
        cover_media_id=recipe.cover_media_id,
        cover_image=media_summary(recipe.cover),
        seo_title=recipe.seo_title,
        seo_description=recipe.seo_description,
        ingredients=lines(recipe),
        steps=[step.text for step in recipe.steps],
        gins=[
            PairingOut(
                gin=GinSummary.model_validate(rec.gin),
                gin_public=rec.gin.public_visible,
                priority=rec.priority,
                pairing_note=rec.pairing_note,
            )
            for rec in recipe.gin_recommendations
        ],
        tonics=[
            TonicLinkOut(
                tonic=TonicSummary.model_validate(rec.tonic),
                tonic_public=rec.tonic.public_visible,
                pairing_note=rec.pairing_note,
            )
            for rec in recipe.tonic_recommendations
        ],
        published_at=recipe.published_at,
        version=recipe.version,
        created_at=recipe.created_at,
        updated_at=recipe.updated_at,
    )


def public_card(recipe: CocktailRecipe) -> PublicCocktailCard:
    return PublicCocktailCard(
        slug=recipe.slug,
        title=recipe.title,
        teaser=teaser(recipe),
        method=recipe.method,
        difficulty=recipe.difficulty,
        prep_minutes=recipe.prep_minutes,
        glassware=recipe.glassware,
        tags=recipe.tags or [],
        cover=media_summary(recipe.cover),
    )


def public_cocktail(recipe: CocktailRecipe, servings: int | None) -> PublicCocktail:
    target = clamp_servings(servings, recipe.servings_base)
    return PublicCocktail(
        **public_card(recipe).model_dump(),
        intro=recipe.intro,
        servings=target,
        servings_base=recipe.servings_base,
        ingredients=lines(recipe, target),
        garnish=recipe.garnish,
        garnish_quantity=scale(recipe.garnish_quantity, recipe.servings_base, target),
        equipment=recipe.equipment or [],
        # Steps are text and are never changed by scaling (spec §11).
        steps=[step.text for step in recipe.steps],
        # Only gins the public may see (spec §6: no leaks of private gins).
        recommended_gins=[
            PublicGinPairing(
                slug=rec.gin.slug,
                display_name=rec.gin.display_name,
                country=rec.gin.country,
                abv=rec.gin.abv,
                pairing_note=rec.pairing_note,
            )
            for rec in recipe.gin_recommendations
            if rec.gin.public_visible
        ],
        # Likewise only public tonics.
        recommended_tonics=[
            PublicTonicLink(
                slug=rec.tonic.slug,
                display_name=rec.tonic.display_name,
                style=rec.tonic.style,
                pairing_note=rec.pairing_note,
            )
            for rec in recipe.tonic_recommendations
            if rec.tonic.public_visible
        ],
        seo_title=recipe.seo_title,
        seo_description=recipe.seo_description,
        published_at=recipe.published_at,
        updated_at=recipe.updated_at,
    )


def get_recipe_ids_for_gin(db: Session, gin_id: uuid.UUID) -> list[uuid.UUID]:
    return list(
        db.scalars(
            select(CocktailGinRecommendation.recipe_id)
            .where(CocktailGinRecommendation.gin_id == gin_id)
            .order_by(CocktailGinRecommendation.priority)
        )
    )
