"""Rules for the Gin Journal (spec §10A): blocks, references, publishing, schedules.

The most important rule lives in ``visible_posts``: the public may see a post
only when its status is "published" *and* its publication time has passed.
"""

import logging
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session
from sqlalchemy.orm.exc import StaleDataError

from app.errors import ApiError
from app.models import (
    POST_CONTENT_FIELDS,
    POST_TRANSITIONS,
    BlogCategory,
    BlogPost,
    BlogPostRelation,
    BlogPostRevision,
    BlogTag,
    CocktailRecipe,
    CocktailStatus,
    GinProduct,
    MediaAsset,
    PostStatus,
    RelationKind,
    Review,
    ReviewStatus,
)
from app.models._types import as_utc, utcnow
from app.schemas.blog import (
    CategoryRef,
    PostOut,
    PublicCategoryRef,
    PublicPost,
    PublicPostCard,
    PublicTagRef,
    RelationOut,
)
from app.schemas.editorial import Person
from app.services import audit
from app.services import cocktails as cocktail_service
from app.services import editorial as review_service
from app.services.common import slugify
from app.services.editorial import media_summary
from app.services.public_catalogue import cards as gin_cards
from app.services.public_catalogue import public_gins

log = logging.getLogger(__name__)

WORDS_PER_MINUTE = 200
RELATED_COUNT = 3

# ---------------- What the public may see ----------------


def visible_posts(now: datetime | None = None):
    """The single definition of "a post the public may read" (spec §10A)."""
    return select(BlogPost).where(
        BlogPost.status == PostStatus.PUBLISHED, BlogPost.published_at <= (now or utcnow())
    )


def is_live(post: BlogPost) -> bool:
    return (
        post.status == PostStatus.PUBLISHED
        and post.published_at is not None
        and as_utc(post.published_at) <= utcnow()
    )


def _visible_reviews():
    return (
        select(Review)
        .join(Review.gin)
        .where(Review.status == ReviewStatus.PUBLISHED, GinProduct.public_visible.is_(True))
    )


def _visible_cocktails():
    return select(CocktailRecipe).where(CocktailRecipe.status == CocktailStatus.PUBLISHED)


# ---------------- Tags, media and references ----------------


def tags_by_name(db: Session, names: list[str]) -> list[BlogTag]:
    """Tag rows for these names, creating new ones; "Gin & Tonic" and "gin-tonic" are one tag."""
    by_slug: dict[str, str] = {}
    for name in names:
        clean = " ".join(name.split())
        if clean:
            by_slug.setdefault(slugify(clean), clean)
    if not by_slug:
        return []
    existing = {t.slug: t for t in db.scalars(select(BlogTag).where(BlogTag.slug.in_(by_slug)))}
    result = []
    for slug, name in by_slug.items():
        if slug not in existing:
            existing[slug] = BlogTag(name=name, slug=slug)
            db.add(existing[slug])
        result.append(existing[slug])
    return result


def check_media(db: Session, media_id: uuid.UUID | None) -> None:
    review_service.check_cover(db, media_id)


_TABLES = {
    RelationKind.GIN: GinProduct,
    RelationKind.REVIEW: Review,
    RelationKind.COCKTAIL: CocktailRecipe,
    RelationKind.POST: BlogPost,
}


def check_references(db: Session, refs: list[tuple[str, uuid.UUID]]) -> None:
    """Every referenced gin/review/cocktail/post must exist (spec A12 "by reference ID")."""
    missing = []
    for kind, entity_id in refs:
        if db.get(_TABLES[RelationKind(kind)], entity_id) is None:
            missing.append(f"{kind} {entity_id}")
    if missing:
        raise ApiError(
            422, "unknown_reference", "Some linked items don't exist.", {"missing": missing}
        )


def check_blocks(db: Session, blocks: list[dict[str, Any]]) -> None:
    for block in blocks:
        if block["type"] == "image":
            check_media(db, uuid.UUID(str(block["media_id"])))
    check_references(
        db,
        [(b["kind"], uuid.UUID(str(b["id"]))) for b in blocks if b["type"] == "card"],
    )


def set_relations(db: Session, post: BlogPost, relations: list[dict[str, Any]]) -> None:
    """Replace the post's related items, reusing existing rows.

    Reusing matters: SQLAlchemy inserts new rows *before* deleting removed
    ones, so re-adding the same gin as a new row would break the "each item
    once per post" rule for a moment and fail.
    """
    wanted: list[tuple[str, uuid.UUID]] = []
    for rel in relations:
        key = (str(rel["kind"]), rel["id"])
        if key not in wanted:
            wanted.append(key)
    check_references(db, wanted)
    current = {(r.entity_kind, r.entity_id): r for r in post.relations}
    rows = []
    for position, key in enumerate(wanted):
        row = current.get(key) or BlogPostRelation(entity_kind=key[0], entity_id=key[1])
        row.position = position
        rows.append(row)
    post.relations = rows


