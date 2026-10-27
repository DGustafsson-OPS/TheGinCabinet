"""Random tokens for session cookies and CSRF protection."""

import hashlib
import hmac
import secrets


def new_token() -> str:
    """A long random string that is unguessable (256 bits of randomness)."""
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    """SHA-256 of a session token. Fine here (unlike for passwords) because the
    token is already long and random, so it can't be guessed."""
    return hashlib.sha256(token.encode()).hexdigest()


def tokens_match(a: str | None, b: str | None) -> bool:
    """Compare two secrets in constant time, so response timing reveals nothing."""
    if not a or not b:
        return False
    return hmac.compare_digest(a.encode(), b.encode())
