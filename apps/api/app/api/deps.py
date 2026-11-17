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
from app.models import ApiKey, AuthSession, User, UserRole
from app.security.tokens import tokens_match
from app.services.api_keys import resolve_api_key
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
    """Everything a protected admin route needs to know about the caller.

    A person signed in through the website has a ``session``. A program using
    an API key has ``api_key`` instead (and no session): it acts as the admin
    who created the key.
    """

    user: User
    session: AuthSession | None
    api_key: ApiKey | None = None


def bearer_key(request: Request) -> str | None:
    """The key from an ``Authorization: Bearer gck_...`` header, if any."""
    scheme, _, value = request.headers.get("authorization", "").partition(" ")
    return value.strip() if scheme.lower() == "bearer" and value.strip() else None


def require_staff(request: Request, session: OptionalSession, db: DbSession) -> AdminContext:
    """Allow anyone fully signed in (password **and** MFA): an admin or an editor.

    Or a program with a valid API key, which acts as the key's admin.
    """
    if (key := bearer_key(request)) is not None:
        api_key = resolve_api_key(db, key)
        if api_key is None or not api_key.user.enabled or api_key.user.role != UserRole.ADMIN:
            raise ApiError(401, "invalid_api_key", "That API key is wrong, expired or revoked.")
        # audit.record() reads this, so the log says "via API key: Claude".
        db.info["via"] = f"API key: {api_key.name}"
        return AdminContext(user=api_key.user, session=None, api_key=api_key)
    if session is None or not session.mfa_verified:
        raise ApiError(401, "not_authenticated", "Please sign in.")
    user = db.get(User, session.user_id)
    if user is None or not user.enabled:
        raise ApiError(401, "not_authenticated", "Please sign in.")
    return AdminContext(user=user, session=session)


def require_admin(staff: Annotated[AdminContext, Depends(require_staff)]) -> AdminContext:
    """Allow only admins. Editors get 403.

    This is the default for every route under /admin. Routes that editors may
    use (writing and publishing content) ask for ``CurrentStaff`` instead, so
    a route nobody thought about stays admin-only.
    """
    if staff.user.role != UserRole.ADMIN:
        raise ApiError(403, "admins_only", "Only an admin can do this.")
    return staff


CurrentStaff = Annotated[AdminContext, Depends(require_staff)]
CurrentAdmin = Annotated[AdminContext, Depends(require_admin)]


def check_csrf(request: Request, session: AuthSession | None) -> None:
    """Block Cross-Site Request Forgery on state-changing requests (spec §8, §9).

    The attack: a malicious site makes *your* logged-in browser send a request
    to our API. Two defences:

    1. **Origin check**: browsers label requests with the site they came from;
       reject unknown origins.
    2. **CSRF token**: the request must carry a secret header value that only
       our own frontend knows (it got it from GET /auth/session). Another site
       cannot read it, so it cannot forge the header.
    """
    if request.method in SAFE_METHODS or session is None:
        # session is None only for API keys. They come in a header a browser
        # never adds by itself, so another site can't forge them: no CSRF risk.
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


def require_staff_write(request: Request, staff: CurrentStaff) -> AdminContext:
    """Admin or editor + CSRF: for content routes editors may change."""
    check_csrf(request, staff.session)
    return staff


CurrentStaffWrite = Annotated[AdminContext, Depends(require_staff_write)]


# ---------- Things only a person may do ----------


def require_person(staff: CurrentStaff) -> AdminContext:
    """Refuse API keys: for accounts, passwords, 2FA, trusted browsers and keys."""
    if staff.api_key is not None:
        raise ApiError(403, "person_only", "This needs a person signed in, not an API key.")
    return staff


def require_person_write(
    request: Request, staff: Annotated[AdminContext, Depends(require_person)]
) -> AdminContext:
    check_csrf(request, staff.session)
    return staff


def require_admin_person(staff: Annotated[AdminContext, Depends(require_person)]) -> AdminContext:
    return require_admin(staff)


def require_admin_person_write(
    request: Request, admin: Annotated[AdminContext, Depends(require_admin_person)]
) -> AdminContext:
    check_csrf(request, admin.session)
    return admin


CurrentPerson = Annotated[AdminContext, Depends(require_person)]
CurrentPersonWrite = Annotated[AdminContext, Depends(require_person_write)]
CurrentAdminPerson = Annotated[AdminContext, Depends(require_admin_person)]
CurrentAdminPersonWrite = Annotated[AdminContext, Depends(require_admin_person_write)]


def forbid_key_publishing(who: AdminContext, what: str = "publish or make things public") -> None:
    """New content from an API key stays a draft: a person publishes it.

    Call this wherever something would become visible to visitors.
    """
    if who.api_key is not None:
        raise ApiError(
            403,
            "publish_needs_person",
            f"An API key can't {what}. It's saved as a draft: publish it in the admin.",
        )
