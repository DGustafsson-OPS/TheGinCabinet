"""Symmetric encryption for secrets stored in the database (spec §7 ``totp_secret_encrypted``).

Unlike passwords (hashed = one-way), the TOTP secret must be *readable* again
to check codes, so we encrypt it (two-way) with a key derived from
``GC_SECRET_KEY``. ``Fernet`` from the ``cryptography`` library handles
encryption plus tamper detection for us.
"""

import base64
import hashlib

from cryptography.fernet import Fernet

from app.config import get_settings


def _fernet() -> Fernet:
    # Fernet needs exactly 32 bytes, base64-encoded. SHA-256 turns any secret
    # string into exactly 32 bytes.
    digest = hashlib.sha256(get_settings().secret_key.encode()).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def encrypt(plaintext: str) -> str:
    return _fernet().encrypt(plaintext.encode()).decode()


def decrypt(token: str) -> str:
    return _fernet().decrypt(token.encode()).decode()
