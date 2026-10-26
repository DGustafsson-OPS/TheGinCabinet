"""Login throttling (spec §9) to slow down password and MFA-code guessing.

Rule: if a username has had too many failed attempts recently, or one IP
address has failed a lot across any usernames, refuse new attempts until the
time window passes. Attempts are stored in the database so the limit still
holds after a restart.
"""

from datetime import timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import LoginAttempt
from app.models._types import utcnow

# One IP may fail this many times more than a single username may. This is
# looser because several people can share one IP.
IP_MULTIPLIER = 4


def is_locked_out(db: Session, username: str, ip_address: str | None) -> bool:
    settings = get_settings()
    since = utcnow() - timedelta(minutes=settings.login_window_minutes)
    failed_recently = (
        select(func.count())
        .select_from(LoginAttempt)
        .where(LoginAttempt.succeeded.is_(False), LoginAttempt.attempted_at >= since)
    )

    by_user = db.scalar(failed_recently.where(LoginAttempt.username == username.lower())) or 0
    if by_user >= settings.login_max_attempts:
        return True

    if ip_address:
        by_ip = db.scalar(failed_recently.where(LoginAttempt.ip_address == ip_address)) or 0
        if by_ip >= settings.login_max_attempts * IP_MULTIPLIER:
            return True
    return False


def record_attempt(db: Session, username: str, ip_address: str | None, succeeded: bool) -> None:
    db.add(LoginAttempt(username=username.lower(), ip_address=ip_address, succeeded=succeeded))