def reading_minutes(post: BlogPost) -> int:
    words = len((post.excerpt or "").split())
    for block in post.body_blocks or []:
        for text in [block.get("text"), block.get("caption"), *(block.get("items") or [])]:
            if text:
                words += len(str(text).split())
    return max(1, round(words / WORDS_PER_MINUTE))


# ---------------- Revisions and publishing ----------------


def snapshot(post: BlogPost) -> dict[str, Any]:
    data: dict[str, Any] = {}
    for field in POST_CONTENT_FIELDS:
        value = getattr(post, field)
        if isinstance(value, uuid.UUID):
            value = str(value)
        elif isinstance(value, datetime):
            value = value.isoformat()
        data[field] = value
    data["tags"] = [t.name for t in post.tags]
    data["relations"] = [{"kind": r.entity_kind, "id": str(r.entity_id)} for r in post.relations]
    data["status"] = post.status
    return data


def add_revision(db: Session, post: BlogPost, actor_id: uuid.UUID | None, note: str) -> None:
    """Save an unchangeable copy of the post as it is now (spec A13)."""
    db.flush()
    last = db.scalar(
        select(func.max(BlogPostRevision.revision_number)).where(
            BlogPostRevision.post_id == post.id
        )
    )
    db.add(
        BlogPostRevision(
            post_id=post.id,
            revision_number=(last or 0) + 1,
            actor_id=actor_id,
            status=post.status,
            note=note,
            snapshot=snapshot(post),
        )
    )


def publish_problems(db: Session, post: BlogPost) -> list[str]:
    """What must be fixed before a post can go public (spec §10A)."""
    problems = []
    if not post.body_blocks:
        problems.append("Write the article: the body is empty.")
    if not (post.excerpt or "").strip():
        problems.append("Write a summary (it is shown on the article cards).")

    def needs_alt(asset: MediaAsset | None) -> bool:
        return asset is not None and not (asset.alt or "").strip() and not asset.decorative

    if needs_alt(post.hero):
        problems.append("Give the featured image alt text, or mark it as decorative.")
    for block in post.body_blocks or []:
        if block["type"] == "image":
            asset = db.get(MediaAsset, uuid.UUID(str(block["media_id"])))
            if asset is None or asset.deleted_at is not None:
                problems.append("An image in the article was deleted from the media library.")
            elif needs_alt(asset):
                name = asset.original_filename or "an image"
                problems.append(f"Give {name} alt text, or mark it as decorative.")
    return problems


def change_status(
    db: Session,
    post: BlogPost,
    new: PostStatus,
    actor_id: uuid.UUID | None,
    scheduled_at: datetime | None = None,
    note: str | None = None,
) -> None:
    old = PostStatus(post.status)
    if new == old and new != PostStatus.SCHEDULED:
        return
    if new != old and new not in POST_TRANSITIONS[old]:
        raise ApiError(
            422,
            "invalid_transition",
            f"A {old} article can't move straight to {new}.",
            details={"allowed": sorted(POST_TRANSITIONS[old])},
        )
    if new in (PostStatus.PUBLISHED, PostStatus.SCHEDULED):
        problems = publish_problems(db, post)
        if problems:
            raise ApiError(422, "not_publishable", "This article can't go public yet.", problems)
    if new == PostStatus.SCHEDULED:
        if scheduled_at is None or scheduled_at <= utcnow():
            raise ApiError(422, "schedule_in_past", "Choose a publication time in the future.")
        post.scheduled_at = scheduled_at
    elif new == PostStatus.PUBLISHED:
        # Keep the first publication date if it is re-published after a pause.
        post.published_at = post.published_at or utcnow()
        post.scheduled_at = None
    else:
        post.scheduled_at = None
    post.status = new
    post.updated_at = utcnow()
    default_notes = {
        PostStatus.SCHEDULED: f"Scheduled for {scheduled_at.isoformat() if scheduled_at else ''}",
        PostStatus.PUBLISHED: "Published",
        PostStatus.ARCHIVED: "Archived",
        PostStatus.DRAFT: "Unpublished" if old == PostStatus.PUBLISHED else "Back to draft",
    }
    add_revision(db, post, actor_id, note or default_notes[new])


