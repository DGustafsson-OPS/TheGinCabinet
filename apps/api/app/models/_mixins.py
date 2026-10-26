"""Reusable column sets ("mixins") shared by many tables.

A mixin is a class you inherit from *in addition to* ``Base`` to copy its
columns into your table::

    class GinProduct(Versioned, Base): ...
"""

from datetime import datetime

from sqlalchemy import Integer
from sqlalchemy.orm import Mapped, declared_attr, mapped_column

from app.models._types import UTCDateTime, utcnow


class Versioned:
    """Timestamps plus an optimistic-locking ``version`` number (spec §6).

    Every UPDATE that SQLAlchemy sends becomes
    ``UPDATE ... SET version = 4 WHERE id = ? AND version = 3``. If another
    admin saved in between, the version is already 4, no row matches, and
    SQLAlchemy raises ``StaleDataError`` instead of silently overwriting.
    """

    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, onupdate=utcnow)
    version: Mapped[int] = mapped_column(Integer, nullable=False)

    # `declared_attr` runs once per subclass, so each table points at its own
    # `version` column.
    @declared_attr.directive
    def __mapper_args__(cls) -> dict:
        return {"version_id_col": cls.version}
