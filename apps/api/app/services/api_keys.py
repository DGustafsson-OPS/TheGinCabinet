"""API keys for programs such as an AI assistant (see ApiKey in models/auth.py).

A key looks like ``gck_`` followed by 43 random characters. It is shown once
when created; afterwards only its SHA-256 fingerprint is kept, so neither the
database nor a backup of it reveals a usable key.
"""

from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import ApiKey
from app.models._types import as_utc, utcnow
from app.security.tokens import hash_token, new_token

PREFIX = "gck_"  # "gin cabinet key": makes a leaked key easy to recognise and search for


def create_api_key(db: Session, *, name: str, user_id, days: int) -> tuple[ApiKey, str]:
    """Make a new key. Returns the stored row and the key itself (shown once)."""
    key = PREFIX + new_token()
    row = ApiKey(
        name=name,
        key_hash=hash_token(key),
        prefix=key[:10],
        user_id=user_id,
        expires_at=utcnow() + timedelta(days=days),
    )
    db.add(row)
    return row, key


def resolve_api_key(db: Session, key: str) -> ApiKey | None:
    """The key's row if it is valid now: known, not revoked, not expired."""
    if not key.startswith(PREFIX):
        return None
    row = db.scalar(select(ApiKey).where(ApiKey.key_hash == hash_token(key)))
    now = utcnow()
    if row is None or row.revoked_at is not None or as_utc(row.expires_at) <= now:
        return None
    # Note when it was last used (at most once a minute, to keep writes down).
    if row.last_used_at is None or now - as_utc(row.last_used_at) > timedelta(minutes=1):
        row.last_used_at = now
        db.commit()
    return row


def is_active(row: ApiKey, now: datetime | None = None) -> bool:
    return row.revoked_at is None and as_utc(row.expires_at) > (now or utcnow())
