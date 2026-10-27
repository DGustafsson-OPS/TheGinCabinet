"""Cocktail recipes (spec §5 A07, §7 cocktail_recipes / ingredients / recommendations).

* ``Ingredient``: a reusable ingredient ("Tonic water", "Lime juice").
* ``CocktailRecipe``: the recipe itself, with a publishing status.
* ``RecipeIngredient``: one ordered line: 50 ml gin, 2 dashes bitters...
* ``RecipeStep``: one ordered preparation step.
* ``CocktailGinRecommendation``: "best with this gin, because ...".
"""

import uuid
from datetime import datetime
from decimal import Decimal
from enum import StrEnum

from sqlalchemy import (
    CheckConstraint,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models._mixins import Versioned
from app.models._types import JSONType, UTCDateTime, UUIDType, new_uuid
from app.models.catalogue import GinProduct
from app.models.editorial import MediaAsset
from app.models.user import User


class Unit(StrEnum):
    """Allowed units (spec §7: "Normalize ingredient units"). Metric only (spec §12)."""

    ML = "ml"
    CL = "cl"
    G = "g"
    TSP = "tsp"
    TBSP = "tbsp"
    BARSPOON = "barspoon"
    DASH = "dash"
    DROP = "drop"
    PIECE = "piece"
    SLICE = "slice"
    WEDGE = "wedge"
    SPRIG = "sprig"
    LEAF = "leaf"
    TOP_UP = "top up"  # "top up with tonic": has no amount


class Method(StrEnum):
    BUILD = "build"
    SHAKE = "shake"
    STIR = "stir"
    BLEND = "blend"


class Difficulty(StrEnum):
    EASY = "easy"
    MEDIUM = "medium"
    ADVANCED = "advanced"


class CocktailStatus(StrEnum):
    DRAFT = "draft"
    PUBLISHED = "published"
    ARCHIVED = "archived"


class Ingredient(Base):
    __tablename__ = "ingredients"

    id: Mapped[uuid.UUID] = mapped_column(UUIDType, primary_key=True, default=new_uuid)
    name: Mapped[str] = mapped_column(String(120))
    # Lower-case copy of the name, so "Lime Juice" and "lime juice" are one ingredient.
    name_key: Mapped[str] = mapped_column(String(120), unique=True)
    category: Mapped[str | None] = mapped_column(String(60), nullable=True)  # "citrus", "mixer"…


class CocktailRecipe(Versioned, Base):
    __tablename__ = "cocktail_recipes"
    __table_args__ = (
        CheckConstraint("status IN ('draft', 'published', 'archived')", name="status_valid"),
        CheckConstraint("servings_base >= 1", name="servings_positive"),
        CheckConstraint("prep_minutes IS NULL OR prep_minutes >= 0", name="prep_not_negative"),
        Index("ix_cocktail_recipes_status_published_at", "status", "published_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUIDType, primary_key=True, default=new_uuid)
    slug: Mapped[str] = mapped_column(String(160), unique=True)
    title: Mapped[str] = mapped_column(String(160))
    intro: Mapped[str | None] = mapped_column(Text, nullable=True)
    method: Mapped[str] = mapped_column(String(16), default=Method.BUILD)
    glassware: Mapped[str | None] = mapped_column(String(80), nullable=True)
    prep_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    difficulty: Mapped[str] = mapped_column(String(16), default=Difficulty.EASY)
    # The recipe is written for this many drinks; scaling starts from here.
    servings_base: Mapped[int] = mapped_column(Integer, default=1)
    # Garnish: a number scales (2 lime wheels → 4), the text stays as written.
    garnish: Mapped[str | None] = mapped_column(String(160), nullable=True)
    garnish_quantity: Mapped[Decimal | None] = mapped_column(Numeric(6, 2), nullable=True)
    # Free labels for filtering, e.g. ["refreshing", "citrus", "summer"].
    tags: Mapped[list[str]] = mapped_column(JSONType, default=list)
    status: Mapped[str] = mapped_column(String(16), default=CocktailStatus.DRAFT)
    cover_media_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("media_assets.id", ondelete="SET NULL"), nullable=True, index=True
    )
    author_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    seo_title: Mapped[str | None] = mapped_column(String(70), nullable=True)
    seo_description: Mapped[str | None] = mapped_column(String(170), nullable=True)
    published_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)

    author: Mapped[User] = relationship(lazy="joined")
    cover: Mapped[MediaAsset | None] = relationship(lazy="joined")
    ingredients: Mapped[list["RecipeIngredient"]] = relationship(
        back_populates="recipe",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="RecipeIngredient.position",
    )
    steps: Mapped[list["RecipeStep"]] = relationship(
        back_populates="recipe",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="RecipeStep.position",
    )
    gin_recommendations: Mapped[list["CocktailGinRecommendation"]] = relationship(
        back_populates="recipe",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="CocktailGinRecommendation.priority",
    )


class RecipeIngredient(Base):
    __tablename__ = "recipe_ingredients"
    __table_args__ = (
        CheckConstraint("quantity IS NULL OR quantity > 0", name="quantity_positive"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUIDType, primary_key=True, default=new_uuid)
    recipe_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("cocktail_recipes.id", ondelete="CASCADE"), index=True
    )
    ingredient_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("ingredients.id", ondelete="RESTRICT"), index=True
    )
    position: Mapped[int] = mapped_column(Integer, default=0)
    # A precise number (spec §7: "recipe ingredient quantity decimal"). Empty
    # for amounts like "top up" that can't be multiplied.
    quantity: Mapped[Decimal | None] = mapped_column(Numeric(8, 2), nullable=True)
    unit: Mapped[str] = mapped_column(String(16))
    note: Mapped[str | None] = mapped_column(String(160), nullable=True)  # "freshly squeezed"
    optional: Mapped[bool] = mapped_column(default=False)

    recipe: Mapped[CocktailRecipe] = relationship(back_populates="ingredients")
    ingredient: Mapped[Ingredient] = relationship(lazy="joined")


class RecipeStep(Base):
    __tablename__ = "recipe_steps"

    id: Mapped[uuid.UUID] = mapped_column(UUIDType, primary_key=True, default=new_uuid)
    recipe_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("cocktail_recipes.id", ondelete="CASCADE"), index=True
    )
    position: Mapped[int] = mapped_column(Integer, default=0)
    text: Mapped[str] = mapped_column(Text)

    recipe: Mapped[CocktailRecipe] = relationship(back_populates="steps")


class CocktailGinRecommendation(Base):
    __tablename__ = "cocktail_gin_recommendations"
    # Spec §7: "unique composite pair": a gin is recommended once per recipe.
    __table_args__ = (UniqueConstraint("recipe_id", "gin_id", name="uq_cocktail_gin_pair"),)

    id: Mapped[uuid.UUID] = mapped_column(UUIDType, primary_key=True, default=new_uuid)
    recipe_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("cocktail_recipes.id", ondelete="CASCADE"), index=True
    )
    gin_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("gin_products.id", ondelete="CASCADE"), index=True
    )
    priority: Mapped[int] = mapped_column(Integer, default=1)  # 1 = best match
    pairing_note: Mapped[str | None] = mapped_column(String(300), nullable=True)

    recipe: Mapped[CocktailRecipe] = relationship(back_populates="gin_recommendations")
    gin: Mapped[GinProduct] = relationship(lazy="joined")
