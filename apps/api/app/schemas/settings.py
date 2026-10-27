"""JSON shapes for Settings & admins (spec §5 A10)."""

import uuid
from datetime import datetime
from typing import Annotated, Literal

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


class PublicSite(BaseModel):
    """What the public website needs: no admin data at all."""

    site_name: str
    tagline: str | None
    meta_description: str | None
    contact_email: str | None
    logo: MediaSummary | None
    # The editable page texts (Admin → Page texts), with defaults filled in.
    texts: dict[str, str]
    # Whether the contact form is switched on (Cloudflare Turnstile keys set).
    contact_form: bool
    # Whether any Gin guide page is published (the menu shows "Gin guide" only then).
    has_guide: bool = False


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
    role: str
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
    role: str
    enabled: bool
    last_login_at: datetime | None
    # Invited, but hasn't set a password and authenticator yet.
    invite_pending: bool
    invite_expires_at: datetime | None
    is_you: bool = False


Username = Annotated[str, Field(min_length=3, max_length=64, pattern=r"^[a-zA-Z0-9._-]+$")]
Role = Literal["admin", "editor"]


class AccountInvite(BaseModel):
    """Invite someone: they choose their own password and authenticator."""

    username: Username
    display_name: str = Field(min_length=1, max_length=120)
    email: Email
    role: Role = "editor"


class InviteOut(BaseModel):
    account: AdminAccount
    # The one-time link's path, e.g. /welcome/abc… (shown once; only its hash is stored).
    invite_path: str
    expires_at: datetime


class AccountPatch(BaseModel):
    """An admin changing someone else's account."""

    display_name: str | None = Field(default=None, min_length=1, max_length=120)
    email: Email | None = None
    role: Role | None = None
    enabled: bool | None = None
    # Your own password: needed for anything but the display name.
    current_password: str | None = Field(default=None, max_length=256)


class ResetOtherPassword(BaseModel):
    """Resetting the *other* admin's password needs three deliberate inputs."""

    current_password: str = Field(min_length=1, max_length=256)  # yours
    confirm_username: str = Field(min_length=1, max_length=64)  # theirs, typed out
    new_password: str = Field(min_length=1, max_length=256)  # a temporary one to hand over


# ---------------- Accepting an invitation (no sign-in) ----------------


class InviteInfo(BaseModel):
    username: str
    display_name: str
    role: str
    expires_at: datetime


class InvitePassword(BaseModel):
    """Step 1: the chosen password, checked before the authenticator key is given."""

    password: str = Field(min_length=1, max_length=256)


class InviteComplete(BaseModel):
    password: str = Field(min_length=1, max_length=256)
    code: str = Field(min_length=6, max_length=12)  # from the new authenticator app
