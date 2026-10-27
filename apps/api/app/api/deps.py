"""Reusable FastAPI *dependencies*.

A dependency is a function FastAPI runs before your route. If a route asks
for ``admin: CurrentAdmin``, FastAPI first runs ``require_admin``. If that
raises an error, the route never runs. This puts "server-side authorization
for every admin request" (spec §9) in a single place.
"""

from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.errors import ApiError
from app.models import AuthSession, User
from app.security.tokens import tokens_match
from app.services.sessions import resolve_session

# `Annotated[Session, Depends(get_db)]` means: "this parameter is a Session,
# and FastAPI should get it by calling get_db". Naming it `DbSession` saves
# repeating that in every route.
DbSession = Annotated[Session, Depends(get_db)]

SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}


def client_ip(request: Request) -> str | None:
    """The caller's IP address.

    Behind Coolify's proxy, uvicorn is started with ``--proxy-headers`` so this
    is the real visitor IP, not the proxy's (spec §10B: "verify real-client-IP
    trust boundaries").
    """
    return request.client.host if request.client else None


def get_optional_session(request: Request, db: DbSession) -> AuthSession | None:
    token = request.cookies.get(get_settings().session_cookie_name)
    return resolve_session(db, token)


OptionalSession = Annotated[AuthSession | None, Depends(get_optional_session)]


@dataclass
class AdminContext:
    """Everything a protected admin route needs to know about the caller."""

    user: User
    session: AuthSession


def require_admin(session: OptionalSession, db: DbSession) -> AdminContext:
    """Allow only a fully signed-in admin (password **and** MFA). Otherwise 401."""
    if session is None or not session.mfa_verified:
        raise ApiError(401, "not_authenticated", "Please sign in.")
    user = db.get(User, session.user_id)
    if user is None or not user.enabled:
        raise ApiError(401, "not_authenticated", "Please sign in.")
    return AdminContext(user=user, session=session)


CurrentAdmin = Annotated[AdminContext, Depends(require_admin)]


def check_csrf(request: Request, session: AuthSession) -> None:
    """Block Cross-Site Request Forgery on state-changing requests (spec §8, §9).

    The attack: a malicious site makes *your* logged-in browser send a request
    to our API. Two defences:

    1. **Origin check**: browsers label requests with the site they came from;
       reject unknown origins.
    2. **CSRF token**: the request must carry a secret header value that only
       our own frontend knows (it got it from GET /auth/session). Another site
       cannot read it, so it cannot forge the header.
    """
    if request.method in SAFE_METHODS:
        return
    origin = request.headers.get("origin")
    if origin and origin.rstrip("/") not in get_settings().allowed_origin_list:
        raise ApiError(403, "origin_not_allowed", "Request origin is not allowed.")
    if not tokens_match(request.headers.get("x-csrf-token"), session.csrf_token):
        raise ApiError(403, "csrf_failed", "Missing or invalid CSRF token.")


def require_admin_write(request: Request, admin: CurrentAdmin) -> AdminContext:
    """Admin + CSRF: use this on every admin POST/PATCH/DELETE route."""
    check_csrf(request, admin.session)
    return admin


CurrentAdminWrite = Annotated[AdminContext, Depends(require_admin_write)]
