"""Physical bottles and their history (spec §5 A03, §6 "Consume bottle", §7).

Each real bottle on the shelf has its own row and UUID. Bottles are never
deleted: finishing, gifting or throwing one away is a *status change*, and
every change is logged in ``bottle_events`` so the history is kept.
"""

import uuid
from datetime import date, datetime
from enum import StrEnum

from sqlalchemy import CheckConstraint, Date, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models._mixins import Versioned
from app.models._types import UTCDateTime, UUIDType, new_uuid, utcnow
from app.models.catalogue import GinProduct


class BottleStatus(StrEnum):
    SEALED = "sealed"
    OPEN = "open"
    EMPTY = "empty"
    GIFTED = "gifted"
    DISPOSED = "disposed"


# Which status changes are allowed: a dictionary mapping "from" to a set of "to".
# Empty, gifted and disposed are final: those bottles have left the cabinet.
ALLOWED_TRANSITIONS: dict[BottleStatus, set[BottleStatus]] = {
    BottleStatus.SEALED: {BottleStatus.OPEN, BottleStatus.GIFTED, BottleStatus.DISPOSED},
    BottleStatus.OPEN: {BottleStatus.EMPTY, BottleStatus.GIFTED, BottleStatus.DISPOSED},
    BottleStatus.EMPTY: set(),
    BottleStatus.GIFTED: set(),
    BottleStatus.DISPOSED: set(),
}

# Bottles that are physically in the collection right now.
IN_CABINET = (BottleStatus.SEALED, BottleStatus.OPEN)


class Bottle(Versioned, Base):
    __tablename__ = "bottles"
    __table_args__ = (
        CheckConstraint("size_ml > 0", name="size_positive"),
        # Spec §7: "bottle remaining_ml between 0 and size_ml".
        CheckConstraint(
            "remaining_ml IS NULL OR (remaining_ml >= 0 AND remaining_ml <= size_ml)",
            name="remaining_in_range",
        ),
        CheckConstraint(
            "status IN ('sealed', 'open', 'empty', 'gifted', 'disposed')", name="status_valid"
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUIDType, primary_key=True, default=new_uuid)
    collection_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("collections.id"), index=True)
    gin_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("gin_products.id", ondelete="RESTRICT"), index=True
    )
    size_ml: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(16), default=BottleStatus.SEALED, index=True)
    # Approximate amount left. Set when opened, updated now and then (spec §6).
    remaining_ml: Mapped[int | None] = mapped_column(Integer, nullable=True)
    shelf: Mapped[str | None] = mapped_column(String(80), nullable=True)
    purchase_line_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("purchase_lines.id", ondelete="SET NULL"), nullable=True, index=True
    )
    # Where it came from when there is no purchase: "gift", "inherited", ...
    source: Mapped[str | None] = mapped_column(String(80), nullable=True)
    acquired_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    opened_at: Mapped[date | None] = mapped_column(Date, nullable=True)
    finished_at: Mapped[date | None] = mapped_column(Date, nullable=True)
    comments: Mapped[str | None] = mapped_column(Text, nullable=True)

    gin: Mapped[GinProduct] = relationship(lazy="joined")
    events: Mapped[list["BottleEvent"]] = relationship(
        back_populates="bottle", order_by="BottleEvent.occurred_at", lazy="selectin"
    )


class BottleEvent(Base):
    """One entry in a bottle's history: "opened", "level 400 ml", "emptied"..."""

    __tablename__ = "bottle_events"

    id: Mapped[uuid.UUID] = mapped_column(UUIDType, primary_key=True, default=new_uuid)
    bottle_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("bottles.id", ondelete="CASCADE"), index=True
    )
    actor_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    from_status: Mapped[str | None] = mapped_column(String(16), nullable=True)
    to_status: Mapped[str] = mapped_column(String(16))
    remaining_ml: Mapped[int | None] = mapped_column(Integer, nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    occurred_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)

    bottle: Mapped[Bottle] = relationship(back_populates="events")
