"""Proof of cookie consent (GDPR art. 7(1): "able to demonstrate that the data
subject has consented").

Every time a visitor answers the cookie banner, the website records one row:
a random consent ID (the same ID is stored in the visitor's ``gc_consent``
cookie), the policy version they saw, what they allowed, and when.

Deliberately **no** IP address, user agent or other personal data: the random
ID alone links a record to a browser, and only the visitor holds it.
"""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models._types import UTCDateTime, UUIDType, new_uuid, utcnow


class ConsentRecord(Base):
    __tablename__ = "consent_records"
    __table_args__ = (Index("ix_consent_records_recorded_at", "recorded_at"),)

    id: Mapped[uuid.UUID] = mapped_column(UUIDType, primary_key=True, default=new_uuid)
    consent_id: Mapped[str] = mapped_column(String(64), index=True)
    policy_version: Mapped[int] = mapped_column(Integer)
    # How they answered: "accept_all", "reject_all", "custom" (chose per category).
    action: Mapped[str] = mapped_column(String(16))
    analytics: Mapped[bool] = mapped_column(Boolean)
    recorded_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
