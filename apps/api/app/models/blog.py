"""The Gin Journal: blog posts, categories, tags and revisions (spec §10A).

* ``BlogCategory``: an editable section such as "Distillery Visits".
* ``BlogTag``: a free keyword; created automatically when first used.
* ``BlogPost``: one article. Its text is a list of *blocks* (see below).
* ``BlogPostRevision``: an unchangeable snapshot saved on every change.
* ``BlogPostRelation``: "this article is about that gin/review/cocktail/post".

The article body is stored as JSON blocks, for example::

    [{"type": "heading", "level": 2, "text": "Arriving in Kyoto"},
     {"type": "paragraph", "text": "We met the [distiller](https://…) at dawn."},
     {"type": "image", "media_id": "…", "caption": "The copper still"},
     {"type": "card", "kind": "gin", "id": "…"}]

Blocks are data, never HTML, so the website can't be tricked into running a
script hidden in an article (spec §10A "sanitize rich text").
"""

import uuid
from datetime import datetime
from enum import StrEnum
from typing import Any

from sqlalchemy import (
    CheckConstraint,
    Column,
    ForeignKey,
    Index,
    Integer,
    String,
    Table,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models._mixins import Versioned
from app.models._types import JSONType, UTCDateTime, UUIDType, new_uuid, utcnow
from app.models.editorial import MediaAsset
from app.models.user import User


class BlogCategory(Versioned, Base):
    __tablename__ = "blog_categories"

    id: Mapped[uuid.UUID] = mapped_column(UUIDType, primary_key=True, default=new_uuid)
    name: Mapped[str] = mapped_column(String(80))
    slug: Mapped[str] = mapped_column(String(100), unique=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    display_order: Mapped[int] = mapped_column(Integer, default=0)


class BlogTag(Base):
    __tablename__ = "blog_tags"

    id: Mapped[uuid.UUID] = mapped_column(UUIDType, primary_key=True, default=new_uuid)
    name: Mapped[str] = mapped_column(String(60))
    slug: Mapped[str] = mapped_column(String(80), unique=True)


# A plain "join table" (no class of its own): which tags each post has.
blog_post_tags = Table(
    "blog_post_tags",
    Base.metadata,
    Column("post_id", ForeignKey("blog_posts.id", ondelete="CASCADE"), primary_key=True),
    Column("tag_id", ForeignKey("blog_tags.id", ondelete="CASCADE"), primary_key=True),
)


class PostStatus(StrEnum):
    DRAFT = "draft"
    SCHEDULED = "scheduled"  # will publish itself at scheduled_at
    PUBLISHED = "published"
    ARCHIVED = "archived"


# Spec A13: "draft -> scheduled or published -> archived (with published ->
# draft/unpublish supported)". A scheduled post can also be taken back to draft.
POST_TRANSITIONS: dict[PostStatus, set[PostStatus]] = {
    PostStatus.DRAFT: {PostStatus.SCHEDULED, PostStatus.PUBLISHED, PostStatus.ARCHIVED},
    PostStatus.SCHEDULED: {PostStatus.DRAFT, PostStatus.PUBLISHED, PostStatus.ARCHIVED},
    PostStatus.PUBLISHED: {PostStatus.DRAFT, PostStatus.ARCHIVED},
    PostStatus.ARCHIVED: {PostStatus.DRAFT},
}

# The fields copied into every revision snapshot.
POST_CONTENT_FIELDS = (
    "title",
    "slug",
    "excerpt",
    "body_blocks",
    "category_id",
    "author_id",
    "hero_media_id",
    "hero_credit",
    "social_media_id",
    "featured",
    "seo_title",
    "seo_description",
    "scheduled_at",
)


class RelationKind(StrEnum):
    GIN = "gin"
    REVIEW = "review"
    COCKTAIL = "cocktail"
    POST = "post"


class BlogPost(Versioned, Base):
    __tablename__ = "blog_posts"
    __table_args__ = (
        CheckConstraint(
            "status IN ('draft', 'scheduled', 'published', 'archived')", name="status_valid"
        ),
        # Spec §10A: "Indexes on status + publication timestamp, slug and category".
        Index("ix_blog_posts_status_published_at", "status", "published_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUIDType, primary_key=True, default=new_uuid)
    slug: Mapped[str] = mapped_column(String(160), unique=True)
    title: Mapped[str] = mapped_column(String(200))
    excerpt: Mapped[str | None] = mapped_column(Text, nullable=True)  # the "standfirst"
    body_blocks: Mapped[list[dict[str, Any]]] = mapped_column(JSONType, default=list)
    status: Mapped[str] = mapped_column(String(16), default=PostStatus.DRAFT)
    author_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    # The admin who saved last (spec A11 "last editor").
    edited_by_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    category_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("blog_categories.id", ondelete="SET NULL"), nullable=True, index=True
    )
    hero_media_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("media_assets.id", ondelete="SET NULL"), nullable=True, index=True
    )
    hero_credit: Mapped[str | None] = mapped_column(String(200), nullable=True)
    # The picture shown when the article is shared on social media (Open Graph).
    social_media_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("media_assets.id", ondelete="SET NULL"), nullable=True
    )
    featured: Mapped[bool] = mapped_column(default=False)
    seo_title: Mapped[str | None] = mapped_column(String(70), nullable=True)
    seo_description: Mapped[str | None] = mapped_column(String(170), nullable=True)
    published_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    scheduled_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)

    author: Mapped[User] = relationship(foreign_keys=[author_id], lazy="joined")
    edited_by: Mapped[User | None] = relationship(foreign_keys=[edited_by_id], lazy="joined")
    category: Mapped[BlogCategory | None] = relationship(lazy="joined")
    hero: Mapped[MediaAsset | None] = relationship(foreign_keys=[hero_media_id], lazy="joined")
    social: Mapped[MediaAsset | None] = relationship(foreign_keys=[social_media_id])
    tags: Mapped[list[BlogTag]] = relationship(
        secondary=blog_post_tags, lazy="selectin", order_by=BlogTag.name
    )
    relations: Mapped[list["BlogPostRelation"]] = relationship(
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="BlogPostRelation.position",
    )


