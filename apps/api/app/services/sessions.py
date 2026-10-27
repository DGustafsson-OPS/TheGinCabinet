"""Server-side login sessions (spec §9: short idle and absolute lifetimes, revocation).

How it works:

1. When someone logs in we create a random token, put it in an HttpOnly cookie
   (JavaScript cannot read it) and store its *hash* in ``auth_sessions``.
2. On every request we hash the cookie value and look the session up.
3. A session is valid only if it is not revoked, not past ``expires_at``
   (absolute lifetime) and was used recently (idle lifetime).

Because sessions live in the database, logging out (or an admin revoking a
session) takes effect immediately.
"""

from datetime import timedelta

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import AuthSession, User
from app.models._types import as_utc, utcnow
from app.security.tokens import hash_token, new_token


def create_session(
    db: Session,
    user: User,
    *,
    mfa_verified: bool,
    ip_address: str | None,
    user_agent: str | None,
) -> tuple[str, AuthSession]:
    """Create a session and return ``(raw_token, session_row)``.

    The raw token goes into the cookie and is never stored. A session that is
    still waiting for the MFA code gets a very short lifetime.
    """
    settings = get_settings()
    lifetime = (
        timedelta(hours=settings.session_absolute_hours)
        if mfa_verified
        else timedelta(minutes=settings.mfa_pending_minutes)
    )
    token = new_token()
    now = utcnow()
    row = AuthSession(
        token_hash=hash_token(token),
        user_id=user.id,
        csrf_token=new_token(),
        mfa_verified=mfa_verified,
        created_at=now,
        last_seen_at=now,
        expires_at=now + lifetime,
        ip_address=ip_address,
        user_agent=(user_agent or "")[:255] or None,
    )
    db.add(row)
    return token, row


def resolve_session(db: Session, token: str | None) -> AuthSession | None:
    """Find the valid session for a cookie value, or return ``None``.

    Also refreshes ``last_seen_at`` so an active user stays logged in (up to
    the absolute limit).
    """
    if not token:
        return None
    row = db.scalar(select(AuthSession).where(AuthSession.token_hash == hash_token(token)))
    if row is None or row.revoked_at is not None:
        return None

    now = utcnow()
    idle_limit = timedelta(minutes=get_settings().session_idle_minutes)
    if as_utc(row.expires_at) <= now or as_utc(row.last_seen_at) + idle_limit <= now:
        return None

    user = db.get(User, row.user_id)
    if user is None or not user.enabled:
        return None

    # Only write to the database at most once a minute, not on every request.
    if now - as_utc(row.last_seen_at) > timedelta(minutes=1):
        row.last_seen_at = now
        db.commit()
    return row


def revoke_session(db: Session, row: AuthSession) -> None:
    row.revoked_at = utcnow()


def revoke_all_for_user(db: Session, user: User) -> None:
    """Log a user out everywhere, e.g. after a password reset."""
    db.execute(
        update(AuthSession)
        .where(AuthSession.user_id == user.id, AuthSession.revoked_at.is_(None))
        .values(revoked_at=utcnow())
    )
