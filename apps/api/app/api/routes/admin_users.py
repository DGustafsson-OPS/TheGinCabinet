"""The administrator list, for showing names next to history entries (spec §1)."""

import uuid

from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import select

from app.api.deps import CurrentStaff, DbSession
from app.models import User

router = APIRouter(prefix="/admin/users", tags=["admin: users"])


class AdminName(BaseModel):
    """Only what the UI needs to show "by Anna": no email, no login details."""

    id: uuid.UUID
    display_name: str


@router.get("", response_model=list[AdminName])
def list_admins(admin: CurrentStaff, db: DbSession):
    users = db.scalars(select(User).order_by(User.display_name))
    return [AdminName(id=u.id, display_name=u.display_name) for u in users]
