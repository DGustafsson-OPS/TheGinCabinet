"""Database tables, one Python class per table.

Importing them all here means ``from app.models import User`` works, and that
Alembic sees every table when it compares models to the database.
"""

from app.models.audit import AuditEvent
from app.models.auth import AuthSession, LoginAttempt, RecoveryCode
from app.models.blog import (
    POST_CONTENT_FIELDS,
    POST_TRANSITIONS,
    BlogCategory,
    BlogPost,
    BlogPostRelation,
    BlogPostRevision,
    BlogTag,
    PostStatus,
    RelationKind,
    blog_post_tags,
)
from app.models.bottles import ALLOWED_TRANSITIONS, IN_CABINET, Bottle, BottleEvent, BottleStatus
from app.models.catalogue import Botanical, Distillery, GinProduct, GinStyle, gin_botanicals
from app.models.cocktails import (
    CocktailGinRecommendation,
    CocktailRecipe,
    CocktailStatus,
    Difficulty,
    Ingredient,
    Method,
    RecipeIngredient,
    RecipeStep,
    Unit,
)
from app.models.collection import Collection
from app.models.consent import ConsentRecord
from app.models.editorial import (
    FLAVOUR_KEYS,
    REVIEW_CONTENT_FIELDS,
    REVIEW_TRANSITIONS,
    GinImage,
    MediaAsset,
    Review,
    ReviewRevision,
    ReviewStatus,
    Tasting,
)
from app.models.guide import GuidePage
from app.models.purchases import Purchase, PurchaseLine
from app.models.settings import SETTINGS_ID, SiteSettings
from app.models.site_content import ContactMessage, PageText
from app.models.tonics import Tonic, TonicReview, TonicReviewStatus, TonicStyle
from app.models.user import MAX_ACCOUNTS, MAX_ADMINS, User, UserRole
from app.models.wishlist import WishlistItem, WishlistStatus

__all__ = [
    "GuidePage",
    "Tonic",
    "TonicReview",
    "TonicReviewStatus",
    "TonicStyle",
    "ConsentRecord",
    "SETTINGS_ID",
    "SiteSettings",
    "POST_CONTENT_FIELDS",
    "POST_TRANSITIONS",
    "BlogCategory",
    "BlogPost",
    "BlogPostRelation",
    "BlogPostRevision",
    "BlogTag",
    "PostStatus",
    "RelationKind",
    "blog_post_tags",
    "CocktailGinRecommendation",
    "CocktailRecipe",
    "CocktailStatus",
    "Difficulty",
    "Ingredient",
    "Method",
    "RecipeIngredient",
    "RecipeStep",
    "Unit",
    "ALLOWED_TRANSITIONS",
    "FLAVOUR_KEYS",
    "REVIEW_CONTENT_FIELDS",
    "REVIEW_TRANSITIONS",
    "GinImage",
    "MediaAsset",
    "Review",
    "ReviewRevision",
    "ReviewStatus",
    "Tasting",
    "IN_CABINET",
    "AuditEvent",
    "AuthSession",
    "Botanical",
    "Bottle",
    "BottleEvent",
    "BottleStatus",
    "Collection",
    "ContactMessage",
    "Distillery",
    "GinProduct",
    "GinStyle",
    "LoginAttempt",
    "PageText",
    "Purchase",
    "PurchaseLine",
    "RecoveryCode",
    "MAX_ACCOUNTS",
    "MAX_ADMINS",
    "User",
    "UserRole",
    "WishlistItem",
    "WishlistStatus",
    "gin_botanicals",
]
