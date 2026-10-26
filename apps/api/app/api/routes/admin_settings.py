"""Settings & admins (spec §5 A10).

* ``/admin/settings``: website name, tagline, logo, contact, default gin visibility.
* ``/admin/profile``: your own name, email, password, MFA and recovery codes.
* ``/admin/admins``: both admin accounts, and a deliberate, audited way to
  reset the *other* admin's password.

Rules from the spec: there are no public sign-ups, and one admin can't reset
the other "silently": it needs your password, the other admin's username typed
out, an audit event, and the other admin sees a notice on their profile.
Losing your phone and recovery codes is handled on the server with
``python -m app.cli reset-mfa`` (see the README).
"""

import uuid
from datetime import timedelta

from fastapi import APIRouter, Request
from sqlalchemy import func, select, update

from app.api.deps import CurrentAdmin, CurrentAdminWrite, DbSession, client_ip
from app.config import get_settings
from app.errors import ApiError
from app.models import AuditEvent, AuthSession, RecoveryCode, User
from app.models._types import utcnow
from app.schemas.settings import (
    AdminAccount,
    MfaConfirm,
    MfaSetupOut,
    PasswordChange,
    PasswordConfirm,
    ProfileOut,
    ProfilePatch,
    RecoveryCodesOut,
    ResetOtherPassword,
    SecurityNotice,
    SiteSettingsOut,
    SiteSettingsPatch,
)
from app.security import crypto, mfa
from app.security.passwords import hash_password, password_problems, verify_password
from app.services import audit, sessions
from app.services.common import apply_patch, get_or_404
from app.services.editorial import check_cover, media_summary
from app.services.site import get_site_settings
from app.services.versioning import check_version

router = APIRouter(prefix="/admin", tags=["admin: settings"])

NOTICE_DAYS = 90
# Things another admin can do to your account; you'll see them on your profile.
NOTICE_ACTIONS = ("user.password_reset_by_admin",)


# ---------------- Website settings ----------------


def _settings_out(row) -> SiteSettingsOut:
    return SiteSettingsOut(
        site_name=row.site_name,
        tagline=row.tagline,
        meta_description=row.meta_description,
        contact_email=row.contact_email,
        logo_media_id=row.logo_media_id,
        logo=media_summary(row.logo),
        default_gin_public=row.default_gin_public,
        about_text=row.about_text,
        version=row.version,
        updated_at=row.updated_at,
    )


@router.get("/settings", response_model=SiteSettingsOut)
def get_site(admin: CurrentAdmin, db: DbSession):
    row = get_site_settings(db)
    db.commit()  # saves the row if it was just created
    return _settings_out(row)


@router.patch("/settings", response_model=SiteSettingsOut)
def update_site(body: SiteSettingsPatch, admin: CurrentAdminWrite, db: DbSession):
    row = get_site_settings(db)
    changes = body.model_dump(exclude_unset=True)
    check_version(
        current_version=row.version,
        sent_version=changes.pop("version"),
        force=False,
        changes=changes,
        current=_settings_out(row),
    )
    if "logo_media_id" in changes:
        check_cover(db, changes["logo_media_id"])
    apply_patch(row, changes, never_empty={"site_name", "default_gin_public"})
    audit.record(
        db,
        action="settings.update",
        entity_type="settings",
        actor_id=admin.user.id,
        summary={"fields": sorted(changes)},
    )
    db.commit()
    db.refresh(row)
    return _settings_out(row)


# ---------------- Your profile ----------------


def _require_password(user: User, password: str | None) -> None:
    if not password or not verify_password(user.password_hash, password):
        raise ApiError(403, "wrong_password", "Your current password is not correct.")


def _check_new_password(password: str, username: str) -> None:
    problems = password_problems(password, username)
    if problems:
        raise ApiError(422, "weak_password", "Choose a stronger password.", problems)


def _revoke_other_sessions(db, user: User, keep: AuthSession) -> None:
    """Sign out everywhere except this browser (after a password or MFA change)."""
    db.execute(
        update(AuthSession)
        .where(
            AuthSession.user_id == user.id,
            AuthSession.id != keep.id,
            AuthSession.revoked_at.is_(None),
        )
        .values(revoked_at=utcnow())
    )


def _new_recovery_codes(db, user: User) -> list[str]:
    for old in db.scalars(select(RecoveryCode).where(RecoveryCode.user_id == user.id)):
        db.delete(old)
    codes = mfa.new_recovery_codes()
    for code in codes:
        db.add(RecoveryCode(user_id=user.id, code_hash=mfa.hash_recovery_code(code)))
    return codes


def _profile_out(db, user: User) -> ProfileOut:
    left = db.scalar(
        select(func.count())
        .select_from(RecoveryCode)
        .where(RecoveryCode.user_id == user.id, RecoveryCode.used_at.is_(None))
    )
    since = utcnow() - timedelta(days=NOTICE_DAYS)
    events = db.scalars(
        select(AuditEvent)
        .where(
            AuditEvent.entity_type == "user",
            AuditEvent.entity_id == str(user.id),
            AuditEvent.action.in_(NOTICE_ACTIONS),
            AuditEvent.occurred_at >= since,
        )
        .order_by(AuditEvent.occurred_at.desc())
    ).all()
    names = {u.id: u.display_name for u in db.scalars(select(User))}
    return ProfileOut(
        id=user.id,
        username=user.username,
        email=user.email,
        display_name=user.display_name,
        last_login_at=user.last_login_at,
        recovery_codes_left=left or 0,
        mfa_setup_pending=user.totp_pending_encrypted is not None,
        notices=[
            SecurityNotice(
                action=e.action, by=names.get(e.actor_id, "a former admin"), at=e.occurred_at
            )
            for e in events
        ],
    )


