"""The Gin guide: /api/v1/admin/guide (editing) and /api/v1/public/guide.

Admins and editors can write, reorder, publish and delete pages. Visitors see
only published pages; anything else is a plain 404.
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Query
from sqlalchemy import func, select

from app.api.deps import CurrentStaff, CurrentStaffWrite, DbSession
from app.errors import ApiError
from app.models import GuidePage
from app.models._types import utcnow
from app.schemas.guide import (
    GuideOrder,
    GuidePageIn,
    GuidePageOut,
    GuidePagePatch,
    PublicGuideCard,
    PublicGuidePage,
)
from app.services import audit
from app.services import guide as guide_service
from app.services.blog import check_blocks, check_media
from app.services.common import apply_patch, ensure_slug_free, get_or_404, slugify, unique_slug
from app.services.versioning import check_version

router = APIRouter(prefix="/admin/guide", tags=["admin: gin guide"])
public_router = APIRouter(prefix="/public/guide", tags=["public: gin guide"])

Force = Annotated[bool, Query(description="Overwrite even if the record changed meanwhile")]


def _record(db, admin, page: GuidePage, action: str, **summary) -> None:
    audit.record(
        db,
        action=f"guide.{action}",
        entity_type="guide_page",
        entity_id=page.id,
        actor_id=admin.user.id,
        summary={"title": page.title, **summary},
    )


def _check_links(db, data: dict) -> None:
    if data.get("hero_media_id"):
        check_media(db, data["hero_media_id"])
    if data.get("body_blocks"):
        check_blocks(db, data["body_blocks"])


@router.get("", response_model=list[GuidePageOut])
def list_pages(admin: CurrentStaff, db: DbSession):
    """Every page, published or not, in the order visitors will see them."""
    return [guide_service.page_out(p) for p in db.scalars(guide_service.ordered()).unique()]


@router.post("", response_model=GuidePageOut, status_code=201)
def create_page(body: GuidePageIn, admin: CurrentStaffWrite, db: DbSession):
    """A new page starts unpublished, at the end of the list."""
    data = body.model_dump(mode="json")  # "json" mode: blocks become plain JSON
    data["hero_media_id"] = body.hero_media_id
    _check_links(db, data)
    if data["slug"]:
        ensure_slug_free(db, GuidePage, data["slug"])
    else:
        data["slug"] = unique_slug(db, GuidePage, slugify(body.title))
    last = db.scalar(select(func.max(GuidePage.position))) or 0
    page = GuidePage(**data, position=last + 10, published=False, edited_by_id=admin.user.id)
    db.add(page)
    db.flush()
    _record(db, admin, page, "create")
    db.commit()
    db.refresh(page)
    return guide_service.page_out(page)


@router.post("/order", response_model=list[GuidePageOut])
def reorder_pages(body: GuideOrder, admin: CurrentStaffWrite, db: DbSession):
    """Save a new order. The list must name every page exactly once."""
    pages = {p.id: p for p in db.scalars(select(GuidePage))}
    if len(set(body.ids)) != len(body.ids) or set(body.ids) != set(pages):
        raise ApiError(
            409,
            "order_out_of_date",
            "The list of pages has changed meanwhile. Reload the page and try again.",
        )
    for index, page_id in enumerate(body.ids):
        pages[page_id].position = (index + 1) * 10
    audit.record(
        db,
        action="guide.reorder",
        entity_type="guide_page",
        entity_id=None,
        actor_id=admin.user.id,
        summary={"order": [pages[i].title for i in body.ids]},
    )
    db.commit()
    return [guide_service.page_out(p) for p in db.scalars(guide_service.ordered()).unique()]


@router.get("/{page_id}", response_model=GuidePageOut)
def get_page(page_id: uuid.UUID, admin: CurrentStaff, db: DbSession):
    return guide_service.page_out(get_or_404(db, GuidePage, page_id, "Guide page"))


@router.get("/{page_id}/preview", response_model=PublicGuidePage)
def preview_page(page_id: uuid.UUID, admin: CurrentStaff, db: DbSession):
    """The page exactly as visitors will see it, published or not."""
    page = get_or_404(db, GuidePage, page_id, "Guide page")
    return guide_service.public_page(db, page, [page])


@router.patch("/{page_id}", response_model=GuidePageOut)
def update_page(
    page_id: uuid.UUID,
    body: GuidePagePatch,
    admin: CurrentStaffWrite,
    db: DbSession,
    force: Force = False,
):
    page = get_or_404(db, GuidePage, page_id, "Guide page")
    changes = body.model_dump(exclude_unset=True, mode="json")
    if "hero_media_id" in changes:
        changes["hero_media_id"] = body.hero_media_id
    check_version(
        current_version=page.version,
        sent_version=changes.pop("version"),
        force=force,
        changes=changes,
        current=guide_service.page_out(page),
    )
    _check_links(db, changes)
    if changes.get("slug"):
        ensure_slug_free(db, GuidePage, changes["slug"], exclude_id=page.id)
    publishing = changes.get("published") is True and not page.published
    if publishing:
        if not (changes.get("body_blocks") or page.body_blocks):
            raise ApiError(422, "empty_page", "Write some text before publishing this page.")
        changes["published_at"] = utcnow()
    apply_patch(page, changes, never_empty={"title", "slug", "body_blocks", "published"})
    page.edited_by_id = admin.user.id
    unpublishing = changes.get("published") is False
    action = "publish" if publishing else "unpublish" if unpublishing else "update"
    _record(db, admin, page, action, fields=sorted(changes), forced=force)
    db.commit()
    db.refresh(page)
    return guide_service.page_out(page)


@router.delete("/{page_id}", status_code=204)
def delete_page(page_id: uuid.UUID, admin: CurrentStaffWrite, db: DbSession):
    page = get_or_404(db, GuidePage, page_id, "Guide page")
    _record(db, admin, page, "delete")
    db.delete(page)
    db.commit()


# ---------------- Public ----------------


@public_router.get("", response_model=list[PublicGuideCard])
def list_public_pages(db: DbSession):
    return [guide_service.public_card(p) for p in db.scalars(guide_service.visible()).unique()]


@public_router.get("/{slug}", response_model=PublicGuidePage)
def get_public_page(slug: str, db: DbSession):
    pages = list(db.scalars(guide_service.visible()).unique())
    page = next((p for p in pages if p.slug == slug), None)
    if page is None:
        raise ApiError(404, "not_found", "This page doesn't exist.")
    return guide_service.public_page(db, page, pages)
