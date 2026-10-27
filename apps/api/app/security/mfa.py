"""Multi-factor authentication: TOTP codes and recovery codes (spec §9).

TOTP ("Time-based One-Time Password") is the 6-digit code shown in apps such
as 1Password, Google Authenticator or Authy. The server and the app share a
secret; both compute the same code from that secret plus the current time.

Recovery codes are single-use backups for when the phone is lost. Like
passwords, we store only their hashes.
"""

import hmac
import secrets
import time

import pyotp

from app.security.passwords import hash_password, verify_password

RECOVERY_CODE_COUNT = 10


def new_totp_secret() -> str:
    return pyotp.random_base32()


def provisioning_uri(secret: str, username: str, issuer: str) -> str:
    """The ``otpauth://`` link an authenticator app understands (often shown as a QR code)."""
    return pyotp.TOTP(secret).provisioning_uri(name=username, issuer_name=issuer)


TOTP_PERIOD = 30  # seconds per code


def totp_step(secret: str, code: str, now: float | None = None) -> int | None:
    """Return the 30-second "step" (window number) this code belongs to, or None.

    Like ``verify_totp`` it also accepts the previous and next window, for small
    clock differences. Knowing the step lets the caller refuse a code that was
    already used (a "replay"): see ``auth._check_mfa_code``.
    """
    code = code.strip().replace(" ", "")
    totp = pyotp.TOTP(secret)
    current = int((now if now is not None else time.time()) // TOTP_PERIOD)
    for step in (current, current - 1, current + 1):
        # compare_digest takes the same time whether the codes match or not.
        if hmac.compare_digest(totp.at(step * TOTP_PERIOD), code):
            return step
    return None


def verify_totp(secret: str, code: str) -> bool:
    # valid_window=1 also accepts the previous/next 30-second code, which
    # tolerates small clock differences between phone and server.
    return pyotp.TOTP(secret).verify(code.strip().replace(" ", ""), valid_window=1)


def new_recovery_codes() -> list[str]:
    """Generate human-friendly codes like ``a1b2c-3d4e5``."""
    codes = []
    for _ in range(RECOVERY_CODE_COUNT):
        raw = secrets.token_hex(5)  # 10 random hex characters
        codes.append(f"{raw[:5]}-{raw[5:]}")
    return codes


def normalise_recovery_code(code: str) -> str:
    return code.strip().lower().replace(" ", "")


def hash_recovery_code(code: str) -> str:
    return hash_password(normalise_recovery_code(code))


def verify_recovery_code(code_hash: str, code: str) -> bool:
    return verify_password(code_hash, normalise_recovery_code(code))