class BlogPostRelation(Base):
    """A link from a post to a gin, review, cocktail or another post.

    ``entity_id`` deliberately has no foreign key: it can point into four
    different tables. The code checks the id exists when the post is saved,
    and the public site simply skips links whose target is gone or private.
    """

    __tablename__ = "blog_post_relations"
    __table_args__ = (
        UniqueConstraint("post_id", "entity_kind", "entity_id", name="uq_blog_relation"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUIDType, primary_key=True, default=new_uuid)
    post_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("blog_posts.id", ondelete="CASCADE"), index=True
    )
    entity_kind: Mapped[str] = mapped_column(String(16))
    entity_id: Mapped[uuid.UUID] = mapped_column(UUIDType, index=True)
    position: Mapped[int] = mapped_column(Integer, default=0)


class BlogPostRevision(Base):
    """An unchangeable snapshot of a post (spec §10A ``blog_post_revisions``)."""

    __tablename__ = "blog_post_revisions"
    __table_args__ = (UniqueConstraint("post_id", "revision_number", name="uq_blog_revision"),)

    id: Mapped[uuid.UUID] = mapped_column(UUIDType, primary_key=True, default=new_uuid)
    post_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("blog_posts.id", ondelete="CASCADE"), index=True
    )
    revision_number: Mapped[int] = mapped_column(Integer)
    actor_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    status: Mapped[str] = mapped_column(String(16))
    note: Mapped[str | None] = mapped_column(String(200), nullable=True)
    saved_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    snapshot: Mapped[dict[str, Any]] = mapped_column(JSONType)
