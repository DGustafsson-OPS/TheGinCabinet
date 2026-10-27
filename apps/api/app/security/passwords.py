"""Password hashing with Argon2id (spec §9).

We never store passwords. We store a *hash*: a one-way scrambled version.
At login we hash what the user typed and compare. Argon2id is deliberately
slow and memory-hungry, which makes guessing millions of passwords expensive
for an attacker.
"""

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError

# argon2-cffi uses Argon2id with sensible, modern parameters by default.
_hasher = PasswordHasher()

MIN_PASSWORD_LENGTH = 12
MAX_PASSWORD_LENGTH = 256

# A precomputed hash used when the username does not exist. Checking against it
# takes the same time as a real check, so an attacker can't tell from the
# response time whether a username exists.
_DUMMY_HASH = _hasher.hash("timing-equaliser-not-a-real-password")


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password_hash: str | None, password: str) -> bool:
    """Return True if ``password`` matches the stored hash."""
    try:
        return _hasher.verify(password_hash or _DUMMY_HASH, password) and password_hash is not None
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


def password_problems(password: str, username: str = "") -> list[str]:
    """Check a new password against our passphrase policy.

    Returns a list of human-readable problems; an empty list means "OK".
    A list (instead of True/False) lets us tell the user *everything* to fix.
    """
    problems: list[str] = []
    if len(password) < MIN_PASSWORD_LENGTH:
        problems.append(f"Use at least {MIN_PASSWORD_LENGTH} characters (a passphrase is best).")
    if len(password) > MAX_PASSWORD_LENGTH:
        problems.append(f"Use at most {MAX_PASSWORD_LENGTH} characters.")
    if len(set(password)) < 5:
        problems.append("Use more varied characters.")
    if username and username.lower() in password.lower():
        problems.append("Do not include your username in the password.")
    return problems
