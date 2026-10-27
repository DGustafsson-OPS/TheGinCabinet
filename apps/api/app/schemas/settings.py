"""JSON shapes for Settings & admins (spec §5 A10)."""

import uuid
from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.common import MediaSummary

# A light check ("something@something.something"); good enough to catch typos
# without an extra library. Real proof would need a confirmation email.
Email = Annotated[str, Field(max_length=254, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")]

# ---------------- Website settings ----------------


class SiteSettingsOut(BaseModel):
    site_name: str
    tagline: str | None
    meta_description: str | None
    contact_email: str | None
    logo_media_id: uuid.UUID | None
    logo: MediaSummary | None
    default_gin_public: bool
    about_text: str | None
    version: int
    updated_at: datetime


class SiteSettingsPatch(BaseModel):
    version: int
    site_name: str | None = Field(default=None, min_length=1, max_length=80)
    tagline: str | None = Field(default=None, max_length=200)
    meta_description: str | None = Field(default=None, max_length=170)
    contact_email: Email | None = None
    logo_media_id: uuid.UUID | None = None
    default_gin_public: bool | None = None
    about_text: str | None = Field(default=None, max_length=10_000)


class PublicSite(BaseModel):
    """What the public website needs: no admin data at all."""

    site_name: str
    tagline: str | None
    meta_description: str | None
    contact_email: str | None
    logo: MediaSummary | None
    about_text: str | None


# ---------------- Your own profile ----------------


class SecurityNotice(BaseModel):
    """Something another admin did to your account (spec A10 "not silently")."""

    action: str
    by: str
    at: datetime


class ProfileOut(BaseModel):
    id: uuid.UUID
    username: str
    email: str
    display_name: str
    last_login_at: datetime | None
    recovery_codes_left: int
    mfa_setup_pending: bool
    notices: list[SecurityNotice]


class ProfilePatch(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=120)
    email: Email | None = None
    # Needed to change the email address (it identifies the account).
    current_password: str | None = Field(default=None, max_length=256)


class PasswordChange(BaseModel):
    current_password: str = Field(min_length=1, max_length=256)
    new_password: str = Field(min_length=1, max_length=256)


class PasswordConfirm(BaseModel):
    current_password: str = Field(min_length=1, max_length=256)


class RecoveryCodesOut(BaseModel):
    """Shown once; only hashes are stored."""

    codes: list[str]


class MfaSetupOut(BaseModel):
    secret: str
    uri: str  # otpauth:// link for authenticator apps


class MfaConfirm(BaseModel):
    code: str = Field(min_length=6, max_length=10)


# ---------------- The admins ----------------


class AdminAccount(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    username: str
    display_name: str
    email: str
    enabled: bool
    last_login_at: datetime | None
    is_you: bool = False


class ResetOtherPassword(BaseModel):
    """Resetting the *other* admin's password needs three deliberate inputs."""

    current_password: str = Field(min_length=1, max_length=256)  # yours
    confirm_username: str = Field(min_length=1, max_length=64)  # theirs, typed out
    new_password: str = Field(min_length=1, max_length=256)  # a temporary one to hand over
