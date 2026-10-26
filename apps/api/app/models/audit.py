"""The ``audit_events`` table (spec §7, §9).

Every important action (sign-in, publishing, inventory changes, deletions) adds
a row here, so you can always see *which* administrator did *what* and *when*.
"""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models._types import JSONType, UTCDateTime, UUIDType, new_uuid, utcnow


class AuditEvent(Base):
    __tablename__ = "audit_events"
    __table_args__ = (Index("ix_audit_events_entity", "entity_type", "entity_id"),)

    id: Mapped[uuid.UUID] = mapped_column(UUIDType, primary_key=True, default=new_uuid)
    # Nullable because some events have no known user (e.g. a failed login).
    actor_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    entity_type: Mapped[str] = mapped_column(String(64))  # e.g. "user", "gin", "review"
    entity_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    action: Mapped[str] = mapped_column(String(64))  # e.g. "auth.login", "review.publish"
    occurred_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, index=True)
    # A *safe* summary: never passwords, tokens or secrets.
    summary: Mapped[dict[str, Any]] = mapped_column(JSONType, default=dict)
    ip_address: Mapped[str | None] = mapped_column(String(64), nullable=True)