def publish_due(db: Session, now: datetime | None = None) -> int:
    """Publish every scheduled post whose time has come (spec A13).

    *Idempotent*: running it twice, or on two servers at once, publishes each
    post once. Each post is its own transaction, and the optimistic ``version``
    check means that if two runs race, the second one's UPDATE matches no row
    and is rolled back instead of publishing twice.

    A post that can no longer be published (say, its image lost its alt text)
    goes back to draft, with the reason in its revision history and the audit
    log, instead of silently staying "scheduled" forever.
    """
    now = now or utcnow()
    due_ids = db.scalars(
        select(BlogPost.id).where(
            BlogPost.status == PostStatus.SCHEDULED, BlogPost.scheduled_at <= now
        )
    ).all()
    published = 0
    for post_id in due_ids:
        post = db.get(BlogPost, post_id)
        if post is None or post.status != PostStatus.SCHEDULED:
            continue
        problems = publish_problems(db, post)
        try:
            if problems:
                post.status = PostStatus.DRAFT
                post.scheduled_at = None
                post.updated_at = utcnow()
                add_revision(db, post, None, "Scheduled publication failed: " + problems[0])
                action = "blog.schedule_failed"
            else:
                post.status = PostStatus.PUBLISHED
                # The article's date is the planned time, not when the job ran.
                post.published_at = post.published_at or post.scheduled_at
                post.scheduled_at = None
                post.updated_at = utcnow()
                add_revision(db, post, None, "Published on schedule")
                action = "blog.publish_scheduled"
            audit.record(
                db,
                action=action,
                entity_type="blog_post",
                entity_id=post.id,
                summary={"title": post.title, "problems": problems},
            )
            db.commit()
            published += 0 if problems else 1
        except StaleDataError:
            db.rollback()  # someone else changed it at the same moment: skip
            log.info("Scheduled post %s changed meanwhile; skipped", post_id)
    return published


# ---------------- Output for admins ----------------


def relation_labels(db: Session, refs: list[tuple[str, uuid.UUID]]) -> dict[tuple, tuple]:
    """(kind, id) -> (label, is public) for the editor's list of linked items."""
    result: dict[tuple, tuple] = {}
    by_kind: dict[str, list[uuid.UUID]] = {}
    for kind, entity_id in refs:
        by_kind.setdefault(kind, []).append(entity_id)
    if ids := by_kind.get(RelationKind.GIN):
        for gin in db.scalars(select(GinProduct).where(GinProduct.id.in_(ids))):
            result[(RelationKind.GIN, gin.id)] = (gin.display_name, gin.public_visible)
    if ids := by_kind.get(RelationKind.REVIEW):
        visible = set(db.scalars(_visible_reviews().with_only_columns(Review.id)))
        for review in db.scalars(select(Review).where(Review.id.in_(ids))):
            result[(RelationKind.REVIEW, review.id)] = (review.title, review.id in visible)
    if ids := by_kind.get(RelationKind.COCKTAIL):
        for recipe in db.scalars(select(CocktailRecipe).where(CocktailRecipe.id.in_(ids))):
            live = recipe.status == CocktailStatus.PUBLISHED
            result[(RelationKind.COCKTAIL, recipe.id)] = (recipe.title, live)
    if ids := by_kind.get(RelationKind.POST):
        for other in db.scalars(select(BlogPost).where(BlogPost.id.in_(ids))):
            result[(RelationKind.POST, other.id)] = (other.title, is_live(other))
    return result


def post_out(db: Session, post: BlogPost) -> PostOut:
    refs = [(r.entity_kind, r.entity_id) for r in post.relations]
    labels = relation_labels(db, refs)
    return PostOut(
        id=post.id,
        slug=post.slug,
        title=post.title,
        excerpt=post.excerpt,
        body_blocks=post.body_blocks or [],
        status=post.status,
        is_live=is_live(post),
        author=Person.model_validate(post.author),
        edited_by=Person.model_validate(post.edited_by) if post.edited_by else None,
        category=CategoryRef.model_validate(post.category) if post.category else None,
        tags=[t.name for t in post.tags],
        hero_media_id=post.hero_media_id,
        hero_image=media_summary(post.hero),
        hero_credit=post.hero_credit,
        social_media_id=post.social_media_id,
        featured=post.featured,
        seo_title=post.seo_title,
        seo_description=post.seo_description,
        relations=[
            RelationOut(
                kind=RelationKind(kind),
                id=entity_id,
                label=labels.get((kind, entity_id), ("(missing)", False))[0],
                public=labels.get((kind, entity_id), ("(missing)", False))[1],
            )
            for kind, entity_id in refs
        ],
        reading_minutes=reading_minutes(post),
        published_at=post.published_at,
        scheduled_at=post.scheduled_at,
        version=post.version,
        created_at=post.created_at,
        updated_at=post.updated_at,
    )


def category_post_counts(db: Session, only_visible: bool = False) -> dict[uuid.UUID, int]:
    query = select(BlogPost.category_id, func.count()).group_by(BlogPost.category_id)
    if only_visible:
        query = query.where(
            BlogPost.status == PostStatus.PUBLISHED, BlogPost.published_at <= utcnow()
        )
    return {cid: n for cid, n in db.execute(query) if cid is not None}


