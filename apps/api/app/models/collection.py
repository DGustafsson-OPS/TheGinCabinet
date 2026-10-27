"""The ``collections`` table.

Spec §1: "Exactly one shared collection". The migration seeds that single row;
later tables such as ``bottles`` point to it with ``collection_id``.
"""

import uuid
from datetime import datetime

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models._types import UTCDateTime, UUIDType, new_uuid, utcnow


class Collection(Base):
    __tablename__ = "collections"

    id: Mapped[uuid.UUID] = mapped_column(UUIDType, primary_key=True, default=new_uuid)
    name: Mapped[str] = mapped_column(String(120))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
