"""API keys (Settings → API keys): let a program such as an AI assistant use the admin API.

Only a person signed in as an admin can see, create or revoke keys; a key can
never manage keys. The new key is returned once, when it is created.
"""

import uuid
from datetime import datetime

from fastapi import APIRouter
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.api.deps import CurrentAdminPerson, CurrentAdminPersonWrite, DbSession
from app.models import ApiKey
from app.models._types import utcnow
from app.services import audit
from app.services.api_keys import create_api_key, is_active
from app.services.common import get_or_404

router = APIRouter(prefix="/admin/api-keys", tags=["admin: api keys"])


class ApiKeyIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    days: int = Field(default=90, ge=1, le=365)  # how long until it stops working


class ApiKeyOut(BaseModel):
    id: uuid.UUID
    name: str
    prefix: str
    owner: str  # the admin it acts as
    created_at: datetime
    expires_at: datetime
    last_used_at: datetime | None
    revoked_at: datetime | None
    active: bool


class ApiKeyCreated(ApiKeyOut):
    key: str  # shown this once only


def _out(row: ApiKey) -> ApiKeyOut:
    return ApiKeyOut(
        id=row.id,
        name=row.name,
        prefix=row.prefix,
        owner=row.user.display_name,
        created_at=row.created_at,
        expires_at=row.expires_at,
        last_used_at=row.last_used_at,
        revoked_at=row.revoked_at,
        active=is_active(row),
    )


@router.get("", response_model=list[ApiKeyOut])
def list_keys(admin: CurrentAdminPerson, db: DbSession):
    rows = db.scalars(select(ApiKey).order_by(ApiKey.created_at.desc())).all()
    return [_out(r) for r in rows]


@router.post("", response_model=ApiKeyCreated, status_code=201)
def create_key(body: ApiKeyIn, admin: CurrentAdminPersonWrite, db: DbSession):
    row, key = create_api_key(db, name=body.name.strip(), user_id=admin.user.id, days=body.days)
    db.flush()
    db.refresh(row)
    audit.record(
        db,
        action="api_key.create",
        entity_type="api_key",
        entity_id=row.id,
        actor_id=admin.user.id,
        summary={"name": row.name, "days": body.days},
    )
    db.commit()
    return ApiKeyCreated(**_out(row).model_dump(), key=key)


@router.delete("/{key_id}", status_code=204)
def revoke_key(key_id: uuid.UUID, admin: CurrentAdminPersonWrite, db: DbSession):
    """Stop a key working, at once. It stays in the list (greyed out) for the record."""
    row = get_or_404(db, ApiKey, key_id, "API key")
    if row.revoked_at is None:
        row.revoked_at = utcnow()
        audit.record(
            db,
            action="api_key.revoke",
            entity_type="api_key",
            entity_id=row.id,
            actor_id=admin.user.id,
            summary={"name": row.name},
        )
        db.commit()
