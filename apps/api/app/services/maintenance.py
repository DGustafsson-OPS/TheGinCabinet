"""The periodic background job (spec A13 "idempotent scheduled publishing job").

Every minute it:

1. publishes Journal articles whose scheduled time has come, and
2. deletes sign-in records nobody needs any more: expired sessions and login
   attempts older than a day (only the last 15 minutes count for throttling).

The API runs it on a timer (see ``app/main.py``). It can also be run by hand
or from cron with ``python -m app.cli run-jobs``. Running it twice at once is
harmless.
"""

import logging
from datetime import timedelta

from sqlalchemy import delete, or_
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import AuthSession, LoginAttempt
from app.models._types import utcnow
from app.services.blog import publish_due

log = logging.getLogger(__name__)

KEEP_LOGIN_ATTEMPTS = timedelta(days=1)


def prune_auth_records(db: Session) -> None:
    now = utcnow()
    idle = timedelta(minutes=get_settings().session_idle_minutes)
    db.execute(
        delete(AuthSession).where(
            or_(AuthSession.expires_at < now, AuthSession.last_seen_at < now - idle)
        )
    )
    db.execute(delete(LoginAttempt).where(LoginAttempt.attempted_at < now - KEEP_LOGIN_ATTEMPTS))
    db.commit()


def run_jobs(db: Session) -> int:
    """Run every periodic task once; returns how many articles were published."""
    published = publish_due(db)
    if published:
        log.info("Published %d scheduled article(s)", published)
    prune_auth_records(db)
    return published
