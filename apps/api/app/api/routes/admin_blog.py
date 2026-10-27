"""Gin Journal editor and publishing (spec §10A: /api/v1/admin/blog, A11–A13)."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_, select

from app.api.deps import CurrentStaff, CurrentStaffWrite, DbSession
from app.errors import ApiError
from app.models import BlogCategory, BlogPost, BlogPostRevision, PostStatus, User
from app.schemas.blog import (
    BulkArchiveIn,
    BulkResult,
    CategoryIn,
    CategoryOut,
    CategoryPatch,
    PostIn,
    PostOut,
    PostPatch,
    PublicPost,
    ScheduleIn,
    VersionOnly,
)
from app.schemas.common import Page, PageParams
from app.schemas.editorial import RevisionOut
from app.services import audit
from app.services.blog import (
    add_revision,
    category_post_counts,
    change_status,
    check_blocks,
    check_media,
    post_out,
    public_post,
    set_relations,
    tags_by_name,
)
from app.services.common import (
    apply_patch,
    contains,
    ensure_slug_free,
    get_or_404,
    slugify,
    unique_slug,
)
from app.services.versioning import check_version

router = APIRouter(prefix="/admin/blog", tags=["admin: journal"])

Force = Annotated[bool, Query(description="Overwrite even if the record changed meanwhile")]


def _record(db, admin, post: BlogPost, action: str, **summary) -> None:
    audit.record(
        db,
        action=f"blog.{action}",
        entity_type="blog_post",
        entity_id=post.id,
        actor_id=admin.user.id,
        summary={"title": post.title, **summary},
    )


# ---------------- Categories (A13) ----------------
# Declared before "/{post_id}" so "categories" isn't mistaken for a post id.


def _category_out(category: BlogCategory, counts: dict) -> CategoryOut:
    out = CategoryOut.model_validate(category, from_attributes=True)
    return out.model_copy(update={"post_count": counts.get(category.id, 0)})


@router.get("/categories", response_model=list[CategoryOut])
def list_categories(admin: CurrentStaff, db: DbSession):
    counts = category_post_counts(db)
    rows = db.scalars(select(BlogCategory).order_by(BlogCategory.display_order, BlogCategory.name))
    return [_category_out(c, counts) for c in rows]


@router.post("/categories", response_model=CategoryOut, status_code=201)
def create_category(body: CategoryIn, admin: CurrentStaffWrite, db: DbSession):
    data = body.model_dump()
    if data["slug"]:
        ensure_slug_free(db, BlogCategory, data["slug"])
    else:
        data["slug"] = unique_slug(db, BlogCategory, slugify(body.name))
    category = BlogCategory(**data)
    db.add(category)
    db.flush()
    audit.record(
        db,
        action="blog_category.create",
        entity_type="blog_category",
        entity_id=category.id,
        actor_id=admin.user.id,
        summary={"name": category.name},
    )
    db.commit()
    db.refresh(category)
    return _category_out(category, {})


@router.patch("/categories/{category_id}", response_model=CategoryOut)
def update_category(
    category_id: uuid.UUID, body: CategoryPatch, admin: CurrentStaffWrite, db: DbSession
):
    category = get_or_404(db, BlogCategory, category_id, "Category")
    changes = body.model_dump(exclude_unset=True)
    check_version(
        current_version=category.version,
        sent_version=changes.pop("version"),
        force=False,
        changes=changes,
        current=_category_out(category, {}),
    )
    if changes.get("slug"):
        ensure_slug_free(db, BlogCategory, changes["slug"], exclude_id=category.id)
    apply_patch(category, changes, never_empty={"name", "slug", "display_order"})
    audit.record(
        db,
        action="blog_category.update",
        entity_type="blog_category",
        entity_id=category.id,
        actor_id=admin.user.id,
        summary={"fields": sorted(changes)},
    )
    db.commit()
    db.refresh(category)
    return _category_out(category, category_post_counts(db))


@router.delete("/categories/{category_id}", status_code=204)
def delete_category(category_id: uuid.UUID, admin: CurrentStaffWrite, db: DbSession):
    """Only empty categories can be deleted, so no article loses its section by accident."""
    category = get_or_404(db, BlogCategory, category_id, "Category")
    used = category_post_counts(db).get(category.id, 0)
    if used:
        raise ApiError(
            409,
            "category_in_use",
            f"{used} article(s) use this category. Move them to another category first.",
        )
    audit.record(
        db,
        action="blog_category.delete",
        entity_type="blog_category",
        entity_id=category.id,
        actor_id=admin.user.id,
        summary={"name": category.name},
    )
    db.delete(category)
    db.commit()


# ---------------- Posts (A11, A12) ----------------


@router.get("", response_model=Page[PostOut])
def list_posts(
    admin: CurrentStaff,
    db: DbSession,
    paging: Annotated[PageParams, Depends()],
    status: PostStatus | None = None,
    category_id: uuid.UUID | None = None,
    author_id: uuid.UUID | None = None,
    search: str | None = None,
):
    query = select(BlogPost)
    if status:
        query = query.where(BlogPost.status == status)
    if category_id:
        query = query.where(BlogPost.category_id == category_id)
    if author_id:
        query = query.where(BlogPost.author_id == author_id)
    if search:
        query = query.where(
            or_(contains(BlogPost.title, search), contains(BlogPost.excerpt, search))
        )
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    rows = db.scalars(
        query.order_by(BlogPost.updated_at.desc()).offset(paging.offset).limit(paging.page_size)
    ).unique()
    return Page[PostOut](items=[post_out(db, p) for p in rows], meta=paging.meta(total))


def _check_links(db, data: dict) -> None:
    if data.get("author_id"):
        get_or_404(db, User, data["author_id"], "Author")
    if data.get("category_id"):
        get_or_404(db, BlogCategory, data["category_id"], "Category")
    for field in ("hero_media_id", "social_media_id"):
        if data.get(field):
            check_media(db, data[field])
    if data.get("body_blocks"):
        check_blocks(db, data["body_blocks"])


@router.post("", response_model=PostOut, status_code=201)
def create_post(body: PostIn, admin: CurrentStaffWrite, db: DbSession):
    """A new article always starts as a draft."""
    data = body.model_dump(mode="json")  # "json" mode: blocks become plain JSON
    data.update({k: getattr(body, k) for k in ("category_id", "author_id")})
    data["hero_media_id"], data["social_media_id"] = body.hero_media_id, body.social_media_id
    _check_links(db, data)
    tags, relations = data.pop("tags"), body.relations
    data.pop("relations")
    data["author_id"] = body.author_id or admin.user.id
    if data["slug"]:
        ensure_slug_free(db, BlogPost, data["slug"])
    else:
        data["slug"] = unique_slug(db, BlogPost, slugify(body.title))
    post = BlogPost(**data, status=PostStatus.DRAFT, edited_by_id=admin.user.id)
    post.tags = tags_by_name(db, tags)
    db.add(post)
    set_relations(db, post, [r.model_dump() for r in relations])
    add_revision(db, post, admin.user.id, "Created")
    _record(db, admin, post, "create")
    db.commit()
    db.refresh(post)
    return post_out(db, post)


@router.get("/{post_id}", response_model=PostOut)
def get_post(post_id: uuid.UUID, admin: CurrentStaff, db: DbSession):
    return post_out(db, get_or_404(db, BlogPost, post_id, "Article"))


@router.get("/{post_id}/preview", response_model=PublicPost)
def preview_post(post_id: uuid.UUID, admin: CurrentStaff, db: DbSession):
    """The article exactly as the public page will show it, for any status.

    Previews need a signed-in admin (spec §10A "draft preview uses an
    authenticated session").
    """
    return public_post(db, get_or_404(db, BlogPost, post_id, "Article"))


@router.patch("/{post_id}", response_model=PostOut)
def update_post(
    post_id: uuid.UUID,
    body: PostPatch,
    admin: CurrentStaffWrite,
    db: DbSession,
    force: Force = False,
):
    post = get_or_404(db, BlogPost, post_id, "Article")
    autosave = body.autosave
    changes = body.model_dump(exclude_unset=True, mode="json")
    changes.pop("autosave", None)
    for key in ("category_id", "author_id", "hero_media_id", "social_media_id"):
        if key in changes:
            changes[key] = getattr(body, key)
    sent_version = changes.pop("version")
    if autosave and post.status != PostStatus.DRAFT:
        raise ApiError(
            409,
            "autosave_not_draft",
            "Autosave only works on drafts. Save this article yourself to change what is live.",
        )
    check_version(
        current_version=post.version,
        sent_version=sent_version,
        force=force and not autosave,  # an autosave never overwrites someone else's save
        changes=changes,
        current=post_out(db, post),
    )
    _check_links(db, changes)
    if changes.get("slug"):
        ensure_slug_free(db, BlogPost, changes["slug"], exclude_id=post.id)
    if "tags" in changes:
        post.tags = tags_by_name(db, changes.pop("tags") or [])
    if "relations" in changes:
        changes.pop("relations")
        set_relations(db, post, [r.model_dump() for r in body.relations or []])
    apply_patch(
        post, changes, never_empty={"title", "slug", "author_id", "body_blocks", "featured"}
    )
    post.edited_by_id = admin.user.id
    db.flush()
    db.refresh(post)
    note = "Autosaved" if autosave else "Edited" + (" (overwrote a newer save)" if force else "")
    add_revision(db, post, admin.user.id, note)
    _record(db, admin, post, "update", fields=sorted(changes), forced=force, autosave=autosave)
    db.commit()
    db.refresh(post)
    return post_out(db, post)


def _transition(post_id, version, new, admin, db, scheduled_at=None) -> PostOut:
    post = get_or_404(db, BlogPost, post_id, "Article")
    check_version(
        current_version=post.version,
        sent_version=version,
        force=False,
        changes={},
        current=post_out(db, post),
    )
    old = post.status
    change_status(db, post, new, admin.user.id, scheduled_at=scheduled_at)
    post.edited_by_id = admin.user.id
    extra = {"scheduled_at": scheduled_at.isoformat()} if scheduled_at else {}
    _record(db, admin, post, str(new), **{"from": old, "to": str(new), **extra})
    db.commit()
    db.refresh(post)
    return post_out(db, post)


@router.post("/{post_id}/publish", response_model=PostOut)
def publish_post(post_id: uuid.UUID, body: VersionOnly, admin: CurrentStaffWrite, db: DbSession):
    return _transition(post_id, body.version, PostStatus.PUBLISHED, admin, db)


@router.post("/{post_id}/schedule", response_model=PostOut)
def schedule_post(post_id: uuid.UUID, body: ScheduleIn, admin: CurrentStaffWrite, db: DbSession):
    """Publish automatically at ``scheduled_at`` (the job checks every minute)."""
    return _transition(post_id, body.version, PostStatus.SCHEDULED, admin, db, body.scheduled_at)


@router.post("/{post_id}/unpublish", response_model=PostOut)
def unpublish_post(post_id: uuid.UUID, body: VersionOnly, admin: CurrentStaffWrite, db: DbSession):
    """Back to draft: takes a published article offline, cancels a schedule, or restores."""
    return _transition(post_id, body.version, PostStatus.DRAFT, admin, db)


@router.post("/{post_id}/archive", response_model=PostOut)
def archive_post(post_id: uuid.UUID, body: VersionOnly, admin: CurrentStaffWrite, db: DbSession):
    return _transition(post_id, body.version, PostStatus.ARCHIVED, admin, db)


@router.post("/bulk-archive", response_model=BulkResult)
def bulk_archive(body: BulkArchiveIn, admin: CurrentStaffWrite, db: DbSession):
    """Archive several articles (the UI asks for confirmation first, spec A11).

    Each item carries the version the admin saw; anything that changed since
    is skipped and reported rather than archived blindly.
    """
    archived, skipped = 0, []
    for item in body.items:
        post = get_or_404(db, BlogPost, item.id, "Article")
        if post.status == PostStatus.ARCHIVED:
            continue
        if post.version != item.version:
            skipped.append(post.title)
            continue
        old = post.status
        change_status(db, post, PostStatus.ARCHIVED, admin.user.id)
        post.edited_by_id = admin.user.id
        _record(db, admin, post, "archived", **{"from": old, "to": "archived", "bulk": True})
        archived += 1
    db.commit()
    return BulkResult(archived=archived, skipped=skipped)


@router.post("/{post_id}/duplicate", response_model=PostOut, status_code=201)
def duplicate_post(post_id: uuid.UUID, admin: CurrentStaffWrite, db: DbSession):
    """Copy an article into a new draft (spec A11 "duplicate")."""
    source = get_or_404(db, BlogPost, post_id, "Article")
    title = f"Copy of {source.title}"[:200]
    copy = BlogPost(
        title=title,
        slug=unique_slug(db, BlogPost, slugify(title)),
        excerpt=source.excerpt,
        body_blocks=list(source.body_blocks or []),
        category_id=source.category_id,
        author_id=admin.user.id,
        edited_by_id=admin.user.id,
        hero_media_id=source.hero_media_id,
        hero_credit=source.hero_credit,
        social_media_id=source.social_media_id,
        seo_title=source.seo_title,
        seo_description=source.seo_description,
        status=PostStatus.DRAFT,
    )
    copy.tags = list(source.tags)
    db.add(copy)
    set_relations(db, copy, [{"kind": r.entity_kind, "id": r.entity_id} for r in source.relations])
    add_revision(db, copy, admin.user.id, f"Duplicated from {source.title}")
    _record(db, admin, copy, "duplicate", source=str(source.id))
    db.commit()
    db.refresh(copy)
    return post_out(db, copy)


@router.get("/{post_id}/revisions", response_model=list[RevisionOut])
def list_revisions(post_id: uuid.UUID, admin: CurrentStaff, db: DbSession):
    get_or_404(db, BlogPost, post_id, "Article")
    revisions = db.scalars(
        select(BlogPostRevision)
        .where(BlogPostRevision.post_id == post_id)
        .order_by(BlogPostRevision.revision_number.desc())
    ).all()
    return [
        RevisionOut(
            id=r.id,
            revision_number=r.revision_number,
            actor_id=r.actor_id,
            status=r.status,
            note=r.note,
            saved_at=r.saved_at,
            snapshot=r.snapshot,
        )
        for r in revisions
    ]
