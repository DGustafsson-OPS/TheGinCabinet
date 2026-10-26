"""Small helpers shared by the model files.

Spec §7 says "use UTC timestamps", so every timestamp is created by ``utcnow``
and stored in a timezone-aware column.
"""

import uuid
from datetime import UTC, datetime

from sqlalchemy import JSON, DateTime, Uuid
from sqlalchemy.dialects.postgresql import JSONB

# JSONB on PostgreSQL (fast, indexable); plain JSON on SQLite for local tests.
JSONType = JSON().with_variant(JSONB(), "postgresql")

# Timezone-aware timestamp column type.
UTCDateTime = DateTime(timezone=True)

UUIDType = Uuid


def new_uuid() -> uuid.UUID:
    return uuid.uuid4()


def utcnow() -> datetime:
    """Current time in UTC (timezone-aware)."""
    return datetime.now(UTC)


def as_utc(value: datetime) -> datetime:
    """Make sure a datetime is timezone-aware UTC.

    SQLite (only used in tests) forgets the timezone when it stores a value, so
    we add it back before comparing with ``utcnow()``. On PostgreSQL this
    does nothing.
    """
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)
