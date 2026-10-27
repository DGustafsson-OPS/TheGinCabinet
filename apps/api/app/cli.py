"""Administrator command-line tool (spec §10B step 5, §5 A10).

There is deliberately no sign-up page. Admins are created by someone with
server access, e.g. in Coolify's terminal for the API container::

    python -m app.cli create-admin --username anna --email anna@example.com --display-name "Anna"
    python -m app.cli reset-password --username anna
    python -m app.cli reset-mfa --username anna
    python -m app.cli list-admins

``python -m app.cli`` runs this file as a program. Passwords are typed at a
hidden prompt (``getpass``) so they never appear in shell history.

Every command writes an audit event, so one admin can't silently reset the
other (spec A10).
"""

import argparse
import getpass
import sys

from sqlalchemy import func, select

from app.config import get_settings
from app.db import SessionLocal
from app.models import MAX_ADMINS, RecoveryCode, User, UserRole
from app.security import crypto, mfa
from app.security.passwords import hash_password, password_problems
from app.services import audit, sessions


def _prompt_password(username: str) -> str:
    while True:
        first = getpass.getpass("New password: ")
        problems = password_problems(first, username)
        if problems:
            print("\n".join(f"  - {p}" for p in problems))
            continue
        if getpass.getpass("Repeat password: ") != first:
            print("  - Passwords do not match.")
            continue
        return first


def _enrol_mfa(db, user: User) -> None:
    """Give the user a fresh TOTP secret and recovery codes, and print them ONCE."""
    secret = mfa.new_totp_secret()
    user.totp_secret_encrypted = crypto.encrypt(secret)

    # Replace any old recovery codes.
    for old in db.scalars(select(RecoveryCode).where(RecoveryCode.user_id == user.id)):
        db.delete(old)
    codes = mfa.new_recovery_codes()
    for code in codes:
        db.add(RecoveryCode(user_id=user.id, code_hash=mfa.hash_recovery_code(code)))

    uri = mfa.provisioning_uri(secret, user.username, get_settings().totp_issuer)
    print("\n=== MFA setup: shown only once, store safely ===")
    print("Add this to your authenticator app (paste the link, or the key manually):")
    print(f"  Link: {uri}")
    print(f"  Key:  {secret}")
    print("Recovery codes (each works once if you lose your phone):")
    for code in codes:
        print(f"  {code}")
    print("================================================\n")


def _get_user(db, username: str) -> User:
    user = db.scalar(select(User).where(User.username == username.lower()))
    if user is None:
        sys.exit(f"No admin called {username!r}.")
    return user


def create_admin(args: argparse.Namespace) -> None:
    with SessionLocal() as db:
        admins = db.scalar(
            select(func.count()).select_from(User).where(User.role == UserRole.ADMIN)
        )
        if (admins or 0) >= MAX_ADMINS:
            sys.exit(
                f"There are already {MAX_ADMINS} admins. Editors are invited from the website."
            )
        username = args.username.strip().lower()
        if db.scalar(select(User).where(User.username == username)):
            sys.exit(f"Username {username!r} is taken.")
        if db.scalar(select(User).where(User.email == args.email.lower())):
            sys.exit(f"Email {args.email!r} is already used.")

        user = User(
            username=username,
            email=args.email.strip().lower(),
            display_name=args.display_name.strip(),
            password_hash=hash_password(_prompt_password(username)),
            role=UserRole.ADMIN,
        )
        db.add(user)
        db.flush()  # sends the INSERT now, so user.id is available below
        _enrol_mfa(db, user)
        audit.record(
            db,
            action="user.create",
            entity_type="user",
            entity_id=user.id,
            summary={"username": username, "via": "cli"},
        )
        db.commit()
        print(f"Created admin {username!r}.")


def reset_password(args: argparse.Namespace) -> None:
    with SessionLocal() as db:
        user = _get_user(db, args.username)
        user.password_hash = hash_password(_prompt_password(user.username))
        sessions.revoke_all_for_user(db, user)  # log out everywhere
        audit.record(
            db,
            action="user.password_reset",
            entity_type="user",
            entity_id=user.id,
            summary={"via": "cli"},
        )
        db.commit()
        print(f"Password reset for {user.username!r}; all their sessions were signed out.")


def reset_mfa(args: argparse.Namespace) -> None:
    with SessionLocal() as db:
        user = _get_user(db, args.username)
        _enrol_mfa(db, user)
        sessions.revoke_all_for_user(db, user)
        audit.record(
            db,
            action="user.mfa_reset",
            entity_type="user",
            entity_id=user.id,
            summary={"via": "cli"},
        )
        db.commit()
        print(f"MFA reset for {user.username!r}; all their sessions were signed out.")


def list_admins(_: argparse.Namespace) -> None:
    with SessionLocal() as db:
        for user in db.scalars(select(User).order_by(User.created_at)):
            state = "enabled" if user.enabled else "disabled"
            print(f"{user.username:<20} {user.email:<35} {state}  last login: {user.last_login_at}")


def run_jobs_command(_: argparse.Namespace) -> None:
    from app.services.maintenance import run_jobs

    with SessionLocal() as db:
        published = run_jobs(db)
    print(f"Done. Published {published} scheduled article(s).")


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="python -m app.cli", description=__doc__.split("\n")[0])
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("create-admin", help="Create one of the two admin accounts")
    p.add_argument("--username", required=True)
    p.add_argument("--email", required=True)
    p.add_argument("--display-name", required=True)
    p.set_defaults(func=create_admin)

    p = sub.add_parser("reset-password", help="Set a new password for an admin")
    p.add_argument("--username", required=True)
    p.set_defaults(func=reset_password)

    p = sub.add_parser("reset-mfa", help="Issue a new MFA secret and recovery codes")
    p.add_argument("--username", required=True)
    p.set_defaults(func=reset_mfa)

    p = sub.add_parser("list-admins", help="Show admin accounts")
    p.set_defaults(func=list_admins)

    p = sub.add_parser("run-jobs", help="Publish due scheduled articles and tidy old sign-ins")
    p.set_defaults(func=run_jobs_command)

    args = parser.parse_args(argv)
    args.func(args)  # call the function chosen by set_defaults above


# This block only runs when the file is executed directly, not when imported.
if __name__ == "__main__":
    main()
