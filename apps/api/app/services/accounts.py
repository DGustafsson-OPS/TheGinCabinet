"""Accounts: invitations and the limits on how many accounts may exist.

An invitation is a one-time link. Its secret part is random (256 bits) and
only its SHA-256 hash is stored, so even someone who reads the database can't
use a pending link. The link stops working after INVITE_DAYS, or as soon as
the person has finished setting up their account.
"""

import hashlib
import secrets
from datetime import timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.errors import ApiError
from app.models import MAX_ACCOUNTS, MAX_ADMINS, User, UserRole
from app.models._types import as_utc, utcnow
from app.security.passwords import hash_password

INVITE_DAYS = 7


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def issue_invite(user: User) -> str:
    """Give ``user`` a fresh invitation link secret (replacing any older one)."""
    token = secrets.token_urlsafe(32)
    user.invite_token_hash = _hash(token)
    user.invite_expires_at = utcnow() + timedelta(days=INVITE_DAYS)
    return token


def find_invite(db: Session, token: str) -> User:
    """The account a link belongs to, or a 404 if it's unknown, used or expired."""
    user = db.scalar(select(User).where(User.invite_token_hash == _hash(token))) if token else None
    if (
        user is None
        or not user.invite_pending
        or user.invite_expires_at is None
        or as_utc(user.invite_expires_at) <= utcnow()
    ):
        raise ApiError(
            404,
            "invite_not_found",
            "This invitation link is not valid. Ask an admin for a new one.",
        )
    return user


def unusable_password_hash() -> str:
    """A hash nobody knows the password for (until the invitation is accepted)."""
    return hash_password(secrets.token_urlsafe(32))


def check_limits(db: Session, role: str, exclude: User | None = None) -> None:
    """Refuse a new account or role change that would break the limits."""
    query = select(func.count()).select_from(User)
    if exclude is not None:
        query = query.where(User.id != exclude.id)
    if role == UserRole.ADMIN:
        admins = db.scalar(query.where(User.role == UserRole.ADMIN)) or 0
        if admins >= MAX_ADMINS:
            raise ApiError(422, "too_many_admins", f"There can be at most {MAX_ADMINS} admins.")
    if exclude is None and (db.scalar(query) or 0) >= MAX_ACCOUNTS:
        raise ApiError(422, "too_many_accounts", f"There can be at most {MAX_ACCOUNTS} accounts.")
