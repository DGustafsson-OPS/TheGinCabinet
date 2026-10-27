"""Private tasting journal (spec §8: /api/v1/admin/tastings, §5 A05)."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select

from app.api.deps import CurrentAdmin, CurrentAdminWrite, DbSession
from app.errors import ApiError
from app.models import Bottle, GinProduct, Tasting
from app.schemas.common import Page, PageParams
from app.schemas.editorial import TastingIn, TastingOut, TastingPatch
from app.services import audit
from app.services.common import apply_patch, get_or_404
from app.services.versioning import check_version

router = APIRouter(prefix="/admin/tastings", tags=["admin: tastings"])

Force = Annotated[bool, Query(description="Overwrite even if the record changed meanwhile")]


def _check_bottle(db: DbSession, bottle_id: uuid.UUID | None, gin_id: uuid.UUID) -> None:
    """A linked bottle must exist and be a bottle of the same gin."""
    if bottle_id is None:
        return
    bottle = get_or_404(db, Bottle, bottle_id, "Bottle")
    if bottle.gin_id != gin_id:
        raise ApiError(422, "bottle_gin_mismatch", "That bottle is a different gin.")


@router.get("", response_model=Page[TastingOut])
def list_tastings(
    admin: CurrentAdmin,
    db: DbSession,
    paging: Annotated[PageParams, Depends()],
    gin_id: uuid.UUID | None = None,
    author_id: uuid.UUID | None = None,
):
    query = select(Tasting)
    if gin_id:
        query = query.where(Tasting.gin_id == gin_id)
    if author_id:
        query = query.where(Tasting.author_id == author_id)
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    rows = db.scalars(
        query.order_by(Tasting.tasted_on.desc(), Tasting.created_at.desc())
        .offset(paging.offset)
        .limit(paging.page_size)
    ).all()
    return Page[TastingOut](
        items=[TastingOut.model_validate(t) for t in rows], meta=paging.meta(total)
    )


@router.post("", response_model=TastingOut, status_code=201)
def create_tasting(body: TastingIn, admin: CurrentAdminWrite, db: DbSession):
    get_or_404(db, GinProduct, body.gin_id, "Gin")
    _check_bottle(db, body.bottle_id, body.gin_id)
    # The signed-in admin is always the author (spec A05).
    tasting = Tasting(**body.model_dump(), author_id=admin.user.id)
    db.add(tasting)
    db.flush()
    audit.record(
        db,
        action="tasting.create",
        entity_type="tasting",
        entity_id=tasting.id,
        actor_id=admin.user.id,
        summary={"gin_id": str(body.gin_id)},
    )
    db.commit()
    db.refresh(tasting)
    return tasting


@router.get("/{tasting_id}", response_model=TastingOut)
def get_tasting(tasting_id: uuid.UUID, admin: CurrentAdmin, db: DbSession):
    return get_or_404(db, Tasting, tasting_id, "Tasting")


@router.patch("/{tasting_id}", response_model=TastingOut)
def update_tasting(
    tasting_id: uuid.UUID,
    body: TastingPatch,
    admin: CurrentAdminWrite,
    db: DbSession,
    force: Force = False,
):
    tasting = get_or_404(db, Tasting, tasting_id, "Tasting")
    # Individual authorship: you can read the other admin's notes, not edit them.
    if tasting.author_id != admin.user.id:
        raise ApiError(403, "not_author", "Only the person who wrote a tasting can edit it.")
    changes = body.model_dump(exclude_unset=True)
    sent_version = changes.pop("version")
    check_version(
        current_version=tasting.version,
        sent_version=sent_version,
        force=force,
        changes=changes,
        current=TastingOut.model_validate(tasting),
    )
    if "bottle_id" in changes:
        _check_bottle(db, changes["bottle_id"], tasting.gin_id)
    apply_patch(tasting, changes, never_empty={"tasted_on", "flavours"})
    audit.record(
        db,
        action="tasting.update",
        entity_type="tasting",
        entity_id=tasting.id,
        actor_id=admin.user.id,
        summary={"fields": sorted(changes)},
    )
    db.commit()
    db.refresh(tasting)
    return tasting