@router.get("/profile", response_model=ProfileOut)
def get_profile(admin: CurrentAdmin, db: DbSession):
    return _profile_out(db, admin.user)


@router.patch("/profile", response_model=ProfileOut)
def update_profile(body: ProfilePatch, admin: CurrentAdminWrite, db: DbSession):
    user = admin.user
    changes = body.model_dump(exclude_unset=True, exclude={"current_password"})
    if changes.get("email") and changes["email"].lower() != user.email.lower():
        _require_password(user, body.current_password)
        taken = db.scalar(
            select(User).where(
                func.lower(User.email) == changes["email"].lower(), User.id != user.id
            )
        )
        if taken:
            raise ApiError(422, "email_taken", "The other admin already uses that email address.")
        changes["email"] = changes["email"].strip()
    for field, value in changes.items():
        if value:
            setattr(user, field, value)
    audit.record(
        db,
        action="user.profile_update",
        entity_type="user",
        entity_id=user.id,
        actor_id=user.id,
        summary={"fields": sorted(changes)},
    )
    db.commit()
    return _profile_out(db, user)


@router.post("/profile/password", status_code=204)
def change_password(
    body: PasswordChange, request: Request, admin: CurrentAdminWrite, db: DbSession
):
    user = admin.user
    _require_password(user, body.current_password)
    _check_new_password(body.new_password, user.username)
    user.password_hash = hash_password(body.new_password)
    _revoke_other_sessions(db, user, admin.session)
    audit.record(
        db,
        action="user.password_change",
        entity_type="user",
        entity_id=user.id,
        actor_id=user.id,
        ip_address=client_ip(request),
    )
    db.commit()


@router.post("/profile/recovery-codes", response_model=RecoveryCodesOut)
def regenerate_recovery_codes(body: PasswordConfirm, admin: CurrentAdminWrite, db: DbSession):
    """New recovery codes (the old ones stop working). Shown once."""
    user = admin.user
    _require_password(user, body.current_password)
    codes = _new_recovery_codes(db, user)
    audit.record(
        db, action="user.recovery_codes", entity_type="user", entity_id=user.id, actor_id=user.id
    )
    db.commit()
    return RecoveryCodesOut(codes=codes)


@router.post("/profile/mfa/start", response_model=MfaSetupOut)
def start_mfa_change(body: PasswordConfirm, admin: CurrentAdminWrite, db: DbSession):
    """Step 1 of moving MFA to a new phone: a new secret, not active yet."""
    user = admin.user
    _require_password(user, body.current_password)
    secret = mfa.new_totp_secret()
    user.totp_pending_encrypted = crypto.encrypt(secret)
    db.commit()
    return MfaSetupOut(
        secret=secret, uri=mfa.provisioning_uri(secret, user.username, get_settings().totp_issuer)
    )


@router.post("/profile/mfa/confirm", response_model=RecoveryCodesOut)
def confirm_mfa_change(body: MfaConfirm, admin: CurrentAdminWrite, db: DbSession):
    """Step 2: a code from the new app proves it works; then it replaces the old one."""
    user = admin.user
    if user.totp_pending_encrypted is None:
        raise ApiError(409, "no_mfa_setup", "Start the authenticator change first.")
    if not mfa.verify_totp(crypto.decrypt(user.totp_pending_encrypted), body.code):
        raise ApiError(422, "invalid_mfa_code", "That code is not valid. Check the new app's code.")
    user.totp_secret_encrypted = user.totp_pending_encrypted
    user.totp_pending_encrypted = None
    codes = _new_recovery_codes(db, user)
    _revoke_other_sessions(db, user, admin.session)
    audit.record(
        db, action="user.mfa_change", entity_type="user", entity_id=user.id, actor_id=user.id
    )
    db.commit()
    return RecoveryCodesOut(codes=codes)


@router.delete("/profile/mfa/start", status_code=204)
def cancel_mfa_change(admin: CurrentAdminWrite, db: DbSession):
    admin.user.totp_pending_encrypted = None
    db.commit()


# ---------------- The admins ----------------


@router.get("/admins", response_model=list[AdminAccount])
def list_admin_accounts(admin: CurrentAdmin, db: DbSession):
    users = db.scalars(select(User).order_by(User.created_at))
    return [
        AdminAccount.model_validate(u).model_copy(update={"is_you": u.id == admin.user.id})
        for u in users
    ]


@router.post("/admins/{user_id}/reset-password", status_code=204)
def reset_other_password(
    user_id: uuid.UUID,
    body: ResetOtherPassword,
    request: Request,
    admin: CurrentAdminWrite,
    db: DbSession,
):
    """Give the other admin a temporary password (spec A10: confirmed and audited).

    Their sessions end everywhere, and they see who did it on their profile.
    """
    target = get_or_404(db, User, user_id, "Admin")
    if target.id == admin.user.id:
        raise ApiError(422, "use_profile", "Change your own password on your profile instead.")
    _require_password(admin.user, body.current_password)
    if body.confirm_username.strip().lower() != target.username:
        raise ApiError(
            422, "confirmation_mismatch", f"Type {target.username!r} exactly to confirm."
        )
    _check_new_password(body.new_password, target.username)
    target.password_hash = hash_password(body.new_password)
    sessions.revoke_all_for_user(db, target)
    audit.record(
        db,
        action="user.password_reset_by_admin",
        entity_type="user",
        entity_id=target.id,
        actor_id=admin.user.id,
        summary={"target": target.username},
        ip_address=client_ip(request),
    )
    db.commit()
