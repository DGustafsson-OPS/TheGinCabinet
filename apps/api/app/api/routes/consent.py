"""Cookie-consent records (proof of consent) and statistics for admins.

* ``POST /internal/consent``: called by the website's own server whenever a
  visitor answers the cookie banner. It is deliberately **not** under
  ``/api``: the website only forwards ``/api/...`` to this service, so
  browsers can't reach it; only the website server on the private network can.
* ``GET /api/v1/admin/consent/stats``: totals for the Settings page.
"""

from datetime import timedelta
from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel, Field
from sqlalchemy import func, select

from app.api.deps import CurrentAdmin, DbSession
from app.models import ConsentRecord
from app.models._types import utcnow

internal_router = APIRouter(prefix="/internal", tags=["internal"])
router = APIRouter(prefix="/admin/consent", tags=["admin: consent"])


class ConsentIn(BaseModel):
    consent_id: str = Field(pattern=r"^[A-Za-z0-9_-]{16,64}$")
    policy_version: int = Field(ge=1, le=10_000)
    action: Literal["accept_all", "reject_all", "custom"]
    analytics: bool


@internal_router.post("/consent", status_code=204)
def record_consent(body: ConsentIn, db: DbSession):
    db.add(ConsentRecord(**body.model_dump()))
    db.commit()


class ConsentStats(BaseModel):
    days: int
    total: int
    analytics_allowed: int
    analytics_refused: int
    by_action: dict[str, int]


@router.get("/stats", response_model=ConsentStats)
def consent_stats(admin: CurrentAdmin, db: DbSession, days: int = 30):
    """How visitors answered over the last ``days`` days (latest answer per browser)."""
    days = max(1, min(days, 365))
    since = utcnow() - timedelta(days=days)
    # Each browser can answer several times; count only its latest answer.
    latest = (
        select(ConsentRecord.consent_id, func.max(ConsentRecord.recorded_at).label("at"))
        .where(ConsentRecord.recorded_at >= since)
        .group_by(ConsentRecord.consent_id)
        .subquery()
    )
    rows = db.execute(
        select(ConsentRecord.action, ConsentRecord.analytics).join(
            latest,
            (ConsentRecord.consent_id == latest.c.consent_id)
            & (ConsentRecord.recorded_at == latest.c.at),
        )
    ).all()
    by_action: dict[str, int] = {}
    for action, _ in rows:
        by_action[action] = by_action.get(action, 0) + 1
    allowed = sum(1 for _, analytics in rows if analytics)
    return ConsentStats(
        days=days,
        total=len(rows),
        analytics_allowed=allowed,
        analytics_refused=len(rows) - allowed,
        by_action=by_action,
    )