# ---------------- Output for the public ----------------


def post_card(post: BlogPost) -> PublicPostCard:
    return PublicPostCard(
        slug=post.slug,
        title=post.title,
        excerpt=post.excerpt,
        category=PublicCategoryRef(name=post.category.name, slug=post.category.slug)
        if post.category
        else None,
        tags=[PublicTagRef(name=t.name, slug=t.slug) for t in post.tags],
        author_name=post.author.display_name,
        published_at=post.published_at,
        reading_minutes=reading_minutes(post),
        image=media_summary(post.hero),
        featured=post.featured,
    )


def _public_cards(db: Session, refs: list[tuple[str, uuid.UUID]]) -> dict[tuple, Any]:
    """(kind, id) -> public card, for the referenced items visitors may see."""
    result: dict[tuple, Any] = {}
    by_kind: dict[str, list[uuid.UUID]] = {}
    for kind, entity_id in refs:
        by_kind.setdefault(str(kind), []).append(entity_id)
    if ids := by_kind.get(RelationKind.GIN):
        gins = db.scalars(public_gins().where(GinProduct.id.in_(ids))).unique().all()
        for gin, card in zip(gins, gin_cards(db, list(gins)), strict=True):
            result[(RelationKind.GIN, gin.id)] = card
    if ids := by_kind.get(RelationKind.REVIEW):
        for review in db.scalars(_visible_reviews().where(Review.id.in_(ids))).unique():
            result[(RelationKind.REVIEW, review.id)] = review_service.public_card(review)
    if ids := by_kind.get(RelationKind.COCKTAIL):
        query = _visible_cocktails().where(CocktailRecipe.id.in_(ids))
        for recipe in db.scalars(query).unique():
            result[(RelationKind.COCKTAIL, recipe.id)] = cocktail_service.public_card(recipe)
    if ids := by_kind.get(RelationKind.POST):
        for other in db.scalars(visible_posts().where(BlogPost.id.in_(ids))).unique():
            result[(RelationKind.POST, other.id)] = post_card(other)
    return result


def public_body(db: Session, post: BlogPost, cards: dict[tuple, Any]) -> list[dict[str, Any]]:
    """Blocks ready to show: images and cards filled in, hidden items dropped."""
    body = []
    for block in post.body_blocks or []:
        if block["type"] == "image":
            image = media_summary(db.get(MediaAsset, uuid.UUID(str(block["media_id"]))))
            if image is None:
                continue
            body.append(
                {
                    "type": "image",
                    "image": image.model_dump(mode="json"),
                    "caption": block.get("caption"),
                }
            )
        elif block["type"] == "card":
            card = cards.get((block["kind"], uuid.UUID(str(block["id"]))))
            if card is None:
                continue  # private, unpublished or deleted: leave it out
            body.append(
                {"type": "card", "kind": block["kind"], "card": card.model_dump(mode="json")}
            )
        else:
            body.append(block)
    return body


def related_posts(
    db: Session, post: BlogPost, chosen: list[PublicPostCard]
) -> list[PublicPostCard]:
    """Hand-picked related stories first, then the same category, then the newest."""
    result = list(chosen)
    taken = {c.slug for c in result} | {post.slug}
    queries = []
    if post.category_id:
        queries.append(visible_posts().where(BlogPost.category_id == post.category_id))
    queries.append(visible_posts())
    for query in queries:
        if len(result) >= RELATED_COUNT:
            break
        for other in db.scalars(query.order_by(BlogPost.published_at.desc()).limit(10)).unique():
            if other.slug not in taken and len(result) < RELATED_COUNT:
                result.append(post_card(other))
                taken.add(other.slug)
    return result


def public_post(db: Session, post: BlogPost) -> PublicPost:
    rel_refs = [(r.entity_kind, r.entity_id) for r in post.relations]
    block_refs = [
        (b["kind"], uuid.UUID(str(b["id"]))) for b in post.body_blocks or [] if b["type"] == "card"
    ]
    cards = _public_cards(db, rel_refs + block_refs)

    def related(kind: RelationKind) -> list:
        return [cards[(k, i)] for k, i in rel_refs if k == kind and (k, i) in cards]

    return PublicPost(
        **post_card(post).model_dump(),
        body=public_body(db, post, cards),
        hero_credit=post.hero_credit,
        seo_title=post.seo_title,
        seo_description=post.seo_description,
        social_image=media_summary(post.social) or media_summary(post.hero),
        updated_at=post.updated_at,
        gins=related(RelationKind.GIN),
        reviews=related(RelationKind.REVIEW),
        cocktails=related(RelationKind.COCKTAIL),
        related=related_posts(db, post, related(RelationKind.POST)),
    )


def category_ref(category: BlogCategory) -> CategoryRef:
    return CategoryRef.model_validate(category)
