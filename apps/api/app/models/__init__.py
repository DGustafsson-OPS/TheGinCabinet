"""Database tables, one Python class per table.

Importing them all here means ``from app.models import User`` works, and that
Alembic sees every table when it compares models to the database.
"""

from app.models.audit import AuditEvent
from app.models.auth import AuthSession, LoginAttempt, RecoveryCode
from app.models.collection import Collection
from app.models.user import User

__all__ = ["AuditEvent", "AuthSession", "Collection", "LoginAttempt", "RecoveryCode", "User"]
