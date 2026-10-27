"""Admin catalogue: distilleries and gins (spec §8: /api/v1/admin/gins, §5 A02)."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_, select

from app.api.deps import CurrentAdmin, CurrentAdminWrite, DbSession
from app.models import Botanical, Distillery, GinProduct, GinStyle
from app.schemas.catalogue import (
    DistilleryIn,
    DistilleryOut,
    DistilleryPatch,
    GinIn,
    GinOut,
    GinPatch,
)
from app.schemas.common import Page, PageParams
from app.services import audit
from app.services.catalogue import (
    apply_gin_changes,
    bottle_counts,
    create_gin,
    gin_out,
    gin_out_with_counts,
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

router = APIRouter(prefix="/admin", tags=["admin: catalogue"])

# `?force=true` deliberately overwrites someone else's newer save (spec §6).
Force = Annotated[bool, Query(description="Overwrite even if the record changed meanwhile")]


# ---------------- Distilleries ----------------


def _distillery_out(db: DbSession, distillery: Distillery) -> DistilleryOut:
    count = db.scalar(
        select(func.count())
        .select_from(GinProduct)
        .where(GinProduct.distillery_id == distillery.id)
    )
    return DistilleryOut.model_validate(distillery).model_copy(update={"gin_count": count or 0})


@router.get("/distilleries", response_model=Page[DistilleryOut])
def list_distilleries(
    admin: CurrentAdmin,
    db: DbSession,
    paging: Annotated[PageParams, Depends()],
    search: str | None = None,
):
    query = select(Distillery)
    if search:
        query = query.where(
            or_(contains(Distillery.name, search), contains(Distillery.country, search))
        )
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    rows = db.scalars(
        query.order_by(Distillery.name).offset(paging.offset).limit(paging.page_size)
    ).all()
    return Page[DistilleryOut](
        items=[_distillery_out(db, d) for d in rows], meta=paging.meta(total)
    )


@router.post("/distilleries", response_model=DistilleryOut, status_code=201)
def create_distillery(body: DistilleryIn, admin: CurrentAdminWrite, db: DbSession):
    data = body.model_dump()
    if data["slug"]:
        ensure_slug_free(db, Distillery, data["slug"])
    else:
        data["slug"] = unique_slug(db, Distillery, slugify(data["name"]))
    distillery = Distillery(**data)
    db.add(distillery)
    db.flush()
    audit.record(
        db,
        action="distillery.create",
        entity_type="distillery",
        entity_id=distillery.id,
        actor_id=admin.user.id,
        summary={"name": distillery.name},
    )
    db.commit()
    return _distillery_out(db, distillery)


@router.get("/distilleries/{distillery_id}", response_model=DistilleryOut)
def get_distillery(distillery_id: uuid.UUID, admin: CurrentAdmin, db: DbSession):
    return _distillery_out(db, get_or_404(db, Distillery, distillery_id, "Distillery"))


@router.patch("/distilleries/{distillery_id}", response_model=DistilleryOut)
def update_distillery(
    distillery_id: uuid.UUID,
    body: DistilleryPatch,
    admin: CurrentAdminWrite,
    db: DbSession,
    force: Force = False,
):
    distillery = get_or_404(db, Distillery, distillery_id, "Distillery")
    # exclude_unset=True: only the fields the client actually sent.
    changes = body.model_dump(exclude_unset=True)
    sent_version = changes.pop("version")
    check_version(
        current_version=distillery.version,
        sent_version=sent_version,
        force=force,
        changes=changes,
        current=_distillery_out(db, distillery),
    )
    if changes.get("slug"):
        ensure_slug_free(db, Distillery, changes["slug"], exclude_id=distillery.id)
    apply_patch(distillery, changes, never_empty={"name", "slug"})
    audit.record(
        db,
        action="distillery.update",
        entity_type="distillery",
        entity_id=distillery.id,
        actor_id=admin.user.id,
        summary={"fields": sorted(changes), "forced": force},
    )
    db.commit()
    return _distillery_out(db, distillery)


# ---------------- Gins ----------------


@router.get("/gins", response_model=Page[GinOut])
def list_gins(
    admin: CurrentAdmin,
    db: DbSession,
    paging: Annotated[PageParams, Depends()],
    search: str | None = None,
    style: GinStyle | None = None,
    public: bool | None = None,
    distillery_id: uuid.UUID | None = None,
):
    """Search by brand, name, edition or country (spec A02 "Searchable data table")."""
    query = select(GinProduct)
    if search:
        query = query.where(
            or_(
                contains(GinProduct.brand, search),
                contains(GinProduct.name, search),
                contains(GinProduct.edition, search),
                contains(GinProduct.country, search),
            )
        )
    if style:
        query = query.where(GinProduct.style == style)
    if public is not None:
        query = query.where(GinProduct.public_visible.is_(public))
    if distillery_id:
        query = query.where(GinProduct.distillery_id == distillery_id)

    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    gins = db.scalars(
        query.order_by(GinProduct.brand, GinProduct.name, GinProduct.edition)
        .offset(paging.offset)
        .limit(paging.page_size)
    ).all()
    counts = bottle_counts(db, [g.id for g in gins])
    items = [gin_out(g, counts.get(g.id, (0, 0))) for g in gins]
    return Page[GinOut](items=items, meta=paging.meta(total))


@router.post("/gins", response_model=GinOut, status_code=201)
def create_gin_route(body: GinIn, admin: CurrentAdminWrite, db: DbSession):
    gin = create_gin(db, body.model_dump())
    db.flush()
    audit.record(
        db,
        action="gin.create",
        entity_type="gin",
        entity_id=gin.id,
        actor_id=admin.user.id,
        summary={"name": gin.display_name, "public_visible": gin.public_visible},
    )
    db.commit()
    return gin_out(gin)


@router.get("/gins/{gin_id}", response_model=GinOut)
def get_gin(gin_id: uuid.UUID, admin: CurrentAdmin, db: DbSession):
    return gin_out_with_counts(db, get_or_404(db, GinProduct, gin_id, "Gin"))


@router.patch("/gins/{gin_id}", response_model=GinOut)
def update_gin(
    gin_id: uuid.UUID, body: GinPatch, admin: CurrentAdminWrite, db: DbSession, force: Force = False
):
    gin = get_or_404(db, GinProduct, gin_id, "Gin")
    changes = body.model_dump(exclude_unset=True)
    sent_version = changes.pop("version")
    check_version(
        current_version=gin.version,
        sent_version=sent_version,
        force=force,
        changes=changes,
        current=gin_out_with_counts(db, gin),
    )
    fields = sorted(changes)
    apply_gin_changes(db, gin, changes)
    audit.record(
        db,
        action="gin.update",
        entity_type="gin",
        entity_id=gin.id,
        actor_id=admin.user.id,
        summary={"fields": fields, "forced": force},
    )
    db.commit()
    return gin_out_with_counts(db, gin)


@router.get("/botanicals", response_model=list[str])
def list_botanicals(admin: CurrentAdmin, db: DbSession):
    """All known botanical names, for autocomplete in the gin form."""
    return db.scalars(select(Botanical.name).order_by(Botanical.name)).all()
