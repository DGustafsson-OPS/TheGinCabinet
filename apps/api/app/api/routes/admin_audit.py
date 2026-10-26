"""Audit log viewer for administrators (spec §8: GET /api/v1/admin/audit, §5 A10)."""

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import func, select

from app.api.deps import CurrentAdmin, DbSession
from app.models import AuditEvent, User
from app.schemas.audit import AuditEventOut
from app.schemas.common import Page, PageParams

router = APIRouter(prefix="/admin/audit", tags=["admin: audit"])


@router.get("", response_model=Page[AuditEventOut])
def list_audit_events(
    admin: CurrentAdmin,  # unused here, but requiring it is what protects the route
    db: DbSession,
    paging: Annotated[PageParams, Depends()],
    action: str | None = None,
    entity_type: str | None = None,
):
    """Newest events first, optionally filtered, e.g. ``?action=auth.login``."""
    query = select(AuditEvent, User.display_name).outerjoin(User, AuditEvent.actor_id == User.id)
    if action:
        query = query.where(AuditEvent.action == action)
    if entity_type:
        query = query.where(AuditEvent.entity_type == entity_type)

    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    rows = db.execute(
        query.order_by(AuditEvent.occurred_at.desc()).offset(paging.offset).limit(paging.page_size)
    ).all()

    items = [
        AuditEventOut.model_validate(event).model_copy(update={"actor_name": name})
        for event, name in rows
    ]
    return Page[AuditEventOut](items=items, meta=paging.meta(total))
