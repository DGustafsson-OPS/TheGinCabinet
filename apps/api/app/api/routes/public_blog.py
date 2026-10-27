"""The public Gin Journal (spec §10A: /api/v1/public/blog, B01–B03).

Only articles that are published *and* whose publication time has passed are
visible; anything else is a plain 404 (spec §10A "Public queries require
status=published and published_at <= current UTC time").
"""

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import func, or_, select

from app.api.deps import DbSession
from app.errors import ApiError
from app.models import BlogCategory, BlogPost, BlogTag, blog_post_tags
from app.schemas.blog import PublicCategory, PublicPost, PublicPostCard, PublicTag
from app.schemas.common import Page, PageParams
from app.services.blog import category_post_counts, post_card, public_post, visible_posts
from app.services.common import contains

router = APIRouter(prefix="/public/blog", tags=["public: journal"])


@router.get("", response_model=Page[PublicPostCard])
def list_public_posts(
    db: DbSession,
    paging: Annotated[PageParams, Depends()],
    search: str | None = None,
    category: str | None = None,  # a category slug
    tag: str | None = None,  # a tag slug
    featured: bool | None = None,
):
    query = visible_posts()
    if search:
        query = query.where(
            or_(contains(BlogPost.title, search), contains(BlogPost.excerpt, search))
        )
    if category:
        query = query.join(BlogPost.category).where(BlogCategory.slug == category)
    if tag:
        query = query.where(
            BlogPost.id.in_(
                select(blog_post_tags.c.post_id)
                .join(BlogTag, BlogTag.id == blog_post_tags.c.tag_id)
                .where(BlogTag.slug == tag)
            )
        )
    if featured is not None:
        query = query.where(BlogPost.featured.is_(featured))
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    rows = db.scalars(
        query.order_by(BlogPost.published_at.desc()).offset(paging.offset).limit(paging.page_size)
    ).unique()
    return Page[PublicPostCard](items=[post_card(p) for p in rows], meta=paging.meta(total))


@router.get("/categories", response_model=list[PublicCategory])
def list_public_categories(db: DbSession):
    """All categories, with how many public articles each has (empty ones too, for chips)."""
    counts = category_post_counts(db, only_visible=True)
    rows = db.scalars(select(BlogCategory).order_by(BlogCategory.display_order, BlogCategory.name))
    return [
        PublicCategory(
            name=c.name, slug=c.slug, description=c.description, post_count=counts.get(c.id, 0)
        )
        for c in rows
    ]


@router.get("/tags/{slug}", response_model=PublicTag)
def get_public_tag(slug: str, db: DbSession):
    tag = db.scalar(select(BlogTag).where(BlogTag.slug == slug))
    if tag is None:
        raise ApiError(404, "not_found", "Tag not found.")
    visible_ids = visible_posts().with_only_columns(BlogPost.id)
    count = db.scalar(
        select(func.count())
        .select_from(blog_post_tags)
        .where(blog_post_tags.c.tag_id == tag.id, blog_post_tags.c.post_id.in_(visible_ids))
    )
    if not count:
        # A tag used only by drafts would reveal what is being written.
        raise ApiError(404, "not_found", "Tag not found.")
    return PublicTag(name=tag.name, slug=tag.slug, post_count=count)


@router.get("/{slug}", response_model=PublicPost)
def get_public_post(slug: str, db: DbSession):
    post = db.scalar(visible_posts().where(BlogPost.slug == slug))
    if post is None:
        raise ApiError(404, "not_found", "Article not found.")
    return public_post(db, post)
