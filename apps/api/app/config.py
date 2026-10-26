"""Application configuration.

All settings come from environment variables (or a local ``.env`` file), never
from values hard-coded in Git. This follows spec §9 and §10B: secrets
live in Coolify's secret store in production.

``pydantic-settings`` reads each field below from an environment variable with
the same name in upper case, prefixed with ``GC_``. For example,
``database_url`` is read from ``GC_DATABASE_URL``. It also converts the text
to the right type (e.g. ``"true"`` -> ``True``) and fails loudly if a required
value is missing.
"""

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="GC_", env_file=".env", extra="ignore")

    # "development" or "production". Production turns on stricter defaults.
    environment: str = "development"

    # Example: postgresql+psycopg://gin:password@db:5432/gin_cabinet
    database_url: str = "sqlite:///./gin_cabinet.db"

    # Used to encrypt TOTP secrets at rest. Must be long and random in production.
    # Generate one with:  python -c "import secrets; print(secrets.token_urlsafe(48))"
    secret_key: str = Field(default="dev-only-insecure-secret-key-change-me", min_length=32)

    # --- Session cookie (spec §9: Secure / HttpOnly / SameSite) ---
    session_cookie_name: str = "gc_session"
    # Must be True in production (HTTPS only). False lets you test on http://localhost.
    cookie_secure: bool = False
    # Log out after this many minutes without activity...
    session_idle_minutes: int = 30
    # ...and always after this many hours, even if active.
    session_absolute_hours: int = 12
    # How long a user has to enter their MFA code after the password step.
    mfa_pending_minutes: int = 5

    # --- Login throttling (spec §9) ---
    login_max_attempts: int = 5
    login_window_minutes: int = 15

    # Origins allowed to send state-changing requests (CSRF origin check).
    # Comma-separated, e.g. "https://gincabinet.example.com".
    allowed_origins: str = "http://localhost:3000"

    # Name shown in authenticator apps next to the 6-digit code.
    totp_issuer: str = "The Gin Cabinet"

    @property
    def allowed_origin_list(self) -> list[str]:
        """Turn the comma-separated string into a clean Python list."""
        return [o.strip().rstrip("/") for o in self.allowed_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    """Return the settings, building them only once.

    ``@lru_cache`` remembers the return value, so environment variables are
    read a single time and every part of the app shares one object.
    """
    return Settings()
