"""Request and response shapes for the /api/v1/auth endpoints."""

import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=256)


class LoginResponse(BaseModel):
    # Always True in V1: every admin must complete MFA after the password.
    mfa_required: bool = True


class MfaVerifyRequest(BaseModel):
    # Either the 6-digit app code or a recovery code like "a1b2c-3d4e5".
    code: str = Field(min_length=6, max_length=32)


class UserOut(BaseModel):
    """What the frontend may know about the signed-in person."""

    id: uuid.UUID
    username: str
    display_name: str
    email: str
    role: str  # "admin" or "editor": decides which menus the website shows


class SessionOut(BaseModel):
    authenticated: bool
    mfa_pending: bool = False
    user: UserOut | None = None
    # The frontend must send this back in the X-CSRF-Token header on changes.
    csrf_token: str | None = None
    expires_at: datetime | None = None
